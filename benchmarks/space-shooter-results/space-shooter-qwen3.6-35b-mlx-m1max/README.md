# Octopus Invaders — M1 Max MLX run (thinking enabled)

**Status:** historical

A fast-paced, vertical space shooter built entirely with vanilla JavaScript and HTML5 Canvas. No libraries, no frameworks — just 2,396 lines of code across 10 files.

## AI-Generated

This game was generated **in a single shot** by **Qwen3.6-35B-A3B** (Unsloth 4-bit MLX quant) running locally via `mlx_vlm` on an Apple M1 Max with thinking mode enabled.

- **Prompt:** [octopus_invaders_prompt.md](https://github.com/sudoingX/octopus-invaders/blob/main/prompts/octopus_invaders_prompt.md) (~9,000 chars)
- **Model:** `unsloth/Qwen3.6-35B-A3B-UD-MLX-4bit` (4-bit, ~21 GB)
- **Backend:** mlx_vlm 0.4.4, direct `generate()` call
- **Request params:** `temperature=0.3, max_tokens=28000`
- **Reasoning:** enabled (default); the model used significant thinking tokens before and during code generation

### Generation stats

| Metric | Value |
|---|---|
| Wall time | **10.7 min** (644.7 s) |
| Prefill speed | 518.0 tok/s |
| Decode speed | 43.7 tok/s |
| Prompt tokens | 2,256 |
| Completion tokens | 28,000 (hit max limit) |
| Finish reason | `length` (truncated, not clean stop) |
| Peak memory | 23.3 GB |
| Code produced | **2,396 lines across 10 files** |

### Manual fixes needed

Not yet tested — the model hit the token limit and was still generating a corrected `enemies.js` when cut off. The output is included as-is for comparison purposes.

## How to Run

1. Open a terminal in this folder
2. Start a local server:
   ```
   python -m http.server 3003
   ```
3. Open **http://localhost:3003** in your browser

## Project Structure

```
space-shooter-mlx-m1max/
  index.html              Entry point
  css/styles.css          Fullscreen canvas, cursor hidden during play
  js/
    config.js             Color palette, speeds, sizes, all tuning constants
    audio.js              Web Audio API procedural sound generation
    particles.js          Explosions, trails, sparks, damage numbers
    background.js         4-layer parallax (stars, nebula, planets, comets)
    enemies.js            Pixel-art octopus types, wave spawning, boss logic
    player.js             Ship rendering, mouse tracking, weapons, upgrades
    ui.js                 HUD, start/gameover screens, health bar, combo
    game.js               Main loop, state machine, collisions, screen shake
```

## Hardware

- **Machine:** Apple MacBook Pro — M1 Max, 64 GB unified RAM
- **Backend:** mlx_vlm 0.4.4 (Apple MLX framework)
