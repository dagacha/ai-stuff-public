/**
 * enemies.js - Pixel art octopus enemies rendered with grid-based fillRect.
 * Includes wave spawning, boss logic, and all octopus variants.
 */
const Enemies = {
    list: [],
    waveTimer: 0,
    waveEnemiesLeft: 0,
    waveTotal: 0,
    bossActive: false,
    bossSpawned: false,
    miniSwarm: [],

    // Pixel art grids for octopus types (1 = filled cell)
    grids: {
        small: [
            [0,0,0,1,1,0,0,0],
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,0,1,1,0,1,1],
            [1,0,0,0,0,0,0,1],
            [0,0,0,0,0,0,0,0],
            [0,0,1,0,0,1,0,0],
            [0,1,0,0,0,0,1,0],
        ],
        medium: [
            [0,0,0,0,1,1,0,0,0,0],
            [0,0,0,1,1,1,1,0,0,0],
            [0,0,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,0],
            [1,1,0,1,1,1,1,0,1,1],
            [1,0,0,0,0,0,0,0,0,1],
            [0,0,0,0,0,0,0,0,0,0],
            [0,0,0,1,0,0,1,0,0,0],
            [0,0,1,0,0,0,0,1,0,0],
            [0,1,0,0,0,0,0,0,1,0],
        ],
        baby: [
            [0,0,1,1,0,0],
            [0,1,1,1,1,0],
            [1,1,0,0,1,1],
            [0,0,0,0,0,0],
            [0,0,1,0,0,0],
            [0,1,0,0,1,0],
        ],
        boss: [
            [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
            [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
            [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
            [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,0,1,1,1,1,1,1,1,1,0,1,1],
            [1,0,0,0,1,1,1,1,1,1,0,0,0,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,1,0,0,0,0,0,0,1,0,0,0],
            [0,0,1,0,0,0,0,0,0,0,0,1,0,0],
            [0,1,0,0,0,0,0,0,0,0,0,0,1,0],
            [0,1,0,0,1,0,0,0,0,1,0,0,1,0],
        ],
    },

    // Tentacle animation states
    tentacleFrames: {
        small: [
            [0,0,1,0,0,1,0,0],
            [0,1,0,0,0,0,1,0],
        ],
        medium: [
            [0,0,0,1,0,0,1,0,0,0],
            [0,0,1,0,0,0,0,1,0,0],
        ],
        baby: [
            [0,0,1,0,0,0],
            [0,1,0,0,1,0],
        ],
        boss: [
            [0,0,0,1,0,0,0,0,0,0,1,0,0,0],
            [0,0,1,0,0,0,0,0,0,0,0,1,0,0],
            [0,1,0,0,1,0,0,0,0,1,0,0,1,0],
        ],
    },

    spawnWave(level) {
        this.bossActive = false;
        this.bossSpawned = false;
        this.miniSwarm = [];

        if (level % CONFIG.LEVEL.bossInterval === 0) {
            // Boss level
            this.bossSpawned = true;
            AudioEngine.playBossWarning();
            // Mini-swarm before boss
            for (let i = 0; i < 8; i++) {
                this.miniSwarm.push({
                    x: Math.random() * (window.innerWidth - 100) + 50,
                    y: -30 - Math.random() * 80,
                    type: 'small',
                    size: CONFIG.ENEMY_SIZES.small,
                    health: 1,
                    maxHealth: 1,
                    speed: 2 + Math.random(),
                    score: 5,
                    color: CONFIG.COLORS.pink,
                    hitFlash: 0,
                    sinePhase: Math.random() * Math.PI * 2,
                    sineAmp: 20,
                    sineFreq: 0.03,
                    isMiniSwarm: true,
                    tentacleFrame: 0,
                    inkTimer: 0,
                    bossPhase: 0,
                });
            }
        } else {
            // Normal wave
            this.waveTotal = CONFIG.LEVEL.enemiesPerLevelBase + level * CONFIG.LEVEL.enemiesPerLevelGrowth;
            this.waveEnemiesLeft = this.waveTotal;
        }
    },

    spawnEnemy(level) {
        const types = ['small'];
        if (level >= 2) types.push('medium');
        if (level >= 3) types.push('baby');

        const type = types[Math.floor(Math.random() * types.length)];
        const stats = CONFIG.ENEMY_STATS[type];
        const size = CONFIG.ENEMY_SIZES[type];

        const enemy = {
            x: Math.random() * (window.innerWidth - size * 2) + size,
            y: -size,
            type: type,
            size: size,
            health: stats.health + Math.floor(level * 0.5),
            maxHealth: stats.health + Math.floor(level * 0.5),
            speed: stats.speed + level * 0.05,
            score: stats.score,
            color: stats.color,
            hitFlash: 0,
            sinePhase: Math.random() * Math.PI * 2,
            sineAmp: type === 'small' ? CONFIG.ENEMY_STATS.small.sineAmplitude : 15,
            sineFreq: type === 'small' ? CONFIG.ENEMY_STATS.small.sineFrequency : 0.02,
            isMiniSwarm: false,
            tentacleFrame: 0,
            inkTimer: type === 'medium' ? CONFIG.ENEMY_STATS.medium.fireRate : 0,
            bossPhase: 0,
            inkProjectiles: [],
        };

        this.list.push(enemy);
        this.waveEnemiesLeft--;
    },

    spawnBoss(level) {
        const stats = CONFIG.ENEMY_STATS.boss;
        const size = CONFIG.ENEMY_SIZES.boss;
        const health = stats.health + level * 10;

        this.list.push({
            x: window.innerWidth / 2,
            y: -size,
            type: 'boss',
            size: size,
            health: health,
            maxHealth: health,
            speed: stats.speed,
            score: stats.score,
            color: stats.color,
            hitFlash: 0,
            sinePhase: 0,
            sineAmp: 60,
            sineFreq: 0.01,
            isMiniSwarm: false,
            tentacleFrame: 0,
            inkTimer: stats.inkBarrageInterval,
            bossPhase: 0,
            inkProjectiles: [],
            tentacleReach: 0,
            phaseTransition: false,
        });
        this.bossActive = true;
    },

    update(level, playerX, playerY) {
        // Spawn mini-swarm enemies
        for (let i = this.miniSwarm.length - 1; i >= 0; i--) {
            const e = this.miniSwarm[i];
            e.y += e.speed;
            e.x += Math.sin(e.sinePhase) * e.sineAmp * 0.1;
            e.sinePhase += e.sineFreq;
            e.tentacleFrame = (e.tentacleFrame + 1) % 2;
            if (e.y > window.innerHeight + e.size) {
                this.miniSwarm.splice(i, 1);
            }
        }

        // Spawn boss when mini-swarm is cleared
        if (this.bossSpawned && this.miniSwarm.length === 0 && !this.bossActive) {
            this.spawnBoss(level);
            this.bossSpawned = false;
        }

        // Spawn normal wave enemies
        if (!this.bossActive && this.waveEnemiesLeft > 0 && this.waveTimer <= 0) {
            this.spawnEnemy(level);
            this.waveTimer = 20 + Math.random() * 30;
        }
        if (this.waveTimer > 0) this.waveTimer--;

        // Update all enemies
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];

            if (e.hitFlash > 0) e.hitFlash--;

            if (e.type === 'boss') {
                // Boss movement
                e.y += e.speed * 0.5;
                e.x += Math.sin(e.sinePhase) * e.sineAmp * 0.08;
                e.sinePhase += e.sineFreq;
                e.tentacleFrame = (e.tentacleFrame + 1) % 3;

                // Boss attacks
                e.inkTimer--;
                if (e.inkTimer <= 0 && e.y > 100) {
                    e.inkTimer = CONFIG.ENEMY_STATS.boss.inkBarrageInterval;
                    // Ink barrage
                    for (let j = 0; j < 5; j++) {
                        const angle = Math.PI * 0.15 + (Math.PI * 0.7 / 4) * j;
                        e.inkProjectiles.push({
                            x: e.x,
                            y: e.y + e.size / 2,
                            vx: Math.cos(angle) * 3,
                            vy: Math.sin(angle) * 3,
                            size: 6,
                            color: e.color,
                            life: 80,
                        });
                    }
                }

                // Check phase transition
                if (e.health < e.maxHealth * 0.5 && e.bossPhase === 0) {
                    e.bossPhase = 1;
                    e.phaseTransition = true;
                    e.speed *= 1.5;
                }
            } else {
                // Normal enemy movement
                e.y += e.speed;
                e.x += Math.sin(e.sinePhase) * e.sineAmp * 0.1;
                e.sinePhase += e.sineFreq;
                e.tentacleFrame = (e.tentacleFrame + 1) % 2;
            }

            // Update ink projectiles
            for (let j = e.inkProjectiles.length - 1; j >= 0; j--) {
                const p = e.inkProjectiles[j];
                p.x += p.vx;
                p.y += p.vy;
                p.life--;
                if (p.life <= 0 || p.y > window.innerHeight + 20 || p.x < -20 || p.x > window.innerWidth + 20) {
                    e.inkProjectiles.splice(j, 1);
                }
            }

            // Remove off-screen enemies
            if (e.y > window.innerHeight + e.size * 2) {
                this.list.splice(i, 1);
            }
        }
    },

    render(ctx, time) {
        // Render mini-swarm
        for (const e of this.miniSwarm) {
            this._renderOctopus(ctx, e);
        }

        // Render enemies
        for (const e of this.list) {
            this._renderOctopus(ctx, e);

            // Render ink projectiles
            for (const p of e.inkProjectiles) {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.life / 80);
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
                ctx.globalAlpha = 1;
            }
        }
    },

    _renderOctopus(ctx, e) {
        if (e.hitFlash > 0) {
            // White flash overlay
            const grid = this.grids[e.type];
            const gridH = grid.length;
            const gridW = grid[0].length;
            const cellW = e.size / gridW;
            const cellH = e.size / gridH;

            ctx.fillStyle = '#FFFFFF';
            for (let row = 0; row < gridH; row++) {
                for (let col = 0; col < gridW; col++) {
                    if (grid[row][col] === 1) {
                        ctx.fillRect(
                            e.x - e.size / 2 + col * cellW,
                            e.y - e.size / 2 + row * cellH,
                            cellW, cellH
                        );
                    }
                }
            }
            return;
        }

        // Normal render with color
        const grid = this.grids[e.type];
        const gridH = grid.length;
        const gridW = grid[0].length;
        const cellW = e.size / gridW;
        const cellH = e.size / gridH;

        ctx.fillStyle = e.color;
        for (let row = 0; row < gridH; row++) {
            for (let col = 0; col < gridW; col++) {
                if (grid[row][col] === 1) {
                    ctx.fillRect(
                        e.x - e.size / 2 + col * cellW,
                        e.y - e.size / 2 + row * cellH,
                        cellW, cellH
                    );
                }
            }
        }

        // Render animated tentacles (bottom rows)
        const tentGrid = this.tentacleFrames[e.type];
        if (tentGrid && e.tentacleFrame !== undefined) {
            const tGrid = tentGrid[e.tentacleFrame % tentGrid.length];
            const tGridH = tGrid.length;
            const tGridW = tGrid[0].length;
            const tCellW = e.size / tGridW;
            const tCellH = e.size / tGridH;

            ctx.fillStyle = e.color;
            for (let row = 0; row < tGridH; row++) {
                for (let col = 0; col < tGridW; col++) {
                    if (tGrid[row][col] === 1) {
                        ctx.fillRect(
                            e.x - e.size / 2 + col * tCellW,
                            e.y - e.size / 2 + row * tCellH,
                            tCellW, tCellH
                        );
                    }
                }
            }
        }
    },

    getEnemies() {
        return this.list;
    },

    getInkProjectiles() {
        const all = [];
        for (const e of this.list) {
            all.push(...e.inkProjectiles);
        }
        return all;
    },

    isWaveComplete() {
        return this.waveEnemiesLeft <= 0 && this.list.length === 0 && !this.bossActive && this.miniSwarm.length === 0;
    },

    isBossAlive() {
        return this.bossActive;
    },

    clear() {
        this.list = [];
        this.waveTimer = 0;
        this.waveEnemiesLeft = 0;
        this.waveTotal = 0;
        this.bossActive = false;
        this.bossSpawned = false;
        this.miniSwarm = [];
    }
};