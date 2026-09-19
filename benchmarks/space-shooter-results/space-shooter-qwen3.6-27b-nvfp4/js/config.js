/**
 * config.js - All tuning constants for the game.
 * Adjust these values to tune gameplay feel, visuals, and audio.
 */
const CONFIG = {
    // ========== COLORS ==========
    COLORS: {
        bg: '#0D1117',
        cyan: '#4ECDC4',
        cyanGlow: '#4ECDC4',
        green: '#2ECC71',
        gold: '#F1C40F',
        white: '#FFFFFF',
        pink: '#FF6B9D',
        blue: '#4A90D9',
        electricBlue: '#5B9BD5',
        cyanLight: '#00FFFF',
        purple: '#9B59B5',
        darkGray: '#2C3E50',
        gunmetal: '#3A4A5A',
        orange: '#F39C12',
        yellow: '#F1C40F',
        red: '#E74C3C',
    },

    // ========== PLAYER ==========
    PLAYER: {
        width: 40,
        height: 40,
        radius: 20,
        lerpFactor: 0.35,
        maxHealth: 100,
        baseFireRate: 14, // frames between shots at tier 1
        damagePerLevel: 2,
        unleashDuration: 5000, // ms
        unleashMultiplier: 3,
        upgradeInterval: 3, // levels per tier
    },

    // ========== BULLET SPEEDS BY TIER ==========
    BULLET_SPEEDS: [8, 10, 12, 14], // tier 1-4

    // ========== ENEMY SIZES ==========
    ENEMY_SIZES: {
        small: 36,
        medium: 48,
        baby: 20,
        boss: 150,
    },

    // ========== ENEMY STATS ==========
    ENEMY_STATS: {
        small: {
            health: 2,
            speed: 1.5,
            score: 10,
            color: '#FF6B9D',
            sineAmplitude: 40,
            sineFrequency: 0.02,
        },
        medium: {
            health: 6,
            speed: 1.0,
            score: 30,
            color: '#5B9BD5',
            fireRate: 90,
            splitCount: 2,
        },
        baby: {
            health: 1,
            speed: 2.5,
            score: 5,
            color: '#00FFFF',
        },
        boss: {
            health: 100,
            speed: 0.6,
            score: 200,
            color: '#9B59B5',
            tentacleCount: 8,
            inkBarrageInterval: 120,
        },
    },

    // ========== WAVE / LEVEL ==========
    LEVEL: {
        bossInterval: 5, // boss every N levels
        enemiesPerLevelBase: 5,
        enemiesPerLevelGrowth: 2,
        levelUpScore: 100,
    },

    // ========== SCREEN SHAKE ==========
    SHAKE: {
        small: 3,
        medium: 6,
        boss: 12,
        playerHit: 5,
        decay: 0.85,
        maxDuration: 15, // frames
    },

    // ========== PARTICLES ==========
    PARTICLES: {
        maxCount: 200,
        engineTrail: { count: 2, life: 20, size: 3 },
        bulletTrail: { count: 1, life: 8, size: 2 },
        spark: { count: 4, life: 12, size: 2 },
        explosion: { count: 12, life: 25, size: 4 },
        inkSplatter: { count: 8, size: 3 },
        powerup: { count: 6, life: 30, size: 3 },
    },

    // ========== AUDIO ==========
    AUDIO: {
        masterVolume: 0.6,
        laserFreq: 880,
        laserDuration: 0.1,
        explosionDuration: 0.4,
        powerupDuration: 0.3,
        hitDuration: 0.08,
        bossDroneFreq: 55,
        bossDroneDuration: 2.0,
        unleashDroneFreq: 110,
        unleashDroneDuration: 5.0,
    },

    // ========== UI ==========
    UI: {
        hudFont: '20px monospace',
        hudY: 40,
        hudPadding: 20,
        healthBarHeight: 14,
        healthBarWidth: 200,
    },
};