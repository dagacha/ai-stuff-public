class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.mouseX = window.innerWidth / 2;
        this.shake = 0;
        this.lastSpawn = 0;

        this.init();
        this.bindEvents();
        this.loop();
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.imageSmoothingEnabled = false;
        ui.score = 0;
        ui.level = 1;
        ui.gameOver = false;
        enemyManager.enemies = [];
        bulletManager.bullets = [];
        particleSystem.particles = [];
    }

    bindEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
        });
        window.addEventListener('mousedown', () => {
            if (ui.gameOver) this.init();
        });
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    checkCollisions() {
        // Bullets vs Enemies
        for (let i = bulletManager.bullets.length - 1; i >= 0; i--) {
            const b = bulletManager.bullets[i];
            for (let j = enemyManager.enemies.length - 1; j >= 0; j--) {
                const e = enemyManager.enemies[j];
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                const distSq = dx * dx + dy * dy;
                const radSum = b.r + e.r;

                if (distSq < radSum * radSum) {
                    // Hit!
                    if (e.takeDamage(10)) {
                        // Enemy Destroyed
                        ui.addScore(e.type.score);
                        particleSystem.spawnExplosion(e.x, e.y, e.color);
                        audio.playExplosion();
                        enemyManager.enemies.splice(j, 1);
                        this.shake = 10;
                    }
                    bulletManager.bullets.splice(i, 1);
                    break;
                }
            }
        }

        // Player vs Enemies
        for (let i = enemyManager.enemies.length - 1; i >= 0; i--) {
            const e = enemyManager.enemies[i];
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const distSq = dx * dx + dy * dy;
            const radSum = player.r + e.r;

            if (distSq < radSum * radSum) {
                ui.gameOver = true;
                audio.playExplosion();
            }
        }
    }

    update() {
        if (ui.gameOver) return;

        player.update(this.mouseX);
        if (player.shoot()) {
            bulletManager.bullets.push(new Bullet(player.x, player.y - 20));
        }

        bulletManager.update();
        enemyManager.update();
        background.update();
        particleSystem.update();

        // Spawning logic
        const now = Date.now();
        if (now - this.lastSpawn > 2000 / (1 + ui.level * 0.1)) {
            enemyManager.spawn(ui.level);
            this.lastSpawn = now;
        }

        // Level up logic
        if (ui.score > ui.level * 2000) {
            ui.level++;
        }

        this.checkCollisions();
        if (this.shake > 0) this.shake *= 0.9;
    }

    draw() {
        this.ctx.fillStyle = CONFIG.COLORS.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        if (this.shake > 1) {
            this.ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
        }

        background.draw(this.ctx);
        particleSystem.draw(this.ctx);
        bulletManager.draw(this.ctx);
        enemyManager.draw(this.ctx);
        player.draw(this.ctx);
        ui.draw(this.ctx);

        this.ctx.restore();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Start Game
window.onload = () => {
    new Game();
};