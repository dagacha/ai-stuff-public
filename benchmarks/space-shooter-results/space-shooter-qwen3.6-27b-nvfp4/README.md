# 🐙 Octopus Invaders

**Status:** historical

A neon cyberpunk space shooter built with vanilla JavaScript and HTML5 Canvas. Pilot a pixel-art stealth fighter through infinite waves of pixelated octopus aliens, collect power-ups, unleash chain-reaction explosions, and face off against massive boss octopi.

## AI-Generated

This game was generated in a single shot by **Qwen 3.6 27B (NVFP4)** served via vLLM on the MSI workstation (RTX 5090).

- **Model:** Qwen3.6-27B, official NVFP4 checkpoint
- **Backend:** vLLM on the MSI RTX 5090 box (see [`configs/msi/`](../../../configs/msi/))
- **Request params:** not recorded for this run

## How to Run

The game uses classic `<script src="...">` tags (no ES modules, no
`fetch`/XHR), so it runs straight from disk — unlike the sibling runs that
need a static server:

1. Open `index.html` in your browser
2. Click to start playing

Serving over HTTP works too, if you prefer:

```
python3 -m http.server 3004
```

then open **http://localhost:3004**.

## Controls

| Input | Action |
|---|---|
| **Mouse** | Move ship |
| **Left click (hold)** | Fire weapons |
| **ESC** | Pause / Resume |
| **Click** | Start game / Restart after game over |

## Features

- Pixel-art octopus enemies rendered with grid-based `fillRect` (wave spawning + boss logic)
- Pixel-art angular stealth fighter with cyan glow, mouse tracking, weapon upgrade tiers
- 4-layer parallax scrolling background for a vertical-shooter feel
- Procedural Web Audio API sound engine (oscillators, noise bursts, envelopes)
- Particle system: explosions, trails, sparks, ink, and powerups from a single pool
- Unleash mode, damage numbers, screen shake, combo display

## Project Structure

```
space-shooter-qwen3.6-27b-nvfp4/
  index.html              Entry point
  README.md               This file
  css/styles.css          Fullscreen canvas styling
  js/
    config.js             All tuning constants (gameplay feel, visuals, audio)
    audio.js              Procedural Web Audio API sound engine
    particles.js          Explosions, trails, sparks, ink, powerups (single pool)
    background.js         4-layer parallax scrolling background
    enemies.js            Pixel-art octopus variants, wave spawning, boss logic
    player.js             Ship rendering, mouse tracking, weapons, upgrade tiers
    ui.js                 HUD, start/game over screens, combo display
    game.js               Main loop, state machine, collisions, unleash mode
```

**Code size:** 2,307 lines across 10 code files (`index.html` + `css/styles.css` + 8 JS files loaded as classic scripts).

## Hardware Used

- **Machine:** MSI workstation — single NVIDIA RTX 5090 (32 GB)
- **Backend:** vLLM, NVFP4 checkpoint
