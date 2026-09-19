# Octopus Invaders - Gemma 4 Run 2

**Status:** historical

One-shot generation by Gemma 4 26B-A4B (MLX 4-bit) via local endpoint.

## Model Details
- **Model**: unsloth/gemma-4-26b-a4b-it-UD-MLX-4bit
- **Temperature**: 0.7
- **Max Tokens**: 8000
- **Generation Speed**: ~46 tok/s
- **Finish Reason**: stop (clean completion)

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
