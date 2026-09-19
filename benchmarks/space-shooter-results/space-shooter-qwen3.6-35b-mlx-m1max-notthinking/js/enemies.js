/**
 * enemies.js
 * Enemy logic, pixel art rendering, and spawning.
 */
const Enemies = {
    list: [],
    spawnTimer: 0,
    waveActive: false,
    bossActive: false,

    // Pixel Grids (1 = filled, 0 = empty)
    grids: {
        small: [
            [0,1,1,1,1,1,0],
            [1,1,1,1,1,1,1],
            [1,1,0,0,0,1,1],
            [1,1,1,1,1,1,1],
            [0,1,1,1,1,1,0],
            [0,1,0,0,0,1,0],
            [0,1,0,0,0,1,0]
        ],
        medium: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,0],
            [0,1,0,0,0,0,1,0],
            [0,1,0,0,0,0,1,0],
            [0,1,0,0,0,0,1,0]
        ],
        boss: [
            [0,0,0,1,1,1,1,0,0,0],
            [0,0,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,0],
            [1,1,0,1,1,1,1,0,1,1],
            [1,1,1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,1,1,0,0],
            [0,0,1,0,0,0,0,1,0,0],
            [0,1,1,0,0,0,0,1,1,0],
            [1,1,0,0,0,0,0,0,1,1]
        ]
    },

    spawn(type, x, y) {
        const stats = CONFIG.enemies[type];
        this.list.push({
            type: type,
            x: x,
            y: y,
            size: stats.size,
            health: stats.health,
            maxHealth: stats.health,
            speed: stats.speed,
            color: stats.color,
            score: stats.score,
            grid: this.grids[type] || this.grids.small,
            frame: 0,
            hitFlash: 0,
            vx: 0,
            vy: 0
        });
    },

    spawnWave(level) {
        this.waveActive = true;
        const count = 3 + Math.floor(level / 2);
        
        for(let i=0; i<count; i++) {
            setTimeout(() => {
                const type = Math.random() > 0.8 ? 'medium' : 'small';
                const x = Math.random() * (window.innerWidth - 100) + 50;
                this.spawn(type, x, -50);
            }, i * 500);
        }
    },

    spawnBoss() {
        this.bossActive = true;
        AudioSys.bossWarning();
        setTimeout(() => {
            this.spawn('boss', window.innerWidth / 2, -100);
        }, 2000);
    },

    update() {
        // Spawning Logic
        if (!this.waveActive && this.list.length === 0 && !this.bossActive) {
            this.spawnTimer++;
            if (this.spawnTimer > 120) {
                this.spawnWave(game.level);
                this.spawnTimer = 0;
            }
        }

        // Boss Logic
        if (this.bossActive && this.list.length === 0) {
            this.bossActive = false;
            game.nextLevel();
        }

        // Update Enemies
        for (let i = this.list.length - 1; i >= 0; i--) {
            let e = this.list[i];
            
            // Movement
            e.y += e.speed;
            e.frame++;

            // Sine wave for small/medium
            if (e.type !== 'boss') {
                e.x += Math.sin(e.frame * 0.05) * 2;
            } else {
                // Boss hover
                e.y = Math.min(e.y, 200);
                e.x += Math.sin(e.frame * 0.02) * 1;
            }

            // Hit Flash decay
            if (e.hitFlash > 0) e.hitFlash--;

            // Remove if off screen
            if (e.y > window.innerHeight + e.size) {
                this.list.splice(i, 1);
            }
        }
    },

    draw(ctx) {
        this.list.forEach(e => {
            const cellSize = e.size / e.grid.length;
            
            // Hit Flash
            if (e.hitFlash > 0) {
                ctx.fillStyle = '#FFFFFF';
            } else {
                ctx.fillStyle = e.color;
            }

            // Draw Grid
            for (let r = 0; r < e.grid.length; r++) {
                for (let c = 0; c < e.grid[r].length; c++) {
                    if (e.grid[r][c] === 1) {
                        // Animate tentacles for non-boss
                        let drawY = e.y + r * cellSize;
                        if (e.type !== 'boss' && r === e.grid.length - 1) {
                            drawY += Math.sin(e.frame * 0.2 + c) * 5;
                        }
                        ctx.fillRect(e.x - e.size/2 + c * cellSize, drawY, cellSize, cellSize);
                    }
                }
            }

            // Boss Health Bar
            if (e.type === 'boss') {
                ctx.fillStyle = '#333';
                ctx.fillRect(e.x - 75, e.y - 20, 150, 10);
                ctx.fillStyle = '#FF0000';
                ctx.fillRect(e.x - 75, e.y - 20, 150 * (e.health / e.maxHealth), 10);
            }
        });
    }
};
