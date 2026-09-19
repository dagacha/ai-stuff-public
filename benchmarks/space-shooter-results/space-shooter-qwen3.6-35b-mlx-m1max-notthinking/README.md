# Octopus Invaders — M1 Max MLX run (thinking disabled)

**Status:** historical

A vertical space shooter built entirely from one prompt, by **Qwen3.6-35B-A3B** (Unsloth 4-bit MLX quant) running locally on an Apple M1 Max with thinking mode disabled. Vanilla JavaScript, HTML5 Canvas, no libraries.

## AI-Generated

The entire game was produced **in a single shot** from the same ~9,000-char prompt: [octopus_invaders_prompt.md](https://github.com/sudoingX/octopus-invaders/blob/main/prompts/octopus_invaders_prompt.md).

- **Model:** `unsloth/Qwen3.6-35B-A3B-UD-MLX-4bit` (Unsloth dynamic 4-bit MLX, ~21 GB)
- **Backend:** mlx_vlm 0.4.4 server, Apple MLX framework
- **Server flags:** `--max-kv-size 32768 --prefill-step-size 512 --port 8080`
- **Request params:** `temperature=0.3, max_tokens=28000, enable_thinking=false`
- **Reasoning:** disabled via `enable_thinking=false`

### Generation stats

| Metric | Value |
|---|---|
| Wall time | **3 min 14 s** (194 s) |
| Prefill speed | 440.6 tok/s |
| Decode speed | **50.5 tok/s** |
| Prompt tokens | 2,258 |
| Completion tokens | 9,526 |
| Finish reason | `stop` (clean termination) |
| Peak memory | 22.3 GB |
| Code produced | **996 lines across 10 files** |

### Manual fixes needed

Not yet tested. Output included as-is for benchmark comparison.

## Head-to-head: same model, same machine, different settings

| | **Thinking OFF** | **Thinking ON** |
|---|---|---|
| Wall time | **3 min 14 s** | 10 min 44 s |
| Completion tokens | 9,526 | 28,000 (truncated) |
| Decode tok/s | **50.5** | 43.7 |
| Output lines of code | 996 | 2,396 |
| Finish reason | **stop** (clean) | length (cut off) |
| Peak memory | 22.3 GB | 23.3 GB |

Disabling thinking mode produced a clean, complete output in a third of the time — but with significantly less code. Thinking mode generated over twice as much code (including more features and a corrected file) at the cost of much longer generation time and no clean termination at the 28K token limit.

## Head-to-head: cross-platform (same model, same prompt)

| | **M1 Max MLX (thinking off)** | **Bosgame llama.cpp (thinking on)** |
|---|---|---|
| Machine | Apple M1 Max, 64 GB | Ryzen AI Max+ 395, 128 GB |
| GPU | Apple M1 Max (Metal) | Radeon 8060S (Vulkan) |
| Backend | mlx_vlm 0.4.4 | llama.cpp b8672 |
| Wall time | **3 min 14 s** | 5 min 18 s |
| Completion tokens | 9,526 | 16,083 |
| Decode tok/s | **50.5** | ~50 |
| Output lines of code | 996 | 1,470 |
| Finish reason | stop (clean) | stop (clean) |
| Manual fixes | TBD | 2 (module script tag + init order) |

The M1 Max achieves comparable decode speed to the Radeon 8060S and completes faster due to fewer tokens generated (thinking disabled vs enabled).

## How to Run

1. Open a terminal in this folder.
2. Start a local server:
   ```
   python -m http.server 3004
   ```
3. Open **http://localhost:3004** in your browser.
4. Click anywhere to start. Move the mouse to fly the ship, hold left mouse to fire.

## Project Structure

```
space-shooter-mlx-m1max-notthinking/
  index.html              Entry point
  css/styles.css          Fullscreen canvas, cursor hidden
  js/
    config.js             Colors, speeds, sizes, all tuning constants
    audio.js              Web Audio API procedural SFX
    particles.js          Explosions, trails, sparks
    background.js         4-layer parallax (stars, nebula, planets, comets)
    enemies.js            Pixel-art octopus types, wave spawning, boss logic
    player.js             Ship rendering, mouse tracking, weapons, tiers
    ui.js                 HUD, start/gameover screens, health bar, combo
    game.js               Main loop, state machine, collisions
```

## Hardware

- **Machine:** Apple MacBook Pro — M1 Max, 64 GB unified RAM
- **Backend:** mlx_vlm 0.4.4 (Apple MLX framework)
