# Octopus Invaders - Qwen3.6-35B-A3B One-Shot

**Status:** historical

A fast-paced, vertical space shooter built entirely with vanilla JavaScript and HTML5 Canvas. No libraries, no frameworks.

## AI-Generated

This game was generated **in a single shot** by **Qwen3.6-35B-A3B-MLX-8bit** (running locally via llama.cpp with MLX backend on Apple Silicon).

- **Model:** unsloth/Qwen3.6-35B-A3B-MLX-8bit
- **Prompt:** [Octopus Invaders Technical Specification](https://github.com/sudoingX/octopus-invaders/blob/main/prompts/octopus_invaders_prompt.md) (~9,000 chars)
- **Generation time:** ~2.8 minutes (7,139 tokens at ~42 tok/s)
- **Temperature:** 0.3
- **Context:** 32,768 tokens (32K)
- **Total output:** ~21,000 chars across 10 files
- **Peak memory:** 39.27 GB

> **Note:** The ~21,000-char figure is the recorded raw model output. The
> checked-in files were hand-touched after generation, so they no longer match:
> re-measured 2026-09-02, `wc -c` over `index.html + css/styles.css + js/*.js`
> gives **23,470 chars** (781 lines, 10 files).

## How to Run

1. Open a terminal in this folder
2. Start a local server:
   ```
   python -m http.server 3003
   ```
3. Open **http://localhost:3003** in your browser
4. Click to start playing

## Controls

| Input | Action |
|---|---|
| **Mouse** | Move ship (smooth lerp tracking) |
| **Left click (hold)** | Fire weapons |
| **ESC** | Pause / Resume |
| **Click** | Start game / Restart after game over |

## Features

- Pixel-art octopus enemies (small, medium, baby, boss) with grid-based rendering
- 4-layer parallax scrolling background
- Procedural audio via Web Audio API (laser, explosions, powerups, boss hits)
- Full particle system (explosions, damage numbers)
- Ship upgrade tiers every 3 levels (single → dual → triple → spread)
- Boss fights every 5 levels
- UNLEASH mode with 3x score multiplier
- Hit feedback: white flash, damage numbers

## Project Structure

```
octopus-invaders-qwen35b/
├── index.html          # Entry point
├── README.md           # This file
├── css/styles.css      # Fullscreen canvas styles
└── js/
    ├── config.js       # Colors, constants, tuning
    ├── audio.js        # Web Audio API sounds
    ├── particles.js    # Particle effects
    ├── background.js   # Parallax scrolling
    ├── enemies.js      # Octopus types, spawning, boss
    ├── player.js       # Ship, weapons, upgrades
    ├── ui.js           # HUD, menus, counters
    └── game.js         # Main loop, collisions, state
```

## Hardware Used

- **Model:** Qwen3.6-35B-A3B (MLX 8-bit quantization, ~40GB)
- **Server:** llama.cpp with MLX backend
- **Host:** Apple Silicon (MLX optimized)
- **Peak memory:** 39.27 GB during generation
