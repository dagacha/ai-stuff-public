/** @file config.js - Tuning constants and color palette */

export const CONFIG = {
    COLORS: {
        BG: '#0D1117',
        PLAYER_BODY: '#2C3E50',
        PLAYER_GLOW: '#4ECDC4',
        SMALL_OCTO: '#FF007F', // Neon Pink
        MED_OCTO: '#00E5FF',   // Electric Blue
        BABY_OCTO: '#00FFFF',  // Cyan
        BOSS_OCTO: '#9D00FF',  // Purple
        BULLET_T1: '#4ECDC4',
        BULLET_T2: '#45B7D1',
        BULLET_T3: '#F9D423',
        BULLET_T4: '#FFFFFF',
        EXPLOSION_CORE: '#00FF41',
        UNLEASH: '#FFFFFF'
    },
    ENEMY_SIZES: {
        SMALL: 36,
        MEDIUM: 48,
        BABY: 20,
        BOSS: 150
    },
    BULLET_SPEEDS: {
        TIER_1: 8,
        TIER_2: 10,
        TIER_3: 12,
        TIER_4: 14
    },
    PLAYER: {
        LERP: 0.35,
        BASE_HEALTH: 100,
        UNLEASH_DURATION: 5000 // ms
    },
    GAME: {
        BASE_SCORE: 100,
        COMBO_TIMEOUT: 2000 // ms
    }
};