/**
 * config.js
 * Central configuration for tuning game constants, colors, and physics.
 */

const CONFIG = {
    // Visuals
    colors: {
        bg: '#0D1117',
        player: '#4ECDC4',
        playerTier2: '#00FF00',
        playerTier3: '#FFD700',
        playerTier4: '#FFFFFF',
        text: '#FFFFFF',
        ui: '#E0E0E0',
        unleash: '#FF0055'
    },

    // Ship
    ship: {
        baseSize: 30,
        lerpFactor: 0.35,
        maxHealth: 100,
        engineTrailRate: 3 // spawn every 3 frames
    },

    // Bullets
    bullets: {
        tier1: { speed: 8, damage: 10, width: 4, color: '#00FFFF' },
        tier2: { speed: 10, damage: 15, width: 5, color: '#00FF00' },
        tier3: { speed: 12, damage: 20, width: 6, color: '#FFD700' },
        tier4: { speed: 14, damage: 30, width: 8, color: '#FFFFFF' }
    },

    // Enemies
    enemies: {
        small: { size: 36, health: 20, speed: 2, color: '#FF00FF', score: 100 },
        medium: { size: 48, health: 60, speed: 1.5, color: '#00FFFF', score: 300 },
        baby: { size: 20, health: 10, speed: 3.5, color: '#0088FF', score: 50 },
        boss: { size: 150, health: 2000, speed: 0.5, color: '#800080', score: 5000 }
    },

    // Gameplay
    gameplay: {
        comboTimeout: 120, // frames
        unleashDuration: 300, // frames (approx 5 seconds)
        bossInterval: 5, // levels
        screenShakeDecay: 0.9
    }
};
