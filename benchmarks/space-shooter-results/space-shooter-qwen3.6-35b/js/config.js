/**
 * config.js
 * Centralized tuning constants for game balance, visuals, and mechanics.
 * Modify these values to adjust difficulty, speed, colors, and sizes.
 */

const CONFIG = {
    // Canvas & Rendering
    CANVAS_BG: '#0D1117',
    IMAGE_SMOOTHING: false,

    // Ship & Movement
    SHIP_LERP_FACTOR: 0.35,
    SHIP_RADIUS: 20,
    SHIP_BUFFER: 30,
    SHIP_MAX_SPEED: 12,
    SHIP_BANK_ANGLE: 0.15,

    // Weapons & Tiers
    BULLET_SPEEDS: [8, 10, 12, 14],
    BULLET_SIZES: [4, 6, 8, 10],
    FIRE_RATE: 8, // frames between shots
    SPREAD_BASE: 0.05,
    SPREAD_INCREMENT: 0.02,

    // Enemies
    ENEMY_SIZES: {
        small: 36,
        medium: 48,
        baby: 20,
        boss: 150
    },
    ENEMY_COLORS: {
        small: '#FF69B4',
        medium: '#00BFFF',
        baby: '#00FFFF',
        boss: '#9400D3'
    },
    ENEMY_SPEEDS: {
        small: 1.5,
        medium: 1.0,
        baby: 2.5,
        boss: 0.5
    },
    ENEMY_HEALTH: {
        small: 20,
        medium: 60,
        baby: 10,
        boss: 800
    },
    WAVE_INTERVAL: 180, // frames between waves
    BOSS_LEVEL_INTERVAL: 5,

    // Particles & Effects
    PARTICLE_LIFETIME: 40,
    DAMAGE_NUMBER_LIFETIME: 60,
    DAMAGE_NUMBER_RISE: 60,
    HIT_FLASH_FRAMES: 3,
    SCREEN_SHAKE_INTENSITY: 5,
    SCREEN_SHAKE_DECAY: 0.9,
    UNLEASH_DURATION: 300, // frames (5s at 60fps)
    UNLEASH_MULTIPLIER: 3,

    // Audio
    AUDIO_ENABLED: true,
    AMBIENT_VOLUME: 0.05,
    SFX_VOLUME: 0.3,

    // UI & HUD
    HUD_FONT: '20px monospace',
    HUD_Y: 40,
    HUD_PADDING: 20,
    HEALTH_BAR_WIDTH: 200,
    HEALTH_BAR_HEIGHT: 12,
    HEALTH_BAR_Y_OFFSET: 40
};

export default CONFIG;