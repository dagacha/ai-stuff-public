/**
 * enemies.js
 * Enemy logic, spawning, and pixel art rendering.
 */

const Enemies = (() => {
    let enemies = [];
    let spawnTimer = 0;
    let level = 1;

    // Pixel Art Grids (1 = draw, 0 = empty)
    const PIXELS = {
        small: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,0,1,1,1,1,0,1],
            [1,0,1,0,0,1,0,1],
            [0,0,1,0,0,1,0,0],
            [0,1,1,0,0,1,1,0],
            [1,1,0,0,0,0,1,1]
        ],
        medium: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1],
            [1,0,1,1,1,1,0,1],
            [0,1,1,0,0,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,0,1,0,0,1,0,1]
        ],
        boss: [
            [0,0,0,1,1,1,1,0,0,0],
            [0,0,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1],
            [1,1,1,0,0,0,0,1,1,1],
            [1,1,0,1,1,1,1,0,1,1],
            [1,1,0,1,0,0,1,0,1,1],
            [0,1,1,0,0,0,0,1,1,0],
            [0,1,1,1,0,0,1,1,1,0],
            [1,1,0,1,1,1,1,0,1,1]
        ]
    };

    class Enemy {
        constructor(type, x, y) {
            this.type = type;
            this.x = x;
            this.y = y;
            this.width = CONFIG.ENEMIES[type].size;
            this.height = CONFIG.ENEMIES[type].size;
            this.hp = CONFIG.ENEMIES[type].hp;
            this.maxHp = this.hp;
            this.color = CONFIG.ENEMIES[type].color;
            this.speed = CONFIG.GAME.baseEnemySpeed + (level * 0.1);
            this.frame = 0;
            this.hitFlash = 0;
            
            // Movement pattern
            this.startX = x;
            this.sineOffset = Math.random() * 100;
        }

        update() {
            this.y += this.speed;
            this.frame++;
            if (this.hitFlash > 0) this.hitFlash--;

            // Sine wave movement for small/medium
            if (this.type !== 'boss') {
                this.x = this.startX + Math.sin((this.y + this.sineOffset) * 0.02) * 50;
            } else {
                // Boss slow drift
                this.x += Math.sin(this.frame * 0.02) * 2;
            }
        }

        draw(ctx) {
            const grid = PIXELS[this.type];
            const rows = grid.length;
            const cols = grid[0].length;
            const cellW = this.width / cols;
            const cellH = this.height / rows;

            // Determine color
            let drawColor = this.color;
            if (this.hitFlash > 0) drawColor = '#FFFFFF';

            ctx.fillStyle = drawColor;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c] === 1) {
                        // Animate tentacles for small/medium
                        let drawY = this.y + r * cellH;
                        if (this.type === 'small' && r === rows - 1) {
                            drawY += Math.sin(this.frame * 0.2 + c) * 5;
                        }
                        
                        ctx.fillRect(
                            this.x + c * cellW, 
                            drawY, 
                            cellW, 
                            cellH
                        );
                    }
                }
            }
        }

        takeDamage(amount) {
            this.hp -= amount;
            this.hitFlash = 3;
            Particles.spawnDamage(this.x, this.y, amount);
            AudioSys.enemyHit();
            return this.hp <= 0;
        }
    }

    function spawnWave() {
        spawnTimer++;
        const rate = Math.max(20, CONFIG.GAME.spawnRate - (level * 2));
        
        if (spawnTimer > rate) {
            spawnTimer = 0;
            
            // Boss Logic
            if (level % CONFIG.GAME.bossLevelInterval === 0 && enemies.length === 0) {
                enemies.push(new Enemy('boss', window.innerWidth / 2, -150));
                AudioSys.bossWarning();
                return;
            }

            // Normal Spawns
            const x = Math.random() * (window.innerWidth - 100) + 50;
            const type = Math.random() > 0.7 ? 'medium' : 'small';
            enemies.push(new Enemy(type, x, -50));
        }
    }

    function update() {
        spawnWave();
        enemies = enemies.filter(e => e.y < window.innerHeight + 100);
        enemies.forEach(e => e.update());
    }

    function draw(ctx) {
        enemies.forEach(e => e.draw(ctx));
    }

    function getEnemies() { return enemies; }
    function setLevel(l) { level = l; }
    function getLevel() { return level; }

    return { update, draw, spawnWave, getEnemies, setLevel, getLevel };
})();
