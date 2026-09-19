/**
 * config.js
 * Centralized tuning constants for the game.
 */

const CONFIG = {
    // Colors
    COLORS: {
        bg: '#0D1117',
        player: '#4ECDC4', // Cyan
        playerGlow: '#4ECDC4',
        bullet: '#4ECDC4',
        enemySmall: '#FF007F', // Neon Pink
        enemyMedium: '#00FFFF', // Electric Blue
        enemyBaby: '#00FF00', // Cyan
        enemyBoss: '#9D00FF', // Purple
        text: '#FFFFFF',
        textHighlight: '#FFD700', // Gold
        unleash: '#FFFFFF'
    },

    // Game Mechanics
    GAME: {
        fps: 60,
        baseEnemySpeed: 2,
        spawnRate: 60, // Frames between spawns
        levelUpScore: 1000,
        bossLevelInterval: 5,
        unleashDuration: 300, // Frames (approx 5 seconds)
        unleashCooldown: 1000
    },

    // Player
    PLAYER: {
        size: 30,
        speed: 0.35, // Lerp factor
        health: 100,
        fireRate: 10, // Frames between shots
        bulletSpeeds: [8, 10, 12, 14], // Tiers 1-4
        colors: ['#4ECDC4', '#00FF00', '#FFD700', '#FFFFFF'] // Tier glows
    },

    // Enemies
    ENEMIES: {
        small: { size: 36, hp: 1, score: 10, color: '#FF007F' },
        medium: { size: 48, hp: 3, score: 50, color: '#00FFFF' },
        baby: { size: 20, hp: 1, score: 20, color: '#00FF00' },
        boss: { size: 150, hp: 50, score: 1000, color: '#9D00FF' }
    },

    // Audio
    AUDIO: {
        masterVolume: 0.3
    }
};
