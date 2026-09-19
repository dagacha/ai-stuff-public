# Gemma 4 26B-A4B (MLX 8-bit) - Space Shooter Generation Report

**Status:** historical

**Date:** 2026-04-19  
**Model:** `unsloth/gemma-4-26b-a4b-it-MLX-8bit`  
**Backend:** MLX (Mac)  

---

## Generation Summary

| Metric | Value |
|---|---|
| **Prompt tokens** | 930 |
| **Output tokens** | 5,751 |
| **Total tokens** | 6,681 |
| **Prefill speed** | ~224 tok/s |
| **Decode speed** | ~42.7 tok/s |
| **Peak memory** | 29.2 GB |
| **Wall time** | ~139 seconds |
| **Finish reason** | stop (clean completion) |

---

## Output Files

Generated 11 complete files:

| File | Lines | Description |
|---|---|---|
| `index.html` | 24 | Entry point with script imports in dependency order |
| `css/styles.css` | 19 | Fullscreen canvas, pixelated rendering, no cursor |
| `js/config.js` | 28 | Colors, speeds, enemy sizes, difficulty settings |
| `js/audio.js` | 56 | Web Audio API - shoot, explosion, hit sounds |
| `js/particles.js` | 75 | Particle system for explosions, trails, ink |
| `js/background.js` | 88 | 4-layer parallax (stars, nebula, planets, comets) |
| `js/enemies.js` | 212 | Pixel-art octopus rendering, behaviors, boss logic |
| `js/player.js` | 163 | F-117 style ship, weapon tiers, unleash mode |
| `js/ui.js` | 78 | HUD, start screen, game over screen |
| `js/game.js` | 257 | Main loop, collision detection, state management |
| `README.md` | 35 | Documentation and run instructions |

**Total:** 1,000 lines of generated code (sum of the code-file rows above)

> **Note:** The table records the raw model output; the checked-in files were
> hand-edited after generation and no longer match. Re-measured 2026-09-02
> (`wc -l` over `index.html + css/styles.css + js/*.js`): index.html 22,
> styles.css 19, config.js 29, audio.js 57, particles.js 71, background.js 90,
> enemies.js 192, player.js 174, ui.js 74, game.js 215 — **943 lines total**.

---

## Specification Compliance

| Requirement | Status | Notes |
|---|---|---|
| Vanilla JS + Canvas | ✅ | Zero dependencies |
| Pixel-art octopus (fillRect) | ✅ | Grid-based 8x8 rendering |
| Circle-to-circle collision | ✅ | Anti-tunneling implementation |
| 4-layer parallax background | ✅ | Stars, nebula, planets, comets |
| Web Audio API | ✅ | Procedural sound generation |
| Weapon upgrades (T1-T4) | ✅ | Every 3 levels |
| Unleash mode | ✅ | 5-second power-up with visual effects |
| Boss battles | ✅ | Every 5 levels with health bars |
| Thread-safe structure | ✅ | Proper import order enforced |

---

## Key Features Implemented

### Visual
- F-117 stealth fighter style ship with cyan glow
- Animated tentacles on octopus enemies
- Screen shake on explosions
- Health bars for medium enemies and bosses
- Particle effects for engine trails, explosions, bullets

### Gameplay
- Mouse tracking with 0.35 lerp factor
- 4 weapon tiers with increasing spread
- Unleash mode: massive spread beam, white-hot glow, 3x score
- Boss splits into babies on death
- Level progression with difficulty scaling

### Technical
- `ctx.imageSmoothingEnabled = false` for pixel art
- 30px buffer for player collision
- Audio context initialized on user click (browser policy)
- Responsive canvas with resize handling

---

## Comparison with Previous Runs

| Run | Model | Quantization | Decode tok/s | Output tokens | Memory |
|---|---|---|---|---|---|
| gemma4-run2 | Gemma 4 26B | MLX 4-bit | ~46 | 5,755 | 17.0 GB |
| **gemma4-8bit** | Gemma 4 26B | **MLX 8-bit** | ~42.7 | 5,751 | **29.2 GB** |

The 8-bit version uses ~70% more memory but produces similar output quality and token count.

---

## Running the Game

```bash
cd space-shooter-gemma4-8bit
python3 -m http.server 3001
```

Open http://localhost:3001 in browser.

**Note:** Click screen to start (required for Web Audio API initialization).

---

## Conclusion

Gemma 4 26B-A4B (MLX 8-bit) successfully generated a complete, playable space shooter game in one shot. All 11 files were created with proper structure, pixel-art rendering, and game mechanics as specified.
