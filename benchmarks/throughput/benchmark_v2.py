#!/usr/bin/env python3
"""Reproducible vLLM benchmark for quality, context, and throughput."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable


HARNESS_VERSION = "2.0.0"
DEFAULT_URL = os.environ.get(
    "BENCH_URL", "http://127.0.1.1:8100/v1/chat/completions"
)
DEFAULT_MODEL = os.environ.get(
    "BENCH_MODEL", "qwen3.6-27b-nvfp4"
)
DEFAULT_OUT = os.environ.get("BENCH_OUT", "/tmp/benchmark_v2.json")
NO_THINKING = {"enable_thinking": False}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def parse_int_csv(value: str) -> list[int]:
    values = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not values or any(item <= 0 for item in values):
        raise argparse.ArgumentTypeError("expected comma-separated positive integers")
    return values


def atomic_write_json(path: str, value: dict[str, Any]) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        prefix=destination.name + ".", suffix=".tmp", dir=destination.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temporary, destination)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def derive_endpoint(chat_url: str, suffix: str) -> str:
    marker = "/v1/chat/completions"
    if marker not in chat_url:
        raise ValueError(
            f"BENCH_URL must contain {marker!r} so vLLM endpoints can be derived"
        )
    return chat_url.split(marker, 1)[0] + suffix


class ApiError(RuntimeError):
    pass


class VllmClient:
    def __init__(self, chat_url: str, model: str, timeout: int = 900):
        self.chat_url = chat_url
        self.model = model
        self.timeout = timeout
        self.render_url = derive_endpoint(chat_url, "/v1/chat/completions/render")
        self.models_url = derive_endpoint(chat_url, "/v1/models")
        self.version_url = derive_endpoint(chat_url, "/version")

    @staticmethod
    def _http_error(error: urllib.error.HTTPError) -> str:
        try:
            body = error.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return f"HTTP {error.code}: {body[:500]}"

    def _post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise ApiError(self._http_error(error)) from error

    def _get(self, url: str) -> dict[str, Any]:
        try:
            with urllib.request.urlopen(url, timeout=min(self.timeout, 30)) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise ApiError(self._http_error(error)) from error

    def chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post(self.chat_url, {"model": self.model, **payload})

    def render_tokens(
        self,
        messages: list[dict[str, str]],
        chat_template_kwargs: dict[str, Any] | None = None,
    ) -> int:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 1,
            "temperature": 0.0,
        }
        if chat_template_kwargs is not None:
            payload["chat_template_kwargs"] = chat_template_kwargs
        response = self._post(self.render_url, payload)
        token_ids = response.get("token_ids")
        if not isinstance(token_ids, list):
            raise ApiError(f"render endpoint returned no token_ids: {response!r}")
        return len(token_ids)

    def metadata(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, url in (("models", self.models_url), ("version", self.version_url)):
            try:
                result[key] = self._get(url)
            except Exception as error:
                result[key] = {"error": str(error)}
        return result

    def stream_chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        request_payload = {
            "model": self.model,
            **payload,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        request = urllib.request.Request(
            self.chat_url,
            data=json.dumps(request_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        started = time.perf_counter()
        first_delta: float | None = None
        last_delta: float | None = None
        usage: dict[str, Any] = {}
        finish_reason: str | None = None
        content_parts: list[str] = []
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(event.get("usage"), dict):
                        usage = event["usage"]
                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    if choice.get("finish_reason") is not None:
                        finish_reason = choice["finish_reason"]
                    delta = choice.get("delta") or {}
                    emitted = (
                        delta.get("content")
                        or delta.get("reasoning")
                        or delta.get("reasoning_content")
                    )
                    if emitted:
                        now = time.perf_counter()
                        if first_delta is None:
                            first_delta = now
                        last_delta = now
                        if delta.get("content"):
                            content_parts.append(delta["content"])
        except urllib.error.HTTPError as error:
            raise ApiError(self._http_error(error)) from error
        ended = time.perf_counter()

        completion_tokens = int(usage.get("completion_tokens") or 0)
        ttft = None if first_delta is None else first_delta - started
        decode_window = (
            None
            if first_delta is None or last_delta is None
            else last_delta - first_delta
        )
        decode_rate = None
        if completion_tokens > 1 and decode_window and decode_window > 0:
            decode_rate = (completion_tokens - 1) / decode_window
        elapsed = ended - started
        return {
            "elapsed_s": elapsed,
            "ttft_s": ttft,
            "decode_window_s": decode_window,
            "decode_tokens_per_second": decode_rate,
            "end_to_end_tokens_per_second": (
                completion_tokens / elapsed if completion_tokens else None
            ),
            "completion_tokens": completion_tokens,
            "prompt_tokens": usage.get("prompt_tokens"),
            "finish_reason": finish_reason,
            "content_head": "".join(content_parts)[:120],
        }


def make_archive_filler(units: int, start: int = 0) -> str:
    """Build deterministic, unique filler in O(units) time."""
    return "".join(
        f"Record {index:06d} contains routine archival material. "
        for index in range(start, start + units)
    )


@dataclass(frozen=True)
class SizedPrompt:
    messages: list[dict[str, str]]
    rendered_tokens: int
    filler_units: int
    padding_words: int
    marker_depth: float


def _quality_messages(
    filler_units: int,
    padding_words: int,
    needle: str,
    instruction: str,
    depth: float,
) -> list[dict[str, str]]:
    left_units = int(filler_units * depth)
    right_units = filler_units - left_units
    document = (
        make_archive_filler(left_units)
        + needle
        + "\n"
        + make_archive_filler(right_units, start=left_units)
        + (" alpha" * padding_words)
    )
    return [{"role": "user", "content": document + "\n\n" + instruction}]


def build_sized_prompt(
    client: VllmClient,
    target_tokens: int,
    needle: str,
    instruction: str,
    *,
    depth: float = 0.60,
    tolerance: int = 16,
    chat_template_kwargs: dict[str, Any] | None = None,
) -> SizedPrompt:
    """Build the largest prompt not exceeding target_tokens, within tolerance."""
    if not 0.0 < depth < 1.0:
        raise ValueError("depth must be between 0 and 1")
    cache: dict[tuple[int, int], tuple[list[dict[str, str]], int]] = {}

    def render(units: int, padding: int = 0) -> tuple[list[dict[str, str]], int]:
        key = (units, padding)
        if key not in cache:
            messages = _quality_messages(units, padding, needle, instruction, depth)
            cache[key] = (
                messages,
                client.render_tokens(messages, chat_template_kwargs),
            )
        return cache[key]

    _, minimum = render(0)
    if minimum > target_tokens:
        raise ValueError(
            f"target {target_tokens} is smaller than chat-template overhead {minimum}"
        )

    low = 0
    high = max(1, target_tokens // 8)
    while render(high)[1] <= target_tokens:
        low = high
        high *= 2

    best_units = low
    best_messages, best_count = render(low)
    while low <= high:
        middle = (low + high) // 2
        messages, count = render(middle)
        if count <= target_tokens:
            if count >= best_count:
                best_units, best_messages, best_count = middle, messages, count
            low = middle + 1
        else:
            high = middle - 1

    gap = target_tokens - best_count
    best_padding = 0
    if gap:
        low = 0
        high = max(32, gap * 4)
        while render(best_units, high)[1] <= target_tokens:
            low = high
            high *= 2
        while low <= high:
            middle = (low + high) // 2
            messages, count = render(best_units, middle)
            if count <= target_tokens:
                if count >= best_count:
                    best_padding = middle
                    best_messages, best_count = messages, count
                low = middle + 1
            else:
                high = middle - 1

    if target_tokens - best_count > tolerance:
        raise RuntimeError(
            f"could not size prompt within {tolerance} tokens: "
            f"target={target_tokens}, rendered={best_count}"
        )
    return SizedPrompt(
        messages=best_messages,
        rendered_tokens=best_count,
        filler_units=best_units,
        padding_words=best_padding,
        marker_depth=depth,
    )


def final_content(response: dict[str, Any]) -> str:
    try:
        return (response["choices"][0]["message"].get("content") or "").strip()
    except (KeyError, IndexError, TypeError, AttributeError):
        return ""


def score_exact_final_content(response: dict[str, Any], expected: str) -> bool:
    """Score final content only. Reasoning is deliberately ignored."""
    return final_content(response) == expected


TOOL_TESTS = [
    ("Search for quantum computing articles", "web_search", {"query": "quantum computing"}),
    (
        "Send email to bob@example.com saying the build passed",
        "send_email",
        {"to": "bob@example.com", "body": "build passed"},
    ),
    ("Book a flight to Tokyo tomorrow", "book_flight", {"destination": "Tokyo"}),
    ("Add numbers 5 and 7", "add", {"in": [5, 7]}),
    ("What is the weather in Denver?", "get_weather", {"city": "Denver"}),
    ("Find the file with error logs", "search_files", {"pattern": "error"}),
]


def tool_schema(name: str, required_keys: Iterable[str]) -> dict[str, Any]:
    available_properties = {
        "query": {"type": "string"},
        "to": {"type": "string"},
        "body": {"type": "string"},
        "destination": {"type": "string"},
        "city": {"type": "string"},
        "pattern": {"type": "string"},
        "in": {"type": "array", "items": {"type": "integer"}},
    }
    keys = list(required_keys)
    properties = {key: available_properties[key] for key in keys}
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": "Execute the requested operation.",
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": keys,
                "additionalProperties": False,
            },
        },
    }


def score_tool_response(
    response: dict[str, Any], expected_name: str, expected_arguments: dict[str, Any]
) -> tuple[bool, str]:
    try:
        calls = response["choices"][0]["message"].get("tool_calls") or []
        function = calls[0]["function"]
        if function.get("name") != expected_name:
            return False, f"wrong tool: {function.get('name')!r}"
        arguments = json.loads(function.get("arguments") or "{}")
        for key, expected_value in expected_arguments.items():
            actual = arguments.get(key)
            if isinstance(expected_value, list):
                matches = actual == expected_value
            else:
                # Scalar expectations are identifying substrings by design; a
                # model may add useful qualifiers to the expected value.
                matches = expected_value.lower() in str(actual or "").lower()
            if not matches:
                return False, f"wrong {key}: {actual!r}"
        return True, "ok"
    except Exception as error:
        return False, f"invalid tool call: {error}"


def usage_tokens(response: dict[str, Any], key: str) -> int | None:
    usage = response.get("usage") or {}
    value = usage.get(key)
    return int(value) if isinstance(value, (int, float)) else None


def run_quality_suite(
    client: VllmClient,
    result: dict[str, Any],
    args: argparse.Namespace,
    checkpoint: Callable[[], None],
) -> None:
    quality = result.setdefault(
        "quality", {"needles": [], "code_edits": [], "tools": []}
    )
    template_kwargs = {"enable_thinking": bool(args.enable_thinking)}

    for target in args.needle_lengths:
        marker = f"NEEDLE-V2-{target:X} is active"
        instruction = (
            "Return ONLY the exact marker sentence beginning with NEEDLE-V2-. "
            "Do not explain."
        )
        case: dict[str, Any] = {"target_prompt_tokens": target, "marker": marker}
        started = time.perf_counter()
        try:
            sized = build_sized_prompt(
                client,
                target,
                marker,
                instruction,
                tolerance=args.token_tolerance,
                chat_template_kwargs=template_kwargs,
            )
            response = client.chat(
                {
                    "messages": sized.messages,
                    "max_tokens": args.quality_max_tokens,
                    "temperature": 0.0,
                    "chat_template_kwargs": template_kwargs,
                }
            )
            content = final_content(response)
            actual_tokens = usage_tokens(response, "prompt_tokens")
            case.update(
                {
                    "rendered_prompt_tokens": sized.rendered_tokens,
                    "usage_prompt_tokens": actual_tokens,
                    "token_count_match": actual_tokens == sized.rendered_tokens,
                    "filler_units": sized.filler_units,
                    "padding_words": sized.padding_words,
                    "content": content,
                    "pass": score_exact_final_content(response, marker),
                }
            )
        except Exception as error:
            case.update({"pass": False, "error": str(error)})
        case["elapsed_s"] = time.perf_counter() - started
        quality["needles"].append(case)
        print(
            f"[needle] target={target} actual={case.get('usage_prompt_tokens')} "
            f"{'PASS' if case['pass'] else 'FAIL'} ({case['elapsed_s']:.2f}s)",
            flush=True,
        )
        checkpoint()

    for target in args.code_lengths:
        original = "def double_value(x): return x * 2"
        expected = "def double_value(x): return x * 4"
        instruction = (
            "Edit the function double_value so it returns x * 4. "
            "Return ONLY the complete edited function line."
        )
        case = {"target_prompt_tokens": target, "expected": expected}
        started = time.perf_counter()
        try:
            sized = build_sized_prompt(
                client,
                target,
                original,
                instruction,
                tolerance=args.token_tolerance,
                chat_template_kwargs=template_kwargs,
            )
            response = client.chat(
                {
                    "messages": sized.messages,
                    "max_tokens": args.quality_max_tokens,
                    "temperature": 0.0,
                    "chat_template_kwargs": template_kwargs,
                }
            )
            content = final_content(response)
            actual_tokens = usage_tokens(response, "prompt_tokens")
            case.update(
                {
                    "rendered_prompt_tokens": sized.rendered_tokens,
                    "usage_prompt_tokens": actual_tokens,
                    "token_count_match": actual_tokens == sized.rendered_tokens,
                    "content": content,
                    "pass": content == expected,
                }
            )
        except Exception as error:
            case.update({"pass": False, "error": str(error)})
        case["elapsed_s"] = time.perf_counter() - started
        quality["code_edits"].append(case)
        print(
            f"[code] target={target} actual={case.get('usage_prompt_tokens')} "
            f"{'PASS' if case['pass'] else 'FAIL'} ({case['elapsed_s']:.2f}s)",
            flush=True,
        )
        checkpoint()

    if args.skip_tools:
        return
    for prompt, name, expected_arguments in TOOL_TESTS:
        for repetition in range(args.tool_repetitions):
            case = {"tool": name, "repetition": repetition}
            started = time.perf_counter()
            try:
                response = client.chat(
                    {
                        "messages": [{"role": "user", "content": prompt}],
                        "tools": [tool_schema(name, expected_arguments)],
                        "tool_choice": "auto",
                        "max_tokens": args.quality_max_tokens,
                        "temperature": 0.0,
                        "chat_template_kwargs": template_kwargs,
                    }
                )
                passed, detail = score_tool_response(
                    response, name, expected_arguments
                )
                message = response.get("choices", [{}])[0].get("message") or {}
                case.update(
                    {
                        "pass": passed,
                        "detail": detail,
                        "tool_calls": message.get("tool_calls") or [],
                    }
                )
            except Exception as error:
                case.update({"pass": False, "error": str(error)})
            case["elapsed_s"] = time.perf_counter() - started
            quality["tools"].append(case)
            print(
                f"[tool] {name} rep={repetition} "
                f"{'PASS' if case['pass'] else 'FAIL'}",
                flush=True,
            )
            checkpoint()


def speed_payload(output_tokens: int) -> dict[str, Any]:
    # min_tokens and ignore_eos are vLLM extensions used to force a complete,
    # fixed-size decode window; this payload is not portable to generic OpenAI APIs.
    return {
        "messages": [
            {
                "role": "system",
                "content": (
                    "Output only consecutive integers separated by spaces, "
                    "starting at 1. Continue until the token limit."
                ),
            },
            {"role": "user", "content": "Begin."},
        ],
        "max_tokens": output_tokens,
        "min_tokens": output_tokens,
        "ignore_eos": True,
        "temperature": 0.0,
        "chat_template_kwargs": NO_THINKING,
    }


def summarize_speed(samples: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(samples)
    decode = [
        float(row["decode_tokens_per_second"])
        for row in rows
        if row.get("decode_tokens_per_second") is not None
    ]
    end_to_end = [
        float(row["end_to_end_tokens_per_second"])
        for row in rows
        if row.get("end_to_end_tokens_per_second") is not None
    ]
    ttft = [float(row["ttft_s"]) for row in rows if row.get("ttft_s") is not None]

    def stats(values: list[float]) -> dict[str, float] | None:
        if not values:
            return None
        return {
            "min": min(values),
            "median": statistics.median(values),
            "max": max(values),
        }

    return {
        "count": len(rows),
        "decode_tokens_per_second": stats(decode),
        "end_to_end_tokens_per_second": stats(end_to_end),
        "ttft_s": stats(ttft),
    }


def run_speed_measurements(
    client: VllmClient,
    payload: dict[str, Any],
    warmups: int,
    repetitions: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    warmup_samples = [client.stream_chat(payload) for _ in range(warmups)]
    measured_samples = [client.stream_chat(payload) for _ in range(repetitions)]
    return warmup_samples, measured_samples


def run_concurrency_case(
    client: VllmClient, payload: dict[str, Any], concurrency: int
) -> dict[str, Any]:
    def one_request(_: int) -> dict[str, Any]:
        started = time.perf_counter()
        response = client.chat(payload)
        elapsed = time.perf_counter() - started
        completion = usage_tokens(response, "completion_tokens") or 0
        return {
            "elapsed_s": elapsed,
            "completion_tokens": completion,
            "tokens_per_second": completion / elapsed if completion else None,
        }

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        rows = list(pool.map(one_request, range(concurrency)))
    wall = time.perf_counter() - started
    total_tokens = sum(row["completion_tokens"] for row in rows)
    return {
        "concurrency": concurrency,
        "wall_s": wall,
        "total_completion_tokens": total_tokens,
        "aggregate_tokens_per_second": total_tokens / wall if total_tokens else None,
        "requests": rows,
    }


def run_speed_suite(
    client: VllmClient,
    result: dict[str, Any],
    args: argparse.Namespace,
    checkpoint: Callable[[], None],
) -> None:
    payload = speed_payload(args.output_tokens)
    warmups, samples = run_speed_measurements(
        client, payload, args.warmups, args.repetitions
    )
    result["speed"] = {
        "output_tokens_requested": args.output_tokens,
        "warmups": warmups,
        "samples": samples,
        "summary": summarize_speed(samples),
        "concurrency": [],
    }
    summary = result["speed"]["summary"]
    print(
        "[speed] median decode tok/s="
        f"{(summary.get('decode_tokens_per_second') or {}).get('median')}",
        flush=True,
    )
    checkpoint()

    for concurrency in args.concurrency:
        if concurrency <= 1:
            continue
        case = run_concurrency_case(client, payload, concurrency)
        if args.server_max_num_seqs is None:
            case["interpretation"] = (
                "server max_num_seqs not declared; simultaneous scheduling is unverified"
            )
        elif args.server_max_num_seqs < concurrency:
            case["interpretation"] = (
                f"server max_num_seqs={args.server_max_num_seqs}; requests may queue"
            )
        else:
            case["interpretation"] = (
                f"server max_num_seqs={args.server_max_num_seqs}; concurrency is schedulable"
            )
        result["speed"]["concurrency"].append(case)
        print(
            f"[concurrency] x{concurrency} aggregate="
            f"{case['aggregate_tokens_per_second']:.2f} tok/s",
            flush=True,
        )
        checkpoint()


def command_output(command: list[str]) -> str | None:
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    output = (completed.stdout or completed.stderr).strip()
    return output or None


def local_metadata() -> dict[str, Any]:
    repository = str(Path(__file__).resolve().parents[2])
    # The harness normally runs in WSL against a Windows checkout. Match Git for
    # Windows CRLF normalization so provenance does not report every file dirty.
    git_command = ["git", "-c", "core.autocrlf=true", "-C", repository]
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "gpu": command_output(
            [
                "nvidia-smi",
                "--query-gpu=name,driver_version,memory.total",
                "--format=csv,noheader",
            ]
        ),
        "git_commit": command_output([*git_command, "rev-parse", "HEAD"]),
        "git_status": command_output([*git_command, "status", "--short"]),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "mode", choices=("all", "quality", "speed"), nargs="?", default="all"
    )
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--label", default="unlabelled")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument(
        "--needle-lengths",
        type=parse_int_csv,
        default=parse_int_csv("8192,65536,131072"),
    )
    parser.add_argument(
        "--code-lengths", type=parse_int_csv, default=parse_int_csv("65536")
    )
    parser.add_argument(
        "--full", action="store_true", help="also test 196K needle and 131K code edit"
    )
    parser.add_argument("--token-tolerance", type=int, default=16)
    parser.add_argument("--quality-max-tokens", type=int, default=64)
    parser.add_argument(
        "--enable-thinking",
        action="store_true",
        help="keep scoring content-only but allow reasoning tokens",
    )
    parser.add_argument("--skip-tools", action="store_true")
    parser.add_argument("--tool-repetitions", type=int, default=2)
    parser.add_argument("--warmups", type=int, default=2)
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--output-tokens", type=int, default=400)
    parser.add_argument(
        "--concurrency", type=parse_int_csv, default=parse_int_csv("1")
    )
    parser.add_argument("--server-max-num-seqs", type=int)
    parser.add_argument(
        "--mtp", choices=("on", "off", "unknown"), default="unknown"
    )
    parser.add_argument("--mnbt", type=int)
    parser.add_argument("--kv-cache-bytes", type=int)
    parser.add_argument("--notes", default="")
    return parser


def validate_args(args: argparse.Namespace) -> None:
    for name in (
        "timeout",
        "token_tolerance",
        "quality_max_tokens",
        "tool_repetitions",
        "repetitions",
        "output_tokens",
    ):
        if getattr(args, name) <= 0:
            raise SystemExit(f"--{name.replace('_', '-')} must be positive")
    if args.warmups < 0:
        raise SystemExit("--warmups cannot be negative")
    if args.full:
        if 196608 not in args.needle_lengths:
            args.needle_lengths.append(196608)
        if 131072 not in args.code_lengths:
            args.code_lengths.append(131072)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    validate_args(args)
    client = VllmClient(args.url, args.model, timeout=args.timeout)
    result: dict[str, Any] = {
        "schema_version": 2,
        "harness_version": HARNESS_VERSION,
        "started_at": utc_now(),
        "completed_at": None,
        "label": args.label,
        "endpoint": args.url,
        "model": args.model,
        "declared_server_config": {
            "mtp": args.mtp,
            "max_num_batched_tokens": args.mnbt,
            "max_num_seqs": args.server_max_num_seqs,
            "kv_cache_bytes": args.kv_cache_bytes,
            "notes": args.notes,
        },
        "local": local_metadata(),
        "server": client.metadata(),
        "warnings": [],
    }
    if args.enable_thinking:
        result["warnings"].append(
            "thinking enabled: content-only scoring may fail if reasoning exhausts the output budget"
        )
    if any(value > 1 for value in args.concurrency) and args.server_max_num_seqs is None:
        result["warnings"].append(
            "concurrency requested without --server-max-num-seqs; queued and simultaneous work cannot be distinguished"
        )

    def checkpoint() -> None:
        atomic_write_json(args.out, result)

    checkpoint()
    try:
        if args.mode in ("all", "quality"):
            run_quality_suite(client, result, args, checkpoint)
        if args.mode in ("all", "speed"):
            run_speed_suite(client, result, args, checkpoint)
    finally:
        result["completed_at"] = utc_now()
        checkpoint()

    quality_cases = []
    if "quality" in result:
        quality_cases = sum(
            (
                result["quality"][name]
                for name in ("needles", "code_edits", "tools")
            ),
            [],
        )
    failures = [case for case in quality_cases if not case.get("pass")]
    print(f"wrote {args.out}", flush=True)
    if failures:
        print(f"quality failures: {len(failures)}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
