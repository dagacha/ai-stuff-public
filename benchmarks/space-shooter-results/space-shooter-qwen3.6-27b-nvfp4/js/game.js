/**
 * game.js - Main game loop, state machine, collision detection, 
 * damage numbers, screen shake, bullet management, unleash mode.
 */

const Game = {
    canvas: null,
    ctx: null,
    state: 'menu', // menu, playing, paused, gameover
    score: 0,
    level: 1,
    combo: 0,
    comboTimer: 0,
    enemiesKilled: 0,
    time: 0,
    
    // Screen shake
    shake: { x: 0, y: 0, magnitude: 0, duration: 0 },
    
    // Damage numbers
    damageNumbers: [],
    
    // Bullets
    bullets: [],
    
    // Enemies
    enemies: [],
    waveTimer: 0,
    bossSpawned: false,
    
    // Unleash mode
    unleashActive: false,
    unleashTimer: 0,
    unleashDuration: CONFIG.PLAYER.unleashDuration,
    
    // Player reference
    player: null,
    
    // Mouse state
    mouse: { x: 0, y: 0, down: false },
    
    // Chromatic aberration for unleash
    chromaticOffset: 0,
    
    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Pixel art mode
        this.ctx.imageSmoothingEnabled = false;
        
        // Window resize handler
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.ctx.imageSmoothingEnabled = false;
        });
        
        // Input handlers
        this.setupInput();
        
        // Initialize player
        this.player = Player;
        this.player.init(this.canvas.width / 2, this.canvas.height - 100);
        
        // Initialize background
        Background.init(this.canvas.width, this.canvas.height);
        
        // Initialize audio
        AudioEngine.init();
        
        // Start game loop
        this.gameLoop();
    },
    
    setupInput() {
        // Mouse movement
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        // Mouse click
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                
                if (this.state === 'menu') {
                    this.startGame();
                } else if (this.state === 'gameover') {
                    this.startGame();
                }
            }
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
            }
        });
        
        // ESC to pause
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.state === 'playing') {
                    this.state = 'paused';
                } else if (this.state === 'paused') {
                    this.state = 'playing';
                }
            }
        });
        
        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    
    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.level = 1;
        this.combo = 0;
        this.comboTimer = 0;
        this.enemiesKilled = 0;
        this.enemies = [];
        this.bullets = [];
        this.damageNumbers = [];
        this.waveTimer = 0;
        this.bossSpawned = false;
        this.unleashActive = false;
        this.unleashTimer = 0;
        
        this.player.init(this.canvas.width / 2, this.canvas.height - 100);
        this.player.tier = 1;
        
        AudioEngine.play('start');
    },
    
    gameLoop() {
        const now = performance.now();
        const dt = Math.min((now - (this.lastTime || now)) / 1000, 0.05);
        this.lastTime = now;
        
        this.time += dt;
        
        this.update(dt);
        this.draw();
        
        requestAnimationFrame(() => this.gameLoop());
    },
    
    update(dt) {
        // Always update background
        Background.update(dt, this.mouse);
        
        if (this.state !== 'playing') return;
        
        // Update player
        this.player.update(dt, this.mouse, this.canvas.width, this.canvas.height);
        
        // Spawn engine trail particles
        if (this.time % 0.016 < dt) {
            Particles.spawnEngineTrail(this.player.x - 8, this.player.y + 15);
            Particles.spawnEngineTrail(this.player.x + 8, this.player.y + 15);
        }
        
        // Handle shooting
        if (this.mouse.down) {
            this.handleShooting();
        }
        
        // Update bullets
        this.updateBullets(dt);
        
        // Update enemies
        this.updateEnemies(dt);
        
        // Check collisions
        this.checkCollisions();
        
        // Update particles
        Particles.update(dt);
        
        // Update damage numbers
        this.updateDamageNumbers(dt);
        
        // Update screen shake
        this.updateShake(dt);
        
        // Update unleash
        this.updateUnleash(dt);
        
        // Update combo
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.combo = 0;
            }
        }
        
        // Spawn waves
        this.waveTimer -= dt;
        if (this.waveTimer <= 0 && this.enemies.length === 0) {
            this.spawnWave();
        }
        
        // Check player death
        if (this.player.health <= 0) {
            this.state = 'gameover';
            AudioEngine.play('gameover');
            this.addShake(CONFIG.SHAKE.boss, 30);
        }
    },
    
    handleShooting() {
        const tier = this.player.tier;
        const fireRate = CONFIG.PLAYER.baseFireRate - (tier - 1) * 2;
        
        if (!this.lastShot) this.lastShot = 0;
        this.lastShot++;
        
        if (this.lastShot >= fireRate) {
            this.lastShot = 0;
            const bulletSpeed = CONFIG.BULLET_SPEEDS[tier - 1];
            const bulletColor = tier === 1 ? CONFIG.COLORS.cyan : 
                              tier === 2 ? CONFIG.COLORS.green :
                              tier === 3 ? CONFIG.COLORS.gold : CONFIG.COLORS.white;
            
            this.spawnBullets(tier, bulletSpeed, bulletColor);
            AudioEngine.play('laser');
        }
    },
    
    spawnBullets(tier, speed, color) {
        const px = this.player.x;
        const py = this.player.y - 20;
        
        if (this.unleashActive) {
            // Unleash mode: massive spread
            for (let i = -3; i <= 3; i++) {
                this.bullets.push({
                    x: px,
                    y: py,
                    vx: i * 2,
                    vy: -speed * 1.5,
                    width: 6,
                    color: CONFIG.COLORS.white,
                    trail: true
                });
            }
        } else if (tier === 1) {
            // Single shot
            this.bullets.push({ x: px, y: py, vx: 0, vy: -speed, width: 3, color, trail: true });
        } else if (tier === 2) {
            // Dual cannons
            this.bullets.push({ x: px - 10, y: py, vx: 0, vy: -speed, width: 3, color, trail: true });
            this.bullets.push({ x: px + 10, y: py, vx: 0, vy: -speed, width: 3, color, trail: true });
        } else if (tier === 3) {
            // Triple spread
            this.bullets.push({ x: px, y: py, vx: 0, vy: -speed, width: 3, color, trail: true });
            this.bullets.push({ x: px, y: py, vx: -2, vy: -speed, width: 3, color, trail: true });
            this.bullets.push({ x: px, y: py, vx: 2, vy: -speed, width: 3, color, trail: true });
        } else if (tier === 4) {
            // Quad spread + homing effect
            this.bullets.push({ x: px, y: py, vx: 0, vy: -speed, width: 4, color, trail: true });
            this.bullets.push({ x: px - 12, y: py, vx: -1.5, vy: -speed, width: 3, color, trail: true });
            this.bullets.push({ x: px + 12, y: py, vx: 1.5, vy: -speed, width: 3, color, trail: true });
            this.bullets.push({ x: px, y: py, vx: 0, vy: -speed * 1.2, width: 2, color: CONFIG.COLORS.white, trail: true });
        }
    },
    
    updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            
            // Spawn trail particles
            if (b.trail && Math.random() < 0.5) {
                Particles.spawnBulletTrail(b.x, b.y, b.color);
            }
            
            // Remove off-screen bullets
            if (b.y < -20 || b.y > this.canvas.height + 20 || 
                b.x < -20 || b.x > this.canvas.width + 20) {
                this.bullets.splice(i, 1);
            }
        }
    },
    
    spawnWave() {
        if (this.level % CONFIG.LEVEL.bossInterval === 0 && !this.bossSpawned) {
            // Boss wave - spawn mini-swarm first
            this.spawnMiniSwarm();
            setTimeout(() => {
                this.spawnBoss();
            }, 2000);
        } else {
            // Normal wave
            const count = CONFIG.LEVEL.enemiesPerLevelBase + 
                         Math.floor(this.level * CONFIG.LEVEL.enemiesPerLevelGrowth);
            
            for (let i = 0; i < count; i++) {
                const type = Math.random() < 0.6 ? 'small' : 'medium';
                const x = Math.random() * (this.canvas.width - 100) + 50;
                const y = -50 - Math.random() * 200;
                this.enemies.push(Enemies.createEnemy(type, x, y));
            }
        }
        
        this.waveTimer = 3 + this.level * 0.5;
    },
    
    spawnMiniSwarm() {
        for (let i = 0; i < 8; i++) {
            const x = Math.random() * (this.canvas.width - 100) + 50;
            const y = -50 - i * 30;
            this.enemies.push(Enemies.createEnemy('small', x, y));
        }
        AudioEngine.play('bossWarning');
    },
    
    spawnBoss() {
        const x = this.canvas.width / 2;
        const y = -100;
        this.enemies.push(Enemies.createEnemy('boss', x, y));
        this.bossSpawned = true;
        this.addShake(CONFIG.SHAKE.boss, 20);
        AudioEngine.play('boss');
    },
    
    updateEnemies(dt) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            
            // Update enemy
            Enemies.update(e, dt, this.player, this.canvas);
            
            // Check if enemy shoots
            if (e.type === 'medium' && e.canShoot) {
                this.enemyShoot(e);
            }
            
            // Boss attacks
            if (e.type === 'boss' && e.canAttack) {
                this.bossAttack(e);
            }
            
            // Remove dead enemies
            if (e.health <= 0 || e.y > this.canvas.height + 100) {
                if (e.health <= 0) {
                    this.onEnemyDeath(e);
                }
                this.enemies.splice(i, 1);
            }
        }
    },
    
    enemyShoot(enemy) {
        if (Math.random() < 0.02) {
            // Ink blob
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            this.bullets.push({
                x: enemy.x,
                y: enemy.y + enemy.size / 2,
                vx: (dx / dist) * 3,
                vy: (dy / dist) * 3,
                width: 6,
                color: CONFIG.COLORS.electricBlue,
                isEnemy: true,
                trail: true
            });
        }
    },
    
    bossAttack(boss) {
        if (Math.random() < 0.03) {
            // Ink barrage
            for (let i = -2; i <= 2; i++) {
                this.bullets.push({
                    x: boss.x,
                    y: boss.y + boss.size / 2,
                    vx: i * 1.5,
                    vy: 4,
                    width: 8,
                    color: CONFIG.COLORS.purple,
                    isEnemy: true,
                    trail: true
                });
            }
            AudioEngine.play('explosion');
        }
    },
    
    onEnemyDeath(enemy) {
        this.enemiesKilled++;
        this.combo++;
        this.comboTimer = 2;
        
        // Score with combo multiplier
        const scoreMultiplier = 1 + (this.combo * 0.1);
        const baseScore = CONFIG.ENEMY_STATS[enemy.type].score;
        this.score += Math.floor(baseScore * scoreMultiplier);
        
        // Particles
        Particles.spawnExplosion(enemy.x, enemy.y, CONFIG.ENEMY_STATS[enemy.type].color);
        Particles.spawnInkSplatter(enemy.x, enemy.y, CONFIG.ENEMY_STATS[enemy.type].color);
        
        // Screen shake based on enemy size
        if (enemy.type === 'boss') {
            this.addShake(CONFIG.SHAKE.boss, 30);
            // Drop powerup
            this.player.unleashReady = true;
        } else if (enemy.type === 'medium') {
            this.addShake(CONFIG.SHAKE.medium, 15);
            // Split into babies
            for (let i = 0; i < 2; i++) {
                this.enemies.push(Enemies.createEnemy('baby', 
                    enemy.x + (Math.random() - 0.5) * 20,
                    enemy.y
                ));
            }
        } else {
            this.addShake(CONFIG.SHAKE.small, 8);
        }
        
        // Check level up
        this.checkLevelUp();
        
        AudioEngine.play('explosion');
    },
    
    checkLevelUp() {
        const scoreThreshold = this.level * CONFIG.LEVEL.levelUpScore;
        if (this.score >= scoreThreshold) {
            this.level++;
            this.bossSpawned = false;
            
            // Check for tier upgrade
            if (this.level % CONFIG.PLAYER.upgradeInterval === 0 && this.player.tier < 4) {
                this.player.tier++;
                Particles.spawnUpgradeEffect(this.player.x, this.player.y);
                AudioEngine.play('powerup');
            }
        }
    },
    
    checkCollisions() {
        const playerRadius = CONFIG.PLAYER.radius;
        
        // Player bullets vs enemies
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (b.isEnemy) continue;
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const enemyRadius = e.size / 2;
                
                // Circle-to-circle collision
                const dx = b.x - e.x;
                const dy = b.y - e.y;
                const distSq = dx * dx + dy * dy;
                const minDist = b.width + enemyRadius;
                
                if (distSq < minDist * minDist) {
                    // Hit!
                    e.health -= this.player.damage;
                    e.hitFlash = 3;
                    
                    // Spawn hit particles
                    Particles.spawnHitSpark(b.x, b.y);
                    
                    // Damage number
                    this.addDamageNumber(b.x, b.y, this.player.damage);
                    
                    // Remove bullet
                    this.bullets.splice(i, 1);
                    
                    AudioEngine.play('hit');
                    break;
                }
            }
        }
        
        // Enemy bullets vs player
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.isEnemy) continue;
            
            const dx = b.x - this.player.x;
            const dy = b.y - this.player.y;
            const distSq = dx * dx + dy * dy;
            const minDist = b.width + playerRadius + 30; // 30px buffer
            
            if (distSq < minDist * minDist) {
                this.player.health -= 10;
                this.addShake(CONFIG.SHAKE.playerHit, 10);
                Particles.spawnHitSpark(this.player.x, this.player.y);
                this.bullets.splice(i, 1);
                AudioEngine.play('hit');
            }
        }
        
        // Enemy contact with player
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const enemyRadius = e.size / 2;
            
            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            const distSq = dx * dx + dy * dy;
            const minDist = enemyRadius + playerRadius + 30;
            
            if (distSq < minDist * minDist) {
                this.player.health -= 20;
                e.health -= 50;
                this.addShake(CONFIG.SHAKE.playerHit, 15);
                Particles.spawnExplosion(e.x, e.y, CONFIG.COLORS.red);
                AudioEngine.play('hit');
            }
        }
    },
    
    addDamageNumber(x, y, value) {
        this.damageNumbers.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y,
            value: value,
            vy: -2,
            alpha: 1,
            life: 1
        });
    },
    
    updateDamageNumbers(dt) {
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const d = this.damageNumbers[i];
            d.y += d.vy;
            d.life -= dt;
            d.alpha = d.life;
            
            if (d.life <= 0) {
                this.damageNumbers.splice(i, 1);
            }
        }
    },
    
    addShake(magnitude, duration) {
        this.shake.magnitude = magnitude;
        this.shake.duration = duration;
    },
    
    updateShake(dt) {
        if (this.shake.duration > 0) {
            this.shake.duration--;
            this.shake.x = (Math.random() - 0.5) * this.shake.magnitude * 2;
            this.shake.y = (Math.random() - 0.5) * this.shake.magnitude * 2;
            this.shake.magnitude *= CONFIG.SHAKE.decay;
        } else {
            this.shake.x = 0;
            this.shake.y = 0;
            this.shake.magnitude = 0;
        }
    },
    
    updateUnleash(dt) {
        if (this.player.unleashReady && !this.unleashActive) {
            // Ready to activate
            this.unleashActive = true;
            this.unleashTimer = this.unleashDuration / 1000;
            this.player.unleashReady = false;
            this.player.unleashGlow = 1;
            AudioEngine.play('unleash');
        }
        
        if (this.unleashActive) {
            this.unleashTimer -= dt;
            this.chromaticOffset = Math.sin(this.time * 20) * 3;
            
            if (this.unleashTimer <= 0) {
                this.unleashActive = false;
                this.unleashTimer = 0;
                this.chromaticOffset = 0;
                this.player.unleashGlow = 0;
            }
        }
    },
    
    draw() {
        const ctx = this.ctx;
        
        // Apply screen shake
        ctx.save();
        ctx.translate(this.shake.x, this.shake.y);
        
        // Clear canvas
        ctx.fillStyle = CONFIG.COLORS.bg;
        ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);
        
        // Draw background
        Background.draw(ctx);
        
        if (this.state === 'menu') {
            UI.drawStartScreen(ctx, this.time);
        } else if (this.state === 'playing' || this.state === 'paused') {
            this.drawGame(ctx);
            
            if (this.state === 'paused') {
                UI.drawPauseScreen(ctx);
            }
        } else if (this.state === 'gameover') {
            this.drawGame(ctx);
            UI.drawGameOverScreen(ctx, this.score, this.level, this.enemiesKilled, this.time);
        }
        
        ctx.restore();
    },
    
    drawGame(ctx) {
        // Chromatic aberration for unleash mode
        if (this.unleashActive && this.chromaticOffset !== 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.3;
            
            // Red channel offset
            ctx.drawImage(this.canvas, this.chromaticOffset, 0);
            
            // Blue channel offset
            ctx.drawImage(this.canvas, -this.chromaticOffset, 0);
            
            ctx.restore();
        }
        
        // Draw enemies
        for (const enemy of this.enemies) {
            Enemies.draw(ctx, enemy, this.time);
        }
        
        // Draw bullets
        for (const b of this.bullets) {
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x - b.width / 2, b.y - b.width / 2, b.width, b.width);
        }
        
        // Draw player
        this.player.draw(ctx, this.time, this.unleashActive);
        
        // Draw particles
        Particles.draw(ctx);
        
        // Draw damage numbers
        for (const d of this.damageNumbers) {
            ctx.globalAlpha = d.alpha;
            ctx.fillStyle = CONFIG.COLORS.yellow;
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`-${d.value}`, d.x, d.y);
            ctx.globalAlpha = 1;
        }
        
        // Draw HUD
        UI.drawHUD(ctx, this.score, this.level, this.combo, 
                   this.player.health, CONFIG.PLAYER.maxHealth,
                   this.unleashActive, this.unleashTimer / (this.unleashDuration / 1000));
        
        // Draw unleash ring
        if (this.unleashActive) {
            this.drawUnleashRing(ctx);
        }
        
        // Draw boss warning
        if (this.bossSpawned && this.enemies.some(e => e.type === 'boss')) {
            // Boss health bar at top
            const boss = this.enemies.find(e => e.type === 'boss');
            if (boss) {
                this.drawBossHealthBar(ctx, boss);
            }
        }
    },
    
    drawUnleashRing(ctx) {
        const progress = this.unleashTimer / (this.unleashDuration / 1000);
        const radius = 50 * progress;
        
        ctx.strokeStyle = CONFIG.COLORS.green;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    },
    
    drawBossHealthBar(ctx, boss) {
        const barWidth = 300;
        const barHeight = 10;
        const x = (this.canvas.width - barWidth) / 2;
        const y = 70;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);
        
        // Health
        const healthPct = boss.health / CONFIG.ENEMY_STATS.boss.health;
        ctx.fillStyle = CONFIG.COLORS.purple;
        ctx.fillRect(x, y, barWidth * healthPct, barHeight);
        
        // Border
        ctx.strokeStyle = CONFIG.COLORS.white;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
        
        // Label
        ctx.fillStyle = CONFIG.COLORS.purple;
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', this.canvas.width / 2, y - 5);
    }
};

// Start the game when page loads
window.addEventListener('load', () => {
    Game.init();
});
