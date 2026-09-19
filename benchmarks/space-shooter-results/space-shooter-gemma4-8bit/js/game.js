class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;
        this.shake = 0;

        this.init();
        this.bindEvents();
        this.loop();
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.imageSmoothingEnabled = false;

        // Reset game state
        ui.score = 0;
        ui.lives = 3;
        ui.level = 1;
        ui.gameOver = false;
        ui.gameStarted = false;
        enemyManager.enemies = [];
        enemyManager.inkBlobs = [];
        enemyManager.level = 1;
        player.bullets = [];
        player.weaponTier = 1;
        player.x = window.innerWidth / 2;
        player.y = window.innerHeight - 100;
    }

    bindEvents() {
        // Mouse tracking
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        // Click to start/shoot/restart
        window.addEventListener('mousedown', () => {
            if (!ui.gameStarted) {
                ui.gameStarted = true;
                audio.init();
            } else if (ui.gameOver) {
                this.init();
            } else {
                player.shoot();
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    checkCollisions() {
        const playerR = player.getRadius();

        // Bullets vs Enemies
        for (let i = player.bullets.length - 1; i >= 0; i--) {
            const b = player.bullets[i];
            const br = b.radius;

            for (let j = enemyManager.enemies.length - 1; j >= 0; j--) {
                const e = enemyManager.enemies[j];
                const er = e.getRadius();

                // Circle-to-circle collision
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                const distSq = dx * dx + dy * dy;
                const radSum = br + er;

                if (distSq < radSum * radSum) {
                    // Hit!
                    if (e.takeDamage(1)) {
                        // Enemy destroyed
                        ui.score += e.type === 'boss' ? 1000 : e.type === 'medium' ? 200 : 100;
                        particles.spawnExplosion(e.x, e.y, CONFIG.colors.enemySmall);
                        audio.playExplosion();
                        this.shake = 10;

                        // Medium splits into babies
                        if (e.type === 'medium') {
                            enemyManager.enemies.push(new Enemy('baby', e.x - 20, e.y));
                            enemyManager.enemies.push(new Enemy('baby', e.x + 20, e.y));
                        }

                        // Boss drops power-up
                        if (e.type === 'boss') {
                            player.activateUnleash();
                            ui.level++;
                            enemyManager.level = ui.level;
                        }

                        enemyManager.enemies.splice(j, 1);
                    }
                    player.bullets.splice(i, 1);
                    break;
                }
            }
        }

        // Player vs Enemies (with 30px buffer)
        for (const e of enemyManager.enemies) {
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const distSq = dx * dx + dy * dy;
            const radSum = playerR + e.getRadius() + 30;

            if (distSq < radSum * radSum) {
                this.playerHit();
                break;
            }
        }

        // Player vs Ink Blobs
        for (let i = enemyManager.inkBlobs.length - 1; i >= 0; i--) {
            const ink = enemyManager.inkBlobs[i];
            const dx = player.x - ink.x;
            const dy = player.y - ink.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < (playerR + ink.radius) * (playerR + ink.radius)) {
                this.playerHit();
                enemyManager.inkBlobs.splice(i, 1);
            }
        }
    }

    playerHit() {
        ui.lives--;
        this.shake = 20;
        audio.playExplosion();

        if (ui.lives <= 0) {
            ui.gameOver = true;
        }

        // Brief invulnerability - clear nearby enemies
        for (let i = enemyManager.enemies.length - 1; i >= 0; i--) {
            const e = enemyManager.enemies[i];
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            if (dx * dx + dy * dy < 10000) {
                particles.spawnExplosion(e.x, e.y, CONFIG.colors.enemySmall);
                enemyManager.enemies.splice(i, 1);
            }
        }
    }

    update() {
        if (!ui.gameStarted || ui.gameOver) return;

        background.update();
        player.update(this.mouseX, this.mouseY);
        enemyManager.update(player.x);
        particles.update();

        this.checkCollisions();

        // Level progression
        if (ui.score > ui.level * 2000) {
            ui.level++;
            enemyManager.level = ui.level;
            if (player.weaponTier < 4) {
                player.upgradeWeapon();
            }
        }

        // Decay screen shake
        if (this.shake > 0) {
            this.shake *= 0.9;
            if (this.shake < 0.5) this.shake = 0;
        }
    }

    draw() {
        // Screen shake offset
        let shakeX = 0, shakeY = 0;
        if (this.shake > 0) {
            shakeX = (Math.random() - 0.5) * this.shake;
            shakeY = (Math.random() - 0.5) * this.shake;
        }

        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);

        // Clear and draw background
        background.draw(this.ctx);

        // Draw game entities
        enemyManager.draw(this.ctx);
        player.draw(this.ctx);
        particles.draw(this.ctx);
        ui.draw(this.ctx);

        this.ctx.restore();
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Start the game when page loads
window.onload = () => {
    new Game();
};
