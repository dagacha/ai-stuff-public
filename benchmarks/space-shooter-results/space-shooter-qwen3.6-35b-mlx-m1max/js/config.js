// js/config.js
/**
 * config.js - All tuning constants for the game.
 * Color palette, speeds, enemy stats, sizes, and gameplay parameters.
 */

const CONFIG = {
    // === COLORS ===
    COLORS: {
        bg: '#0D1117',
        cyan: '#4ECDC4',
        green: '#44FF44',
        gold: '#FFD700',
        white: '#FFFFFF',
        pink: '#FF69B4',
        blue: '#00BFFF',
        purple: '#9B59B6',
        orange: '#FF8C00',
        yellow: '#FFFF00',
        red: '#FF4444',
        darkGray: '#2C3E50',
        gunmetal: '#3A3A4A',
        rainbow: ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#0088FF', '#8800FF'],
    },

    // === CANVAS ===
    CANVAS: {
        imageSmoothingEnabled: false,
    },

    // === PLAYER ===
    PLAYER: {
        lerpFactor: 0.35,
        shipRadius: 18,
        maxHealth: 100,
        engineTrailSpawnRate: 2, // every N frames
        bankAngle: 0.15, // max tilt in radians
    },

    // === BULLETS ===
    BULLETS: {
        tier1Speed: 8,
        tier2Speed: 10,
        tier3Speed: 12,
        tier4Speed: 14,
        tier1Width: 4,
        tier2Width: 5,
        tier3Width: 6,
        tier4Width: 7,
        fireRate: 6, // frames between shots
        unleashFireRate: 2,
    },

    // === ENEMIES ===
    ENEMIES: {
        small: { size: 36, health: 20, speed: 1.5, score: 100, color: '#FF69B4' },
        medium: { size: 48, health: 50, speed: 1.0, score: 250, color: '#00BFFF' },
        baby: { size: 20, health: 10, speed: 2.5, score: 50, color: '#00FFFF' },
        boss: { size: 150, health: 500, speed: 0.5, score: 2000, color: '#9B59B6' },
        spawnInterval: 90, // frames between enemy spawns
        waveSize: 5, // enemies per wave
    },

    // === PARTICLES ===
    PARTICLES: {
        maxParticles: 500,
        engineTrailLife: 20,
        bulletTrailLife: 8,
        sparkLife: 15,
        explosionLife: 40,
        inkSplatterLife: 30,
        damageNumberLife: 60,
    },

    // === COMBO ===
    COMBO: {
        decayTime: 120, // frames before combo resets
        maxMultiplier: 10,
    },

    // === UNLEASH ===
    UNLEASH: {
        duration: 300, // 5 seconds at 60fps
        scoreMultiplier: 3,
        ringColor: '#44FF44',
    },

    // === SCREEN SHAKE ===
    SCREEN_SHAKE: {
        maxIntensity: 15,
        decay: 0.9,
    },

    // === LEVELS ===
    LEVELS: {
        bossEvery: 5,
        upgradeEvery: 3,
        baseEnemyCount: 5,
        enemyCountPerLevel: 3,
    },
};
