# Octopus Invaders — Gemma 4 run

**Status:** historical

A vertical space shooter built entirely from one prompt, by **Gemma 4 26B-A4B** running locally on llama.cpp (Vulkan / Radeon 8060S). Vanilla JavaScript, HTML5 Canvas, no libraries.

## AI-Generated

The entire game was produced **in a single shot** from the same ~9,000-char prompt used for the earlier Qwen3.6 run: [octopus_invaders_prompt.md](https://github.com/sudoingX/octopus-invaders/blob/main/prompts/octopus_invaders_prompt.md).

- **Model:** `gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf` (Unsloth dynamic Q4_K_XL, ~17 GB on disk)
- **Backend:** llama.cpp b8672, Vulkan, 31/31 layers offloaded to GPU
- **Server flags:** `-ngl 99 --ctx-size 32768 --parallel 1 --flash-attn on --temp 1.0 --top-p 0.95 --top-k 64 --min-p 0.05`
- **Request params:** `temperature=0.3, top_p=0.95, max_tokens=28000` (single user message, no system prompt)
- **Reasoning:** on by default in the Gemma 4 chat template; the model used ~5 KB of thinking (~1.5 K tokens) before producing code

### Generation stats

| Metric | Value |
|---|---|
| Wall time | **4 min 16 s** (256.4 s) |
| Prefill speed | 582.9 tok/s |
| Decode speed | **40.1 tok/s** |
| Prompt tokens | 2,260 |
| Completion tokens | 10,132 (includes ~1.5 K reasoning) |
| Finish reason | `stop` (clean termination, not truncation) |
| Output size | 26.5 KB of markdown, 10 fenced code blocks + 1 README block |
| Code produced | **679 lines across 10 files** |

> **Note:** The 679-line figure is the recorded raw model output. The checked-in
> files were hand-edited after generation, so they no longer match: re-measured
> 2026-09-02, `index.html + css/styles.css + js/*.js` total **749 lines**.

### Manual fixes needed

**Zero.**

The game started, rendered the menu, accepted "CLICK TO START", entered the playing state with a live HUD and a moving ship on the first launch. No code edits were required.

Notable things the model got right without prompting:
- Used `<script type="module" src="js/game.js">` from the start (avoided the bug that bit Qwen)
- Put `getElementById('gameCanvas')` inside the `Game` constructor, relying on module deferral so the DOM is ready
- Clean ES module `import/export` graph: `config -> audio -> particles -> background -> enemies -> player -> ui -> game`
- 4-layer parallax background with mouse-reactive depth
- Procedural Web Audio API (laser, hits, explosions, powerup, unleash drone)
- Pixel-art octopus enemies (small / medium / boss) via `fillRect` grids
- Working bullet spread that scales with ship tier

## Head-to-head with Qwen3.6-35B-A3B

Same prompt, same machine, same llama.cpp build, same backend.

| | **Gemma 4 26B-A4B** | **Qwen3.6-35B-A3B** |
|---|---|---|
| Active parameters | 4 B | 3 B |
| Total parameters | 26 B | 35 B |
| Wall time | **4 min 16 s** | 5 min 18 s |
| Completion tokens | 10,132 | 16,083 |
| Decode tok/s | 40.1 | ~50 |
| Output lines of code | **679**¹ | 1,470² |
| Manual fixes to run | **0** | 2 (module script tag + init order) |
| File structure | identical 11-file layout | identical 11-file layout |

Gemma 4 produced less than half the code Qwen did and still shipped a running game on the first try. Qwen's output is more feature-rich (homing missiles, multi-phase boss bars, chromatic aberration, screen flash, ink barrages, damage numbers, powerup pickups with aura, etc.) but needed two small edits before it would boot.

¹ Recorded raw model output; the checked-in Gemma 4 files were hand-edited after
generation and now measure 749 lines (see note above).
² Recorded raw model output for the Qwen run; its checked-in files now measure
1,434 lines — see the note in
[`space-shooter-qwen3.6-35b/README.md`](../space-shooter-qwen3.6-35b/README.md).

Conclusion: for a pure one-shot-and-run metric, **Gemma 4 wins**; for raw feature count in the final artifact, **Qwen wins**.

## How to Run

1. Open a terminal in this folder.
2. Start a local server:
   ```
   python -m http.server 3002
   ```
3. Open **http://localhost:3002** in your browser.
4. Click anywhere to start. Move the mouse to fly the ship, hold left mouse to fire.

A static server is required because the game uses ES modules, which browsers refuse to load from `file://`.

## Controls

| Input | Action |
|---|---|
| **Mouse** | Move ship |
| **Left click (hold)** | Fire weapons |
| **Click** | Start / Restart |

## Project Structure

```
space-shooter-gemma4/
  index.html              Entry point, loads js/game.js as a module
  README.md               This file
  css/styles.css          Fullscreen canvas, cursor hidden, no-select
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

- **Machine:** Bosgame M5 - Ryzen AI Max+ 395, 128 GB unified RAM
- **GPU:** Radeon 8060S (RDNA 3.5) via Vulkan
- **Backend:** llama.cpp b8672, flash-attn on, 32 K context, 1 parallel slot
