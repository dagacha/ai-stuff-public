/* js/enemies.js */
const Enemies = (() => {
    let list = [];
    let frameCount = 0;
    let spawnRate = CONFIG.game.spawnRate;

    // Pixel Art Patterns (Grid based)
    const PATTERNS = {
        small: [
            [0,1,0],
            [1,1,1],
            [0,1,0],
            [1,0,1]
        ],
        medium: [
            [0,1,0,0,0,1,0],
            [1,1,1,1,1,1,1],
            [1,0,1,1,1,0,1],
            [0,1,1,1,1,1,0],
            [1,0,0,0,0,0,1]
        ],
        baby: [
            [0,1,0],
            [1,1,1],
            [0,1,0]
        ],
        boss: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,0,1,1,0,1,0],
            [1,0,1,0,0,1,0,1],
            [1,0,0,1,1,0,0,1]
        ]
    };

    const drawPixelArt = (ctx, pattern, x, y, size, color) => {
        ctx.fillStyle = color;
        const rows = pattern.length;
        const cols = pattern[0].length;
        const cellSize = size / rows; // Normalize to grid

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (pattern[r][c] === 1) {
                    ctx.fillRect(
                        x - (cols * cellSize) / 2 + c * cellSize,
                        y - (rows * cellSize) / 2 + r * cellSize,
                        cellSize - 1, // -1 for grid effect
                        cellSize - 1
                    );
                }
            }
        }
    };

    const spawn = (width, height, level) => {
        const rand = Math.random();
        let type = 'small';
        let color = CONFIG.colors.enemySmall;
        let radius = CONFIG.enemies.small.radius;
        let hp = CONFIG.enemies.small.hp;
        let score = CONFIG.enemies.small.score;
        let pattern = PATTERNS.small;

        // Difficulty scaling
        if (level > 3 && rand > 0.7) {
            type = 'medium';
            color = CONFIG.colors.enemyMed;
            radius = CONFIG.enemies.medium.radius;
            hp = CONFIG.enemies.medium.hp;
            score = CONFIG.enemies.medium.score;
            pattern = PATTERNS.medium;
        } else if (level > 1 && rand > 0.9) {
            type = 'baby';
            color = CONFIG.colors.enemyBaby;
            radius = CONFIG.enemies.baby.radius;
            hp = CONFIG.enemies.baby.hp;
            score = CONFIG.enemies.baby.score;
            pattern = PATTERNS.baby;
        }

        list.push({
            type, x: Math.random() * (width - 40) + 20, y: -50,
            radius, hp, score, color, pattern,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 2 + 2,
            time: 0
        });
    };

    const spawnBoss = (width, height) => {
        list.push({
            type: 'boss',
            x: width / 2,
            y: -100,
            radius: CONFIG.enemies.boss.radius,
            hp: CONFIG.enemies.boss.hp,
            score: CONFIG.enemies.boss.score,
            color: CONFIG.colors.enemyBoss,
            pattern: PATTERNS.boss,
            vx: 2,
            vy: 1,
            time: 0
        });
    };

    const update = (ctx, width, height, player) => {
        frameCount++;
        
        // Spawn Logic
        if (frameCount % spawnRate === 0) {
            // Check for boss level
            if (Game.level % CONFIG.game.bossLevelInterval === 0 && list.length === 0) {
                spawnBoss(width, height);
            } else {
                spawn(width, height, Game.level);
            }
        }

        for (let i = list.length - 1; i >= 0; i--) {
            const e = list[i];
            e.time += 0.05;

            // Movement Logic
            if (e.type === 'small') {
                e.x += Math.sin(e.time) * 2;
                e.y += e.vy;
            } else if (e.type === 'boss') {
                if (e.y < 100) e.y += e.vy; // Enter screen
                e.x += Math.sin(e.time) * 3;
            } else {
                e.y += e.vy;
            }

            // Draw
            drawPixelArt(ctx, e.pattern, e.x, e.y, e.radius * 2, e.color);

            // Cleanup
            if (e.y > height + 50) {
                list.splice(i, 1);
            }
        }
    };

    return { update, list };
})();
