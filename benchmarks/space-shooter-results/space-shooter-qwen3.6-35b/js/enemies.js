/**
 * enemies.js
 * Pixel-art octopus enemy rendering, wave spawning, and boss logic.
 * Uses grid-based fillRect for authentic retro look.
 */

import CONFIG from './config.js';
import { particles } from './particles.js';
import { audio } from './audio.js';

// Pixel grids for octopus types (1 = filled, 0 = empty)
const OCTO_GRIDS = {
    small: [
        [0,0,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1],
        [1,1,0,1,1,0,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,0,1,1,0,1,0],
        [0,1,0,0,0,0,1,0],
        [0,1,0,0,0,0,1,0]
    ],
    medium: [
        [0,0,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,0,1,1,1,1,0,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [0,1,0,1,1,1,1,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0]
    ],
    baby: [
        [0,0,1,1,0,0],
        [0,1,1,1,1,0],
        [1,1,1,1,1,1],
        [1,1,0,0,1,1],
        [0,1,0,0,1,0],
        [0,1,0,0,1,0]
    ],
    boss: [
        [0,0,0,1,1,1,1,0,0,0],
        [0,0,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,0,1,1,1,1,0,1,1],
        [1,1,1,1,1,1,1,1,1,1],
        [0,1,0,1,1,1,1,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0],
        [0,1,0,0,0,0,0,0,1,0]
    ]
};

class Enemy {
    constructor(type, x, y, level) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.size = CONFIG.ENEMY_SIZES[type];
        this.radius = this.size / 2;
        this.color = CONFIG.ENEMY_COLORS[type];
        this.speed = CONFIG.ENEMY_SPEEDS[type] + (level * 0.1);
        this.health = CONFIG.ENEMY_HEALTH[type] + (level * 5);
        this.maxHealth = this.health;
        this.hitFlash = 0;
        this.time = 0;
        this.tentaclePhase = 0;
        this.grid = OCTO_GRIDS[type];
        this.gridW = this.grid[0].length;
        this.gridH = this.grid.length;
        this.cellW = this.size / this.gridW;
        this.cellH = this.size / this.gridH;
        this.shootTimer = 0;
        this.bossPhase = 0;
        this.bossHealthThreshold = this.maxHealth * 0.5;
    }

    update() {
        this.time++;
        this.tentaclePhase = Math.floor(this.time / 10) % 2;
        this.y += this.speed;
        if (this.type === 'small') {
            this.x += Math.sin(this.time * 0.05) * 1.5;
        } else if (this.type === 'medium') {
            this.shootTimer++;
            if (this.shootTimer > 120) {
                this.shootTimer = 0;
                return { type: 'ink', x: this.x, y: this.y + this.radius, vx: 0, vy: 3 };
            }
        } else if (this.type === 'boss') {
            this.x += Math.sin(this.time * 0.02) * 2;
            if (this.health < this.bossHealthThreshold && this.bossPhase === 0) {
                this.bossPhase = 1;
                return { type: 'boss_alert' };
            }
            if (this.time % 90 === 0) {
                return { type: 'ink_barrage', x: this.x, y: this.y + this.radius };
            }
        }
        if (this.hitFlash > 0) this.hitFlash--;
        return null;
    }

    draw(ctx) {
        ctx.save();
        const cellSize = this.size / this.gridW;
        for (let row = 0; row < this.gridH; row++) {
            for (let col = 0; col < this.gridW; col++) {
                if (this.grid[row][col] === 1) {
                    // Animate tentacles by toggling bottom rows
                    if (row >= this.gridH - 2 && this.tentaclePhase === 1) {
                        if (col % 2 === 0) continue;
                    }
                    ctx.fillStyle = this.hitFlash > 0 ? '#FFFFFF' : this.color;
                    ctx.fillRect(this.x - this.size/2 + col * cellSize, this.y - this.size/2 + row * cellSize, cellSize, cellSize);
                }
            }
        }
        // Boss health bar
        if (this.type === 'boss') {
            const barW = this.size;
            const barH = 8;
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - barW/2, this.y - this.size/2 - 15, barW, barH);
            ctx.fillStyle = this.bossPhase === 0 ? '#9400D3' : '#FF00FF';
            ctx.fillRect(this.x - barW/2, this.y - this.size/2 - 15, barW * (this.health / this.maxHealth), barH);
        }
        ctx.restore();
    }

    takeDamage(amount) {
        this.health -= amount;
        this.hitFlash = CONFIG.HIT_FLASH_FRAMES;
        return this.health <= 0;
    }
}

class EnemyManager {
    constructor() {
        this.enemies = [];
        this.waveTimer = 0;
        this.level = 1;
        this.spawnQueue = [];
    }

    update(player, bullets, game) {
        this.waveTimer++;
        if (this.waveTimer >= CONFIG.WAVE_INTERVAL) {
            this.waveTimer = 0;
            this.spawnWave();
        }

        // Spawn queue
        while (this.spawnQueue.length > 0) {
            const s = this.spawnQueue.shift();
            this.enemies.push(new Enemy(s.type, s.x, s.y, this.level));
        }

        const results = [];
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const action = e.update();
            if (action) results.push(action);
            if (e.y > game.height + e.size) {
                this.enemies.splice(i, 1);
            }
        }
        return results;
    }

    spawnWave() {
        const count = 3 + Math.floor(this.level * 1.5);
        for (let i = 0; i < count; i++) {
            const type = Math.random() > 0.7 ? 'medium' : 'small';
            const x = Math.random() * (game.width - 100) + 50;
            this.spawnQueue.push({ type, x, y: -50 - Math.random() * 200 });
        }
        if (this.level % CONFIG.BOSS_LEVEL_INTERVAL === 0) {
            this.spawnQueue.push({ type: 'boss', x: game.width/2, y: -200 });
        }
    }

    draw(ctx) {
        for (const e of this.enemies) {
            e.draw(ctx);
        }
    }

    checkCollisions(bullets, player) {
        const hits = [];
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            for (let j = bullets.length - 1; j >= 0; j--) {
                const b = bullets[j];
                const dx = e.x - b.x;
                const dy = e.y - b.y;
                const distSq = dx*dx + dy*dy;
                const hitDist = e.radius + b.radius;
                if (distSq < hitDist * hitDist) {
                    const dead = e.takeDamage(b.damage);
                    bullets.splice(j, 1);
                    hits.push({ enemy: e, dead, x: b.x, y: b.y });
                    break;
                }
            }
        }
        // Player contact
        for (const e of this.enemies) {
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            const distSq = dx*dx + dy*dy;
            const hitDist = e.radius + CONFIG.SHIP_RADIUS + CONFIG.SHIP_BUFFER;
            if (distSq < hitDist * hitDist) {
                hits.push({ enemy: e, dead: false, x: player.x, y: player.y, playerHit: true });
            }
        }
        return hits;
    }

    handleHit(hits, game) {
        for (const hit of hits) {
            const e = hit.enemy;
            if (hit.playerHit) {
                game.player.takeDamage(20);
                game.shake = CONFIG.SCREEN_SHAKE_INTENSITY * 2;
                game.flash = 10;
                audio.playExplosion('small');
            } else {
                particles.spawnSpark(hit.x, hit.y, '#FFFF00');
                particles.spawnDamageNumber(hit.x, hit.y - 20, Math.floor(Math.random()*5+5));
                audio.playHit();
                if (hit.dead) {
                    this.killEnemy(e, game);
                }
            }
        }
    }

    killEnemy(e, game) {
        particles.spawnExplosion(e.x, e.y, e.color, e.type === 'boss' ? 40 : 15);
        particles.spawnInk(e.x, e.y, e.color, e.type === 'boss' ? 20 : 8);
        audio.playExplosion(e.type);
        game.score += e.type === 'boss' ? 500 : e.type === 'medium' ? 100 : 50;
        game.combo++;
        game.shake = e.type === 'boss' ? 15 : e.type === 'medium' ? 8 : 4;
        if (e.type === 'medium') {
            this.spawnQueue.push({ type: 'baby', x: e.x - 20, y: e.y });
            this.spawnQueue.push({ type: 'baby', x: e.x + 20, y: e.y });
        }
        if (e.type === 'boss' || e.type === 'medium') {
            game.powerups.push({ x: e.x, y: e.y, radius: 15, active: true });
        }
        this.enemies = this.enemies.filter(en => en !== e);
    }
}

export { Enemy, EnemyManager };