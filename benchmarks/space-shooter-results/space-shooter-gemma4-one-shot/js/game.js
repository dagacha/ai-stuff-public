class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.state = 'MENU';
        this.score = 0;
        this.unleashMeter = 0;
        this.shake = 0;
        this.mouseX = this.canvas.width / 2;
        this.mouseY = this.canvas.height / 2;
        this.isMouseDown = false;

        this.particles = new ParticleSystem();
        this.background = new Background(this.canvas.width, this.canvas.height);
        this.player = new Player(this.canvas.width, this.canvas.height);
        this.ui = new UI(this.canvas);
        this.enemies = [];
        this.powerups = [];

        this.canvas.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        this.canvas.addEventListener('mousedown', () => {
            if (this.state === 'MENU' || this.state === 'GAMEOVER') this.reset();
            else if (this.state === 'PLAYING') this.isMouseDown = true;
            else if (this.state === 'PAUSED') this.state = 'PLAYING';
            AudioEngine.init();
        });
        this.canvas.addEventListener('mouseup', () => this.isMouseDown = false);
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this.state === 'PLAYING') this.state = 'PAUSED';
            if (e.code === 'Space' && this.state === 'PLAYING' && this.unleashMeter >= 1) this.unleash();
        });

        this.loop();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    reset() {
        this.score = 0;
        this.unleashMeter = 0;
        this.enemies = [];
        this.powerups = [];
        this.player = new Player(this.canvas.width, this.canvas.height);
        this.state = 'PLAYING';
        this.shake = 0;
    }

    unleash() {
        this.unleashMeter = 0;
        this.shake = 30;
        AudioEngine.playUnleash();
        this.enemies.forEach(e => {
            e.hp -= 5;
            this.particles.spawnExplosion(e.x, e.y, CONFIG.COLORS.ENEMY_SMALL, 10);
        });
    }

    spawn() {
        if (Math.random() < CONFIG.GAME.SPAWN_RATE) {
            const x = Math.random() * this.canvas.width;
            const rand = Math.random();
            let type = 'small';
            if (rand > 0.7) type = 'medium';
            if (rand > 0.9) type = 'baby';
            this.enemies.push(new Enemy(x, -50, type));
        }
        if (Math.random() < CONFIG.GAME.BOSS_SPAWN_CHANCE) {
            AudioEngine.playBossWarning();
            this.enemies.push(new Boss(this.canvas.width / 2, -100));
        }
    }

    update() {
        if (this.state !== 'PLAYING') return;

        this.spawn();
        this.player.update(this.mouseX, this.mouseY, this.particles);
        if (this.isMouseDown) this.player.shoot();

        this.background.update(this.mouseX, this.mouseY);
        this.particles.update();

        if (this.shake > 0) this.shake *= CONFIG.GAME.SCREEN_SHAKE_DECAY;

        // Enemies update & Collision
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.update();

            // Bullet vs Enemy
            for (let j = this.player.bullets.length - 1; j >= 0; j--) {
                const b = this.player.bullets[j];
                const dist = Math.hypot(e.x - b.x, e.y - b.y);
                if (dist < e.size / 1.5) {
                    e.hp--;
                    this.player.bullets.splice(j, 1);
                    this.shake = 5;
                    if (e.hp <= 0) {
                        this.score += e.type === 'boss' ? 1000 : 100;
                        this.unleashMeter = Math.min(1, this.unleashMeter + 0.05);
                        this.particles.spawnExplosion(e.x, e.y, e.color, e.size);
                        AudioEngine.playExplosion(e.size);
                        
                        // Powerup chance
                        if (Math.random() < 0.1) {
                            this.powerups.push({ x: e.x, y: e.y, type: 'tier' });
                        }
                        
                        this.enemies.splice(i, 1);
                        break;
                    }
                }
            }

            // Enemy vs Player
            const distPlayer = Math.hypot(e.x - this.player.x, e.y - this.player.y);
            if (distPlayer < e.size / 2 + this.player.size / 2) {
                this.state = 'GAMEOVER';
                AudioEngine.playHit();
            }

            if (e.y > this.canvas.height + 100) this.enemies.splice(i, 1);
        }

        // Powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            p.y += 2;
            if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 30) {
                this.player.tier = Math.min(CONFIG.PLAYER.MAX_TIER, this.player.tier + 1);
                AudioEngine.playPowerup();
                this.powerups.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        if (this.shake > 0) {
            this.ctx.translate(Math.random() * this.shake, Math.random() * this.shake);
        }

        this.background.draw(this.ctx);
        this.particles.draw(this.ctx);
        this.enemies.forEach(e => e.draw(this.ctx, false));
        this.powerups.forEach(p => {
            this.ctx.fillStyle = CONFIG.COLORS.POWERUP;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 10, 0, Math.PI*2);
            this.ctx.fill();
        });
        this.player.draw(this.ctx, this.particles);
        this.ctx.restore();

        if (this.state === 'MENU') this.ui.drawMenu();
        if (this.state === 'PAUSED') this.ui.drawPause();
        if (this.state === 'GAMEOVER') this.ui.drawGameOver(this.score);
        if (this.state === 'PLAYING') this.ui.drawHUD(this.score, this.player.tier, this.unleashMeter);
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new Game();