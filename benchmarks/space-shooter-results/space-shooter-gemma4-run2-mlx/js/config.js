const CONFIG = {
    FPS: 60,
    COLORS: {
        bg: '#050505',
        player: '#2c3e50',
        playerGlow: '#00ffff',
        enemySmall: '#ff00ff',
        enemyMed: '#00ffff',
        enemyBaby: '#00ffff',
        enemyBoss: '#8e44ad',
        text: '#ffffff',
        damage: '#ffff00'
    },
    PLAYER: {
        speed: 0.35,
        fireRate: 150, // ms
        size: 30
    },
    ENEMY_TYPES: {
        SMALL: { size: 36, hp: 1, color: '#ff00ff', score: 100, speed: 2 },
        MEDIUM: { size: 48, hp: 3, color: '#00ffff', score: 300, speed: 1.5 },
        BABY: { size: 20, hp: 1, color: '#00ffff', score: 50, speed: 4 },
        BOSS: { size: 150, hp: 50, color: '#8e44ad', score: 5000, speed: 0.5 }
    },
    PARTICLES: {
        SPARK: { count: 5, life: 30, speed: 4 },
        INK: { count: 10, life: 60, speed: 1 }
    }
};|
