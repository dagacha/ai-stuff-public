# Octopus Invaders

**Status:** historical

A fast-paced, vertical space shooter built entirely with vanilla JavaScript and HTML5 Canvas. No libraries, no frameworks — just 1,470 lines of code across 11 files.

> **Note:** The 1,470-lines figure is the recorded raw model output (10 code
> files + this README). The checked-in files were touched after generation
> beyond the two small fixes below, so they no longer match: re-measured
> 2026-09-02, the 10 code files (`index.html + css/styles.css + js/*.js`)
> total **1,434 lines** (1,508 counting this README).

## AI-Generated

This game was generated **in a single shot** by **Qwen3.6-35B-A3B** (a 35B-parameter MoE model running locally via llama.cpp on a Radeon 8060S GPU).

- **Prompt:** [octopus_invaders_prompt.md](https://github.com/sudoingX/octopus-invaders/blob/main/prompts/octopus_invaders_prompt.md) (~9,000 chars)
- **Generation time:** 5.3 minutes (16,083 tokens at ~50 tok/s)
- **Manual fixes needed:** 2 init-order bugs (see below)
- **Model settings:** temp=0.3, reasoning-budget=1024, ctx=32768

### Fixes Applied After Generation

1. **`index.html`** — The model used ES module `import/export` in all JS files but loaded them with plain `<script>` tags. Changed to `<script type="module" src="js/game.js">` so the module import chain works.
2. **`js/game.js`** — The constructor created `Background`, `UI`, and `Player` objects using `canvas` before `init()` assigned it. Moved those instantiations into `init()` after canvas setup.

Both are initialization-order bugs, not logic errors. All game mechanics, rendering, audio, and particle systems are the model's original output.

## How to Run

1. Open a terminal in this folder
2. Start a local server:
   ```
   python -m http.server 3001
   ```
3. Open **http://localhost:3001** in your browser
4. Click to start playing

## Controls

| Input | Action |
|---|---|
| **Mouse** | Move ship (smooth lerp tracking) |
| **Left click (hold)** | Fire weapons |
| **ESC** | Pause / Resume |
| **Click** | Start game / Restart after game over |

## Features

- Pixel-art octopus enemies (small, medium, baby, boss)
- 4-layer parallax scrolling background (stars, nebula, planets, comets)
- Procedural audio via Web Audio API (laser, explosions, powerups, boss music)
- Full particle system (explosions, ink splatter, engine trails, bullet trails, sparks)
- Ship upgrade tiers every 3 levels (single cannon -> homing missiles + spread)
- Boss fights every 5 levels with multi-phase health bars
- Unleash mode with 3x score multiplier and screen effects
- Hit feedback: white flash, damage numbers, screen shake
- Combo counter for consecutive kills

## Project Structure

```
space-shooter/
  index.html              Entry point (single module script import)
  README.md               This file
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

## Hardware Used

- **Machine:** Bosgame M5 — Ryzen AI Max+ 395, 128 GB unified RAM
- **GPU:** Radeon 8060S (RDNA 3.5) via Vulkan
- **Backend:** llama.cpp b8672, flash-attn on
