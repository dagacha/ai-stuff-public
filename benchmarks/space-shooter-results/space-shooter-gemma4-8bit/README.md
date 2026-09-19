# Octopus Invaders - Gemma 4 8-bit MLX

**Status:** historical

One-shot generation by Gemma 4 26B-A4B (MLX 8-bit) via local endpoint.

## Model Details
- **Model**: unsloth/gemma-4-26b-a4b-it-MLX-8bit
- **Temperature**: 0.7
- **Max Tokens**: 8000
- **Generation Speed**: ~42.7 tok/s
- **Finish Reason**: stop (clean completion)
- **Peak Memory**: 29.2 GB

## Run Instructions

```bash
python3 -m http.server 3001
```

Then open http://localhost:3001 in your browser.

## Notes
- Click screen to start (required for Web Audio API initialization)
- Pure vanilla JavaScript, no dependencies
- Pixel-art octopus rendering with fillRect grids
- Circle-to-circle collision detection
- 4-layer parallax background
- Features: weapon upgrades, unleash mode, boss battles

## Files Generated
- index.html
- css/styles.css
- js/config.js, audio.js, particles.js, background.js, enemies.js, player.js, ui.js, game.js
