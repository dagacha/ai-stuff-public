/* js/config.js */
const CONFIG = {
    colors: {
        bg: '#050510',
        player: '#00ffff', // Cyan
        playerGlow: '#00ffff',
        bullet: '#00ffff',
        enemySmall: '#ff00ff', // Neon Pink
        enemyMed: '#0088ff',   // Electric Blue
        enemyBaby: '#00ffff',  // Cyan
        enemyBoss: '#aa00ff',  // Glowing Purple
        text: '#ffffff',
        textHighlight: '#ffff00',
        powerup: '#00ff00'
    },
    game: {
        baseSpeed: 3,
        spawnRate: 60, // Frames between spawns
        levelUpScore: 1000,
        bossLevelInterval: 5
    },
    player: {
        radius: 20,
        lerp: 0.35,
        fireRate: 10, // Frames between shots
        maxHealth: 100
    },
    enemies: {
        small: { radius: 18, score: 100, hp: 1 },
        medium: { radius: 24, score: 300, hp: 3 },
        baby: { radius: 10, score: 50, hp: 1 },
        boss: { radius: 75, score: 5000, hp: 50 }
    },
    powerup: {
        duration: 300, // 5 seconds at 60fps
        multiplier: 3
    }
};
