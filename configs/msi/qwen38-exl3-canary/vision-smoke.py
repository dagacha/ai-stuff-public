#!/usr/bin/env python3
"""Vision smoke test for a Qwen3.8-27B EXL3 checkpoint on the pinned fork engine.

Bypasses tools/serve_openai.py (which never loads the vision component) and
drives exllamav3 directly: loads the BF16 vision tower shipped inside the EXL3
checkpoint, embeds an image, and generates with the text model — optionally
with the built-in MTP draft head, i.e. the vision+spec-decode combination that
crashes vLLM 0.24/0.26/nightly on this box.

Run inside WSL with the canary venv, production stopped:
  ~/qwen38-exl3-venv/bin/python vision-smoke.py --model <dir> [--mtp] [--scale 3.1] [--rounds 3]
"""
import argparse, json, os, sys, time

import torch
from PIL import Image


def vram():
    free, total = torch.cuda.mem_get_info()
    return (total - free) / 2**30


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--image", default="/mnt/c/Users/<user>/x-thinkingcap.jpg")
    ap.add_argument("--scale", type=float, default=1.0,
                    help="upscale factor (3.1 reproduces the ~28MP vLLM crash image)")
    ap.add_argument("--mtp", action="store_true", help="also load the MTP head and speculate")
    ap.add_argument("--cache_size", type=int, default=32768)
    ap.add_argument("--cache_quant", default="nvfp4", choices=["nvfp4", "fp16"],
                    help="target KV format (draft cache stays fp16, as in the kit)")
    ap.add_argument("--gpu_gb", type=float, default=29.0,
                    help="VRAM budget handed to autosplit, same as the kit's --grid_size")
    ap.add_argument("--max_tokens", type=int, default=1024)
    ap.add_argument("--rounds", type=int, default=1)
    ap.add_argument("--prompt", default="Transcribe all text in this image exactly, "
                    "then describe every visual element in detail.")
    ap.add_argument("--json", default=None, help="write results here")
    args = ap.parse_args()

    from exllamav3 import Config, Model, Cache, Tokenizer, Generator, Job
    from exllamav3.generator.sampler.presets import ComboSampler

    result = {"model": args.model, "mtp": args.mtp, "scale": args.scale, "rounds": []}
    t0 = time.time()
    config = Config.from_directory(args.model)
    print(f"arch={config.architecture} vram_before={vram():.2f} GiB")

    vision_model = Model.from_config(config, component="vision")
    vision_model.load(progressbar=True)
    result["vram_after_vision_GiB"] = round(vram(), 2)
    print(f"vision tower loaded: {result['vram_after_vision_GiB']:.2f} GiB used")

    from exllamav3.cache import CacheLayer_fp16, CacheLayer_nvfp4
    layer_type = CacheLayer_nvfp4 if args.cache_quant == "nvfp4" else CacheLayer_fp16
    budget = [args.gpu_gb]
    model = Model.from_config(config)
    max_history = 4 if args.mtp else 0
    # max_batch_size=1 as in the kit's autosplit path: the recurrent (GDN) layer
    # states are allocated per slot x (max_history+1), so the default 16 slots
    # with an MTP history blow the VRAM split.
    cache = Cache(model, max_num_tokens=args.cache_size, layer_type=layer_type,
                  max_history=max_history, max_batch_size=1)
    model.load(progressbar=True, use_per_device=budget)
    tokenizer = Tokenizer.from_config(config)

    draft_model = draft_cache = None
    if args.mtp:
        draft_model = Model.from_config(config, component="mtp")
        draft_cache = Cache(draft_model, max_num_tokens=args.cache_size, max_history=max_history)
        draft_model.load(progressbar=True, use_per_device=budget)
    generator = Generator(model=model, cache=cache, tokenizer=tokenizer,
                          draft_model=draft_model, draft_cache=draft_cache)
    result["vram_after_all_GiB"] = round(vram(), 2)
    result["load_s"] = round(time.time() - t0, 1)
    print(f"all loaded in {result['load_s']}s: {result['vram_after_all_GiB']:.2f} GiB used")

    im = Image.open(args.image).convert("RGB")
    if args.scale != 1.0:
        im = im.resize((int(im.width * args.scale), int(im.height * args.scale)), Image.LANCZOS)
    result["image_size"] = im.size
    result["image_MP"] = round(im.width * im.height / 1e6, 1)
    print(f"image {im.size} = {result['image_MP']} MP")

    ok = True
    for r in range(1, args.rounds + 1):
        try:
            te = time.time()
            mme = vision_model.get_image_embeddings(tokenizer=tokenizer, image=im)
            embed_s = time.time() - te
            n_img = mme.mm_length
            # Alias is self-delimiting (token_string carries vision_start/end), so
            # place it directly in the user text instead of going through the
            # template's <|image_pad|> substitution (fork config lacks image_token_id).
            messages = [{"role": "user", "content": mme.text_alias + "\n" + args.prompt}]
            rendered = tokenizer.hf_render_chat_template(
                messages, add_generation_prompt=True, enable_thinking=False)
            input_ids = tokenizer.encode(rendered, encode_special_tokens=True, embeddings=[mme])
            n_prompt = int(input_ids.shape[-1])
            job = Job(input_ids=input_ids, max_new_tokens=args.max_tokens,
                      stop_conditions=["<|im_end|>", tokenizer.eos_token_id],
                      sampler=ComboSampler(temperature=0.0, top_k=1, top_p=1.0, min_p=0.0),
                      embeddings=[mme], decode_special_tokens=False)
            generator.enqueue(job)
            text, first, tg0, n_out = "", None, time.time(), 0
            while generator.num_remaining_jobs():
                for res in generator.iterate():
                    chunk = res.get("text", "")
                    if chunk:
                        if first is None:
                            first = time.time()
                        text += chunk
                    if res.get("eos"):
                        n_out = int(job.sequences[0].sequence_ids.seq_len - n_prompt)
            dt = time.time() - tg0
            ttft = (first - tg0) if first else dt
            dec = n_out / max(dt - ttft, 1e-6)
            round_res = {"round": r, "image_tokens": n_img, "prompt_tokens": n_prompt,
                         "completion_tokens": n_out, "embed_s": round(embed_s, 2),
                         "ttft_s": round(ttft, 2), "total_s": round(dt, 1),
                         "decode_tok_s": round(dec, 1), "vram_peak_GiB": round(vram(), 2),
                         "text": text}
            result["rounds"].append(round_res)
            print(f"round {r}: img_tokens={n_img} prompt={n_prompt} out={n_out} "
                  f"embed={embed_s:.2f}s ttft={ttft:.2f}s decode={dec:.1f} tok/s "
                  f"vram={round_res['vram_peak_GiB']:.2f} GiB")
            if r == 1:
                print("---- output ----")
                print(text[:3000])
                print("----------------")
        except Exception as e:
            ok = False
            result["error"] = repr(e)
            print(f"round {r}: FAILED — {e!r}")
            break
    result["pass"] = ok
    if args.json:
        with open(args.json, "w") as f:
            json.dump(result, f, indent=2)
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
