/** @file game.js - Main entry point and game loop */
import { CONFIG } from './config.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import { Background } from './background.js';
import { Enemy } from './enemies.js';
import { Player } from './player.js';
import { UIManager } from './ui.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.state = 'MENU'; // MENU, PLAYING, GAMEOVER
        this.score = 0;
        this.level = 1;
        this.combo = 1;
        this.lastKillTime = 0;
        this.shake = 0;

        this.mouse = { x: 0, y: 0, down: false };
        this.bullets = [];
        this.enemies = [];
        this.powerups = [];

        this.bg = new Background(this.canvas);
        this.player = new Player(this.canvas);
        this.ui = new UIManager(this.ctx, this.canvas);

        this.initListeners();
        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initListeners() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener('mousedown', () => {
            if (this.state === 'MENU' || this.state === 'GAMEOVER') {
                this.start();
            }
            this.mouse.down = true;
        });
        window.addEventListener('mouseup', () => this.mouse.down = false);
    }

    start() {
        audio.init();
        this.state = 'PLAYING';
        this.score = 0;
        this.level = 1;
        this.player = new Player(this.canvas);
        this.enemies = [];
        this.bullets = [];
        this.combo = 1;
        this.lastKillTime = Date.now();
    }

    spawnEnemy() {
        if (Math.random() > 0.02 + (this.level * 0.005)) return;
        
        const x = Math.random() * (this.canvas.width - 50) + 25;
        let type = 'small';
        if (this.level % 5 === 0 && this.enemies.length === 0) type = 'boss';
        else if (this.level > 2 && Math.random() > 0.7) type = 'medium';

        this.enemies.push(new Enemy(x, -50, type));
    }

    shoot() {
        if (!this.mouse.down) return;
        
        const speedMap = [0, CONFIG.BULLET_SPEEDS.TIER_1, CONFIG.BULLET_SPEEDS.TIER_2, CONFIG.BULLET_SPEEDS.TIER_3, CONFIG.BULLET_SPEEDS.TIER_4];
        const speed = speedMap[Math.min(this.player.tier, 4)];
        
        // Simple spread based on tier
        const spread = this.player.tier * 0.05;
        const count = this.player.tier >= 3 ? 3 : 1;

        for(let i=0; i<count; i++) {
            const angle = (i - (count-1)/2) * spread;
            this.bullets.push({
                x: this.player.x,
                y: this.player.y - 20,
                vx: Math.sin(angle) * speed,
                vy: -Math.cos(angle) * speed,
                radius: 4,
                color: CONFIG.COLORS[`BULLET_T${this.player.tier}`] || '#FFF'
            });
        }
        audio.playLaser();
    }

    update() {
        if (this.state !== 'PLAYING') return;

        this.player.update(this.mouse.x, this.mouse.y);
        this.bg.update(this.mouse.x, this.mouse.y);
        this.spawnEnemy();
        this.shoot();

        // Update Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            
            // Bullet trail particles
            particles.spawn(b.x, b.y, 0, 0, 5, b.color, 2);

            if (b.y < 0 || b.y > this.canvas.height || b.x < 0 || b.x > this.canvas.width) {
                this.bullets.splice(i, 1);
            }
        }

        // Update Enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update();

            // Collision: Bullet vs Enemy
            for (let j = this.bullets.length - 1; j >= 0; j--) {
                const b = this.bullets[j];
                const dist = Math.hypot(e.x - b.x, e.y - b.y);
                if (dist < e.radius + b.radius) {
                    e.hp--;
                    e.hitFlash = 3;
                    this.bullets.splice(j, 1);
                    audio.playHit();
                    particles.spawn(b.x, b.y, 0, 0, 5, '#FFF', 2);

                    if (e.hp <= 0) {
                        this.score += 100 * this.combo;
                        this.combo++;
                        this.lastKillTime = Date.now();
                        particles.spawnExplosion(e.x, e.y, e.color, 30);
                        audio.playExplosion(e.size / 50);
                        this.enemies.splice(i, 1);
                        
                        // Powerup drop
                        if (e.type === 'medium' || e.type === 'boss') {
                            this.player.unleashActive = true;
                            this.player.unleashTimer = CONFIG.PLAYER.UNLEASH_DURATION;
                            audio.playPowerup();
                        }
                        break;
                    }
                }
            }

            // Collision: Player vs Enemy
            const distToPlayer = Math.hypot(e.x - this.player.x, e.y - this.player.y);
            if (distToPlayer < e.radius + this.player.radius + 30) {
                this.player.health -= 20;
                this.shake = 20;
                this.enemies.splice(i, 1);
                if (this.player.health <= 0) this.state = 'GAMEOVER';
            }

            if (e.y > this.canvas.height + 50) this.enemies.splice(i, 1);
        }

        // Combo decay
        if (Date.now() - this.lastKillTime > CONFIG.GAME.COMBO_TIMEOUT) this.combo = 1;

        // Level up
        if (this.score > this.level * 5000) {
            this.level++;
            this.player.tier = Math.min(this.player.tier + 1, 4);
        }

        particles.update();
        if (this.shake > 0) this.shake *= 0.9;
    }

    draw() {
        this.ctx.save();
        if (this.shake > 0) {
            this.ctx.translate(Math.random() * this.shake, Math.random() * this.shake);
        }

        this.bg.draw(this.ctx);
        
        this.enemies.forEach(e => e.draw(this.ctx));
        this.bullets.forEach(b => {
            this.ctx.fillStyle = b.color;
            this.ctx.fillRect(b.x, b.y, b.radius * 2, b.radius * 2);
        });
        
        this.player.draw(this.ctx);
        particles.draw(this.ctx);

        if (this.state === 'MENU') this.ui.drawStartScreen();
        if (this.state === 'GAMEOVER') this.ui.drawGameOver(this.score, this.level);
        if (this.state === 'PLAYING') {
            this.ui.drawHUD(this.score, this.level, this.combo, this.player.health, this.player.unleashActive);
        }

        this.ctx.restore();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new Game();