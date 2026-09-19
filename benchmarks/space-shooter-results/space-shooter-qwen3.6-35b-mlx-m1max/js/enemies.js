// js/enemies.js
/**
 * enemies.js - Pixelated octopus enemy types with grid-based rendering.
 * Wave spawning, boss logic, and tentacle animation.
 */

const Enemies = (() => {
    let enemies = [];
    let spawnTimer = 0;
    let waveNumber = 0;
    let bossActive = false;
    let bossWarningTimer = 0;
    let bossWarningActive = false;

    // Pixel art grids (1 = filled, 0 = empty)
    const GRIDS = {
        small: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,0,1,1,0,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,0],
            [0,0,1,0,0,1,0,0],
            [0,0,1,0,0,1,0,0],
        ],
        medium: [
            [0,0,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1],
            [1,1,0,1,1,1,1,0,1,1],
            [1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,1,1,0],
            [0,0,1,0,0,0,0,1,0,0],
            [0,0,1,0,0,0,0,1,0,0],
            [0,0,1,0,0,0,0,1,0,0],
        ],
        baby: [
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,0],
            [0,0,1,0,0,1,0,0],
        ],
        boss: [
            [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
            [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,0,1,1,1,1,1,1,1,1,0,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
            [0,0,1,0,0,1,1,1,1,0,0,1,0,0],
        ],
    };

    function spawnWave(level) {
        const count = CONFIG.LEVELS.baseEnemyCount + level * CONFIG.LEVELS.enemyCountPerLevel;
        const types = ['small', 'small', 'small', 'medium'];
        if (level > 3) types.push('medium', 'medium');
        if (level > 6) types.push('baby');

        for (let i = 0; i < count; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const stats = CONFIG.ENEMIES[type];
            const x = 60 + Math.random() * (window.innerWidth - 120);
            const y = -stats.size - Math.random() * 200;
            const hpMult = 1 + (level - 1) * 0.15;

            enemies.push({
                type,
                x,
                y,
                size: stats.size,
                health: Math.floor(stats.health * hpMult),
                maxHealth: Math.floor(stats.health * hpMult),
                speed: stats.speed + level * 0.05,
                score: stats.score,
                color: stats.color,
                grid: GRIDS[type],
                gridRows: GRIDS[type].length,
                gridCols: GRIDS[type][0].length,
                hitFlash: 0,
                frame: 0,
                time: Math.random() * 100,
                vx: 0,
                vy: 0,
                shootTimer: type === 'medium' ? 60 + Math.random() * 60 : 0,
                isBoss: type === 'boss',
                bossPhase: 0,
                bossTargetY: 150,
                tentacleOffset: 0,
                inkBullets: [],
            });
        }
    }

    function spawnBoss(level) {
        bossActive = true;
        bossWarningActive = true;
        bossWarningTimer = 120;
        Audio.playBossWarning();

        const stats = CONFIG.ENEMIES.boss;
        const hpMult = 1 + (level - 1) * 0.3;
        const x = window.innerWidth / 2;
        const y = -stats.size;

        enemies.push({
            type: 'boss',
            x,
            y,
            size: stats.size,
            health: Math.floor(stats.health * hpMult),
            maxHealth: Math.floor(stats.health * hpMult),
            speed: stats.speed,
            score: stats.score,
            color: stats.color,
            grid: GRIDS.boss,
            gridRows: GRIDS.boss.length,
            gridCols: GRIDS.boss[0].length,
            hitFlash: 0,
            frame: 0,
            time: 0,
            vx: 0,
            vy: 0.3,
            shootTimer: 0,
            isBoss: true,
            bossPhase: 0,
            bossTargetY: 150,
            tentacleOffset: 0,
            inkBullets: [],
        });
    }

    function spawnBabyOctopi(x, y) {
        for (let i = 0; i < 2; i++) {
            const stats = CONFIG.ENEMIES.baby;
            enemies.push({
                type: 'baby',
                x: x + (Math.random() - 0.5) * 40,
                y: y,
                size: stats.size,
                health: stats.health,
                maxHealth: stats.health,
                speed: stats.speed,
                score: stats.score,
                color: stats.color,
                grid: GRIDS.baby,
                gridRows: GRIDS.baby.length,
                gridCols: GRIDS.baby[0].length,
                hitFlash: 0,
                frame: 0,
                time: Math.random() * 100,
                vx: (i === 0 ? -1 : 1) * 2,
                vy: 1,
                shootTimer: 0,
                isBoss: false,
                bossPhase: 0,
                bossTargetY: 150,
                tentacleOffset: 0,
                inkBullets: [],
            });
        }
    }

    function update(w, h, player) {
        spawnTimer++;
        const interval = Math.max(30, CONFIG.ENEMIES.spawnInterval - waveNumber * 3);

        if (spawnTimer >= interval && !bossActive) {
            spawnTimer = 0;
            waveNumber++;
            spawnWave(waveNumber);
        }

        // Boss warning
        if (bossWarningActive) {
            bossWarningTimer--;
            if (bossWarningTimer <= 0) {
                bossWarningActive = false;
            }
        }

        // Check if boss should spawn
        if (!bossActive && waveNumber > 0 && waveNumber % CONFIG.LEVELS.bossEvery === 0 && waveNumber > 0) {
            // Spawn boss after a delay
            if (enemies.filter(e => !e.isBoss).length === 0) {
                spawnBoss(waveNumber);
            }
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            e.time++;
            e.frame = Math.floor(e.time / 8) % 2;
            if (e.hitFlash > 0) e.hitFlash--;

            if (e.isBoss) {
                // Boss movement
                if (e.y < e.bossTargetY) {
                    e.y += e.speed;
                } else {
                    e.x += Math.sin(e.time * 0.02) * 1.5;
                    e.y = e.bossTargetY + Math.sin(e.time * 0.015) * 30;
                }

                // Boss shooting
                e.shootTimer--;
                if (e.shootTimer <= 0) {
                    e.shootTimer = 30;
                    const angle = Math.atan2(player.y - e.y, player.x - e.x);
                    for (let a = -0.3; a <= 0.3; a += 0.15) {
                        e.inkBullets.push({
                            x: e.x,
                            y: e.y + e.size / 2,
                            vx: Math.cos(angle + a) * 3,
                            vy: Math.sin(angle + a) * 3,
                            size: 6,
                            color: e.color,
                        });
                    }
                    Audio.playInkBlast();
                }

                // Tentacle animation
                e.tentacleOffset = Math.sin(e.time * 0.05) * 2;
            } else {
                // Normal enemy movement
                e.y += e.speed;
                e.x += Math.sin(e.time * 0.03 + e.x) * 0.5 + e.vx;

                // Medium enemies shoot
                if (e.type === 'medium') {
                    e.shootTimer--;
                    if (e.shootTimer <= 0) {
                        e.shootTimer = 90;
                        const angle = Math.atan2(player.y - e.y, player.x - e.x);
                        e.inkBullets.push({
                            x: e.x,
                            y: e.y + e.size / 2,
                            vx: Math.cos(angle) * 2,
                            vy: Math.sin(angle) * 2,
                            size: 5,
                            color: e.color,
                        });
                    }
                }
            }

            // Update ink bullets
            for (let j = e.inkBullets.length - 1; j >= 0; j--) {
                const b = e.inkBullets[j];
                b.x += b.vx;
                b.y += b.vy;
                if (b.y > h + 20 || b.y < -20 || b.x < -20 || b.x > w + 20) {
                    e.inkBullets.splice(j, 1);
                }
            }

            // Remove off-screen
            if (e.y > h + e.size + 50) {
                enemies.splice(i, 1);
            }
        }
    }

    function draw(ctx, w, h) {
        for (const e of enemies) {
            const cellW = e.size / e.gridCols;
            const cellH = e.size / e.gridRows;
            const cx = e.x - e.size / 2;
            const cy = e.y - e.size / 2;

            // Hit flash
            if (e.hitFlash > 0) {
                ctx.fillStyle = CONFIG.COLORS.white;
                for (let row = 0; row < e.gridRows; row++) {
                    for (let col = 0; col < e.gridCols; col++) {
                        if (e.grid[row][col]) {
                            ctx.fillRect(cx + col * cellW, cy + row * cellH, cellW, cellH);
                        }
                    }
                }
                continue;
            }

            // Draw pixel grid
            ctx.fillStyle = e.color;
            for (let row = 0; row < e.gridRows; row++) {
                for (let col = 0; col < e.gridCols; col++) {
                    if (e.grid[row][col]) {
                        // Animate tentacles for non-boss
                        let drawCell = true;
                        if (!e.isBoss && row >= e.gridRows - 2) {
                            drawCell = e.frame === 0 ? (col % 2 === 0) : (col % 2 === 1);
                        }
                        if (drawCell) {
                            ctx.fillRect(cx + col * cellW, cy + row * cellH, cellW, cellH);
                        }
                    }
                }
            }

            // Boss tentacle reach effect
            if (e.isBoss) {
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.5;
                for (let t = 0; t < 8; t++) {
                    const angle = (Math.PI * 2 * t) / 8;
                    const tx = e.x + Math.cos(angle) * (e.size / 2 + 10 + e.tentacleOffset);
                    const ty = e.y + Math.sin(angle) * (e.size / 2 + 10 + e.tentacleOffset);
                    ctx.beginPath();
                    ctx.moveTo(e.x + Math.cos(angle) * e.size / 2, e.y + Math.sin(angle) * e.size / 2);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            // Draw ink bullets
            for (const b of e.inkBullets) {
                ctx.fillStyle = e.color;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function getInkBullets() {
        const bullets = [];
        for (const e of enemies) {
            for (const b of e.inkBullets) {
                bullets.push(b);
            }
        }
        return bullets;
    }

    function clear() {
        enemies = [];
        spawnTimer = 0;
        waveNumber = 0;
        bossActive = false;
        bossWarningActive = false;
        bossWarningTimer = 0;
    }

    return {
        update,
        draw,
        clear,
        getInkBullets,
        spawnBabyOctopi,
        spawnBoss,
        getWaveNumber: () => waveNumber,
        isBossActive: () => bossActive,
        isBossWarning: () => bossWarningActive,
        getBossWarningTimer: () => bossWarningTimer,
    };
})();
