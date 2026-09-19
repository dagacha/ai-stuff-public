# Octopus Invaders

**Status:** historical

A retro-style, vertical space shooter built with vanilla JavaScript and HTML5 Canvas.

## Features
- **Procedural Audio:** No external sound files; all audio generated via Web Audio API.
- **Pixel Art Rendering:** Enemies and ships drawn via grid-based `fillRect` patterns.
- **Particle System:** Explosions, engine trails, ink splatters, and bullet trails.
- **Parallax Background:** 4-layer scrolling space environment.
- **Boss Battles:** Every 5 levels, face a massive pixelated octopus.
- **Upgrade System:** Ship evolves visually and functionally every 3 levels.

## How to Run
1. Ensure you have Python 3 installed.
2. Open a terminal in the project root folder.
3. Run: `python3 -m http.server 3001`
4. Navigate to `http://localhost:3001` in your browser.

## Controls
- **Mouse:** Move ship (smooth tracking).
- **Left Click (Hold):** Fire weapons.
- **ESC:** Pause/Resume game.

## Project Structure
- `js/config.js`: Tuning constants (speeds, colors, sizes).
- `js/audio.js`: Procedural sound generation.
- `js/particles.js`: Visual effects system.
- `js/background.js`: Parallax scrolling layers.
- `js/enemies.js`: Enemy logic and pixel art rendering.
- `js/player.js`: Ship movement, weapons, and upgrades.
- `js/ui.js`: HUD, menus, and text rendering.
- `js/game.js`: Main loop, state management, and collision logic.
