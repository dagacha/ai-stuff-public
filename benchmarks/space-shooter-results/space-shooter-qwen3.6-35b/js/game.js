/**
 * game.js
 * Main game loop, state machine, collision detection, damage numbers, screen shake, and chromatic aberration.
 */

import CONFIG from './config.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import Background from './background.js';
import { EnemyManager } from './enemies.js';
import Player from './player.js';
import UI from './ui.js';

let canvas, ctx;
let game;
let mouse = { x: 0, y: 0 };
let keys = {};
let isMouseDown = false;
let lastTime = 0;
let frameCount = 0;

class Game {
    constructor() {
        this.state = 'menu';
        this.bullets = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.enemiesKilled = 0;
        this.shake = 0;
        this.flash = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.paused = false;
        this.level = 1;
        this.waveTimer = 0;
        this.unleashActive = false;
    }

    init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        this.width = canvas.width;
        this.height = canvas.height;
        ctx.imageSmoothingEnabled = CONFIG.IMAGE_SMOOTHING;

        this.player = new Player(this.width / 2, this.height - 100);
        this.background = new Background(canvas);
        this.enemies = new EnemyManager();
        this.ui = new UI(canvas);

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            this.width = canvas.width;
            this.height = canvas.height;
            this.background.width = canvas.width;
            this.background.height = canvas.height;
        });

        canvas.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        canvas.addEventListener('mousedown', () => {
            isMouseDown = true;
            if (this.state === 'menu') this.start();
            if (this.state === 'gameover') this.restart();
        });

        canvas.addEventListener('mouseup', () => isMouseDown = false);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.state === 'playing') this.state = 'paused';
                else if (this.state === 'paused') this.state = 'playing';
            }
        });

        requestAnimationFrame((t) => this.loop(t));
    }

    start() {
        audio.init();
        this.state = 'playing';
        this.player = new Player(this.width / 2, this.height - 100);
        this.enemies = new EnemyManager();
        this.bullets = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.enemiesKilled = 0;
        this.level = 1;
        this.shake = 0;
        this.flash = 0;
        this.unleashActive = false;
    }

    restart() {
        this.start();
    }

    update() {
        if (this.state !== 'playing') return;

        this.background.update();
        this.player.update(mouse.x, mouse.y, keys);

        // Fire
        if (isMouseDown) {
            const newBullets = this.player.fire();
            this.bullets.push(...newBullets);
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            // Bullet trails
            if (frameCount % 2 === 0) {
                particles.spawnTrail(b.x, b.y, b.color);
            }
            if (b.y < -20 || b.x < -20 || b.x > this.width + 20) {
                this.bullets.splice(i, 1);
            }
        }

        // Update enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.x += b.vx;
            b.y += b.vy;
            if (b.y > this.height + 20 || b.x < -20 || b.x > this.width + 20) {
                this.enemyBullets.splice(i, 1);
            }
        }

        // Enemy actions
        const enemyActions = this.enemies.update(this.player, this.bullets, this);
        for (const action of enemyActions) {
            if (action.type === 'ink') {
                this.enemyBullets.push({ x: action.x, y: action.y, vx: action.vx, vy: action.vy, radius: 6, damage: 10, color: '#00BFFF' });
            } else if (action.type === 'ink_barrage') {
                for (let i = -2; i <= 2; i++) {
                    this.enemyBullets.push({ x: action.x + i*30, y: action.y, vx: i*1.5, vy: 3, radius: 8, damage: 15, color: '#9400D3' });
                }
            } else if (action.type === 'boss_alert') {
                audio.playBossAlarm();
            }
        }

        // Collisions
        const hits = this.enemies.checkCollisions(this.bullets, this.player);
        this.enemies.handleHit(hits, this);

        // Player vs enemy bullets
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            const dx = b.x - this.player.x;
            const dy = b.y - this.player.y;
            if (dx*dx + dy*dy < (b.radius + CONFIG.SHIP_RADIUS + CONFIG.SHIP_BUFFER)*(b.radius + CONFIG.SHIP_RADIUS + CONFIG.SHIP_BUFFER)) {
                this.player.takeDamage(b.damage);
                this.enemyBullets.splice(i, 1);
                this.shake = 8;
                this.flash = 5;
                audio.playExplosion('small');
            }
        }

        // Powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            p.y += 1;
            const dx = p.x - this.player.x;
            const dy = p.y - this.player.y;
            if (dx*dx + dy*dy < (p.radius + 20)*(p.radius + 20)) {
                this.player.activateUnleash();
                this.unleashActive = true;
                audio.playPowerup();
                this.powerups.splice(i, 1);
            }
            if (p.y > this.height + 20) this.powerups.splice(i, 1);
        }

        // Level progression
        this.waveTimer++;
        if (this.waveTimer > 1200) {
            this.waveTimer = 0;
            this.level++;
            this.enemies.level = this.level;
            // Upgrade ship tier every 3 levels
            if (this.level % 3 === 0 && this.player.tier < 4) {
                this.player.tier++;
            }
        }

        // Combo decay
        if (this.player.health < this.player.maxHealth) {
            this.combo = 0;
        }
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;

        // Screen shake
        if (this.shake > 0) {
            this.shakeX = (Math.random() - 0.5) * this.shake;
            this.shakeY = (Math.random() - 0.5) * this.shake;
            this.shake *= CONFIG.SCREEN_SHAKE_DECAY;
            if (this.shake < 0.5) this.shake = 0;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        if (this.flash > 0) this.flash--;

        // Particles
        particles.update();

        // Audio
        if (this.player.unleashTimer > 0 && !this.unleashActive) {
            audio.startUnleashDrone();
            this.unleashActive = true;
        } else if (this.player.unleashTimer <= 0 && this.unleashActive) {
            audio.stopUnleashDrone();
            this.unleashActive = false;
        }

        // Game over check
        if (this.player.health <= 0) {
            this.state = 'gameover';
            audio.stopUnleashDrone();
            this.unleashActive = false;
        }

        this.ui.update(this.state, this.score, this.level, this.combo, this.maxCombo, this.enemiesKilled);
    }

    draw() {
        ctx.save();
        ctx.translate(this.shakeX, this.shakeY);

        this.background.draw(ctx);

        if (this.state === 'menu') {
            this.ui.drawMenu();
        } else if (this.state === 'playing' || this.state === 'paused') {
            // Draw powerups
            for (const p of this.powerups) {
                ctx.fillStyle = '#FFFFFF';
                ctx.shadowColor = '#FFFFFF';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Draw bullets
            for (const b of this.bullets) {
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = 8;
                ctx.fillRect(b.x - b.radius, b.y - b.radius, b.radius*2, b.radius*2);
            }
            ctx.shadowBlur = 0;

            // Draw enemy bullets
            for (const b of this.enemyBullets) {
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            this.enemies.draw(ctx);
            this.player.draw(ctx);
            particles.draw(ctx);
            this.ui.drawHUD(this.player);

            if (this.state === 'paused') {
                this.ui.drawPause();
            }
        } else if (this.state === 'gameover') {
            this.enemies.draw(ctx);
            this.player.draw(ctx);
            particles.draw(ctx);
            this.ui.drawGameOver();
        }

        // Screen flash
        if (this.flash > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${this.flash * 0.05})`;
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // Chromatic aberration during unleash
        if (this.player.unleashTimer > 0) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            const data = imageData.data;
            const shift = 3;
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    const i = (y * this.width + x) * 4;
                    if (x + shift < this.width) {
                        data[i] = data[(y * this.width + x + shift) * 4]; // R shift
                    }
                    if (x - shift >= 0) {
                        data[i+2] = data[(y * this.width + x - shift) * 4 + 2]; // B shift
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }

        ctx.restore();
    }

    loop(timestamp) {
        frameCount++;
        this.update();
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}

// Module scripts are deferred; 'load' may have already fired.
// Initialize immediately since DOM is guaranteed ready for type="module".
game = new Game();
game.init();