#!/usr/bin/env python3
import json
from pathlib import Path
import tempfile
import time
import unittest

import benchmark_v2 as bench


class FakeRenderClient:
    def render_tokens(self, messages, chat_template_kwargs=None):
        del chat_template_kwargs
        return 7 + len(messages[0]["content"].split())


class FakeSpeedClient:
    def __init__(self):
        self.calls = 0

    def stream_chat(self, payload):
        self.calls += 1
        return {
            "completion_tokens": payload["max_tokens"],
            "decode_tokens_per_second": 100.0,
            "end_to_end_tokens_per_second": 95.0,
            "ttft_s": 0.1,
        }


class BenchmarkV2Tests(unittest.TestCase):
    def test_atomic_write_json_round_trips_without_temporary_files(self):
        value = {'status': 'complete', 'samples': [1, 2, 3]}
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'nested' / 'result.json'
            bench.atomic_write_json(str(destination), value)

            self.assertEqual(json.loads(destination.read_text()), value)
            self.assertEqual(list(destination.parent.glob('*.tmp')), [])

    def test_derive_endpoint_replaces_chat_suffix(self):
        chat_url = 'http://127.0.0.1:8100/v1/chat/completions'
        self.assertEqual(
            bench.derive_endpoint(chat_url, '/v1/models'),
            'http://127.0.0.1:8100/v1/models',
        )
        with self.assertRaises(ValueError):
            bench.derive_endpoint('http://127.0.0.1:8100/v1/models', '/version')

    def test_filler_is_linear_enough_for_large_inputs(self):
        started = time.perf_counter()
        filler = bench.make_archive_filler(50_000)
        elapsed = time.perf_counter() - started
        self.assertIn("Record 000000", filler)
        self.assertIn("Record 049999", filler)
        self.assertLess(elapsed, 5.0)

    def test_prompt_builder_hits_token_budget(self):
        marker = "NEEDLE-V2-TEST is active"
        sized = bench.build_sized_prompt(
            FakeRenderClient(),
            4096,
            marker,
            "Return only the marker.",
            tolerance=2,
            chat_template_kwargs=bench.NO_THINKING,
        )
        self.assertLessEqual(sized.rendered_tokens, 4096)
        self.assertLessEqual(4096 - sized.rendered_tokens, 2)
        self.assertEqual(sized.messages[0]["content"].count(marker), 1)

    def test_reasoning_is_never_used_as_final_content(self):
        marker = "NEEDLE-V2-TEST is active"
        response = {
            "choices": [{"message": {"content": "", "reasoning": marker}}]
        }
        self.assertFalse(bench.score_exact_final_content(response, marker))

    def test_truncated_content_fails(self):
        marker = "NEEDLE-V2-TEST is active"
        response = {"choices": [{"message": {"content": "NEED"}}]}
        self.assertFalse(bench.score_exact_final_content(response, marker))

    def test_speed_measurement_sends_exact_request_count(self):
        client = FakeSpeedClient()
        warmups, measured = bench.run_speed_measurements(
            client, bench.speed_payload(400), warmups=2, repetitions=5
        )
        self.assertEqual(client.calls, 7)
        self.assertEqual(len(warmups), 2)
        self.assertEqual(len(measured), 5)

    def test_array_valued_tool_arguments_are_checked_exactly(self):
        response = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "add",
                                    "arguments": "{\"in\":[5,7]}",
                                }
                            }
                        ]
                    }
                }
            ]
        }
        passed, detail = bench.score_tool_response(
            response, "add", {"in": [5, 7]}
        )
        self.assertTrue(passed, detail)

    def test_tool_schema_requires_the_scored_arguments(self):
        schema = bench.tool_schema("send_email", {"to": "x", "body": "y"})
        parameters = schema["function"]["parameters"]
        self.assertEqual(parameters["required"], ["to", "body"])
        self.assertFalse(parameters["additionalProperties"])

    def test_speed_summary_reports_median_and_range(self):
        rows = [
            {
                "decode_tokens_per_second": value,
                "end_to_end_tokens_per_second": value - 5,
                "ttft_s": 0.1,
            }
            for value in (100.0, 80.0, 90.0)
        ]
        summary = bench.summarize_speed(rows)
        self.assertEqual(summary["decode_tokens_per_second"]["median"], 90.0)
        self.assertEqual(summary["decode_tokens_per_second"]["min"], 80.0)
        self.assertEqual(summary["decode_tokens_per_second"]["max"], 100.0)


if __name__ == "__main__":
    unittest.main()
