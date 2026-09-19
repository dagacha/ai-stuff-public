// js/game.js
/**
 * game.js - Main game loop, state machine, collision detection,
 * damage numbers, screen shake, and overall game management.
 */

const Game = (() => {
    let canvas, ctx;
    let state = 'menu'; // menu, playing, paused, gameover
    let bullets = [];
    let powerups = [];
    let screenShake = { x: 0, y: 0, intensity: 0 };
    let lastTime = 0;
    let frameCount = 0;
    let keys = {};
    let mouseX = 0;
    let mouseY = 0;
    let mouseDown = false;

    function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        resize();
        Background.init(canvas.width, canvas.height);

        // Event listeners
        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        canvas.addEventListener('click', onCanvasClick);

        // Start game loop
        requestAnimationFrame(gameLoop);
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        Background.init(canvas.width, canvas.height);
        if (state === 'menu') {
            Player.init(canvas.width, canvas.height);
        }
    }

    function onMouseMove(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
        Background.setMouse(mouseX, mouseY);
        if (state === 'playing') {
            Player.setMouse(mouseX, mouseY);
        }
    }

    function onMouseDown(e) {
        mouseDown = true;
        if (state === 'playing') {
            Player.setMouseDown(true);
        }
    }

    function onMouseUp(e) {
        mouseDown = false;
        if (state === 'playing') {
            Player.setMouseDown(false);
        }
    }

    function onKeyDown(e) {
        keys[e.key] = true;
        if (e.key === 'Escape') {
            if (state === 'playing') {
                state = 'paused';
            } else if (state === 'paused') {
                state = 'playing';
            }
        }
    }

    function onKeyUp(e) {
        keys[e.key] = false;
    }

    function onCanvasClick(e) {
        if (state === 'menu') {
            Audio.init();
            startGame();
        } else if (state === 'gameover') {
            startGame();
        }
    }

    function startGame() {
        state = 'playing';
        bullets = [];
        powerups = [];
        Particles.clear();
        Enemies.clear();
        Player.init(canvas.width, canvas.height);
        UI.reset();
        screenShake = { x: 0, y: 0, intensity: 0 };
    }

    function gameLoop(timestamp) {
        const dt = timestamp - lastTime;
        lastTime = timestamp;
        frameCount++;

        if (state === 'playing') {
            update();
        }

        render();
        requestAnimationFrame(gameLoop);
    }

    function update() {
        // Background
        Background.update(canvas.width, canvas.height);

        // Player
        Player.update(canvas.width, canvas.height);

        // Enemies
        Enemies.update(canvas.width, canvas.height, Player.getShip());

        // Bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x += b.vx;
            b.y += b.vy;

            // Bullet trails
            if (frameCount % 2 === 0) {
                Particles.spawn('bulletTrail', b.x, b.y, {
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    color: b.trailColor || b.color,
                });
            }

            // Homing behavior
            if (b.homing) {
                let closestEnemy = null;
                let closestDist = Infinity;
                for (const e of Enemies._getEnemies()) {
                    const dx = e.x - b.x;
                    const dy = e.y - b.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestEnemy = e;
                    }
                }
                if (closestEnemy) {
                    const dx = closestEnemy.x - b.x;
                    const dy = closestEnemy.y - b.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                        b.vx += (dx / dist) * 0.3;
                        b.vy += (dy / dist) * 0.3;
                    }
                }
            }

            // Remove off-screen
            if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
                bullets.splice(i, 1);
            }
        }

        // Powerups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const p = powerups[i];
            p.y += 1;
            p.time++;

            // Check collection
            const dx = p.x - Player.getShip().x;
            const dy = p.y - Player.getShip().y;
            if (dx * dx + dy * dy < 900) { // radius 30
                Player.activateUnleash();
                Particles.spawn('powerupSparkle', p.x, p.y, { count: 15 });
                powerups.splice(i, 1);
                continue;
            }

            if (p.y > canvas.height + 30) {
                powerups.splice(i, 1);
            }
        }

        // Collision: bullets vs enemies
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            const bulletR = b.width;

            for (let j = Enemies._getEnemies().length - 1; j >= 0; j--) {
                const e = Enemies._getEnemies()[j];
                const enemyR = e.size / 2;

                const dx = b.x - e.x;
                const dy = b.y - e.y;
                if (dx * dx + dy * dy < (bulletR + enemyR) * (bulletR + enemyR)) {
                    // Hit!
                    e.health -= b.damage;
                    e.hitFlash = 3;

                    // Hit feedback
                    Particles.spawn('spark', b.x, b.y, { count: 4 });
                    Particles.spawn('damageNumber', b.x, b.y, { text: `-${b.damage}` });
                    Audio.playHit();

                    // Screen shake
                    triggerShake(2);

                    // Remove bullet
                    bullets.splice(i, 1);

                    // Check enemy death
                    if (e.health <= 0) {
                        killEnemy(e, j);
                    }
                    break;
                }
            }
        }

        // Collision: enemy ink bullets vs player
        const inkBullets = Enemies.getInkBullets();
        for (const b of inkBullets) {
            const dx = b.x - Player.getShip().x;
            const dy = b.y - Player.getShip().y;
            if (dx * dx + dy * dy < (b.size + 15) * (b.size + 15)) {
                Player.takeDamage(10);
                UI.triggerScreenFlash(CONFIG.COLORS.red, 10);
                triggerShake(5);
                Particles.spawn('spark', b.x, b.y, { count: 6 });
                Audio.playHit();
                // Remove ink bullet
                const idx = Enemies._getEnemies().findIndex(e => e.inkBullets.includes(b));
                if (idx >= 0) {
                    const ei = Enemies._getEnemies()[idx];
                    const bi = ei.inkBullets.indexOf(b);
                    if (bi >= 0) ei.inkBullets.splice(bi, 1);
                }
            }
        }

        // Collision: player vs enemies
        for (const e of Enemies._getEnemies()) {
            const dx = e.x - Player.getShip().x;
            const dy = e.y - Player.getShip().y;
            const playerR = CONFIG.PLAYER.shipRadius + 30;
            const enemyR = e.size / 2;

            if (dx * dx + dy * dy < (playerR + enemyR) * (playerR + enemyR)) {
                Player.takeDamage(20);
                UI.triggerScreenFlash(CONFIG.COLORS.red, 15);
                triggerShake(8);
                Particles.spawn('spark', Player.getShip().x, Player.getShip().y, { count: 8 });
                Audio.playHit();
                UI.resetCombo();

                // Push enemy away
                e.y -= 20;
            }
        }

        // Unleash chain explosions
        if (Player.hasUnleash()) {
            for (const e of Enemies._getEnemies()) {
                const dx = e.x - Player.getShip().x;
                const dy = e.y - Player.getShip().y;
                if (dx * dx + dy * dy < 2500) { // radius 50
                    e.health -= 5;
                    e.hitFlash = 2;
                    Particles.spawn('spark', e.x, e.y, { count: 3 });
                    if (e.health <= 0) {
                        killEnemy(e, Enemies._getEnemies().indexOf(e));
                    }
                }
            }
        }

        // Particles
        Particles.update();

        // Screen shake
        if (screenShake.intensity > 0) {
            screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
            screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
            screenShake.intensity *= CONFIG.SCREEN_SHAKE.decay;
            if (screenShake.intensity < 0.5) {
                screenShake.intensity = 0;
                screenShake.x = 0;
                screenShake.y = 0;
            }
        }

        // Combo
        UI.updateCombo();

        // Check player death
        if (Player.getHealth() <= 0) {
            state = 'gameover';
            triggerShake(15);
            Audio.playExplosion('boss');
            Particles.spawn('explosion', Player.getShip().x, Player.getShip().y, { count: 40 });
        }
    }

    function killEnemy(e, index) {
        // Score
        UI.addScore(e.score);

        // Explosion
        const expSize = e.isBoss ? 40 : e.type === 'medium' ? 25 : 15;
        Particles.spawn('explosion', e.x, e.y, {
            count: expSize,
            color: e.color,
        });
        Particles.spawn('rainbowDust', e.x, e.y, { count: 15 });
        Particles.spawn('inkSplatter', e.x, e.y, {
            count: 12,
            color: e.color,
        });

        // Screen shake
        triggerShake(e.isBoss ? 15 : e.type === 'medium' ? 6 : 3);

        // Explosion sound
        Audio.playExplosion(e.isBoss ? 'boss' : e.type === 'medium' ? 'medium' : 'small');

        // Spawn baby octopi from medium
        if (e.type === 'medium') {
            Enemies.spawnBabyOctopi(e.x, e.y);
        }

        // Spawn powerup from big/boss
        if (e.type === 'medium' || e.isBoss) {
            powerups.push({
                x: e.x,
                y: e.y,
                time: 0,
            });
        }

        // Remove enemy
        const enemies = Enemies._getEnemies();
        const idx = enemies.indexOf(e);
        if (idx >= 0) enemies.splice(idx, 1);

        // Check boss death
        if (e.isBoss) {
            Enemies._setBossActive(false);
            // Level up
            UI.setLevel(UI._getLevel() + 1);
            // Spawn mini swarm before next boss
            if ((UI._getLevel() + 1) % CONFIG.LEVELS.bossEvery === 0) {
                for (let i = 0; i < 8; i++) {
                    const stats = CONFIG.ENEMIES.small;
                    enemies.push({
                        type: 'small',
                        x: 60 + Math.random() * (canvas.width - 120),
                        y: -stats.size - Math.random() * 100,
                        size: stats.size,
                        health: stats.health,
                        maxHealth: stats.health,
                        speed: stats.speed + 2,
                        score: stats.score,
                        color: stats.color,
                        grid: Enemies._getGrid('small'),
                        gridRows: Enemies._getGrid('small').length,
                        gridCols: Enemies._getGrid('small')[0].length,
                        hitFlash: 0,
                        frame: 0,
                        time: 0,
                        vx: 0,
                        vy: 0,
                        shootTimer: 0,
                        isBoss: false,
                        bossPhase: 0,
                        bossTargetY: 150,
                        tentacleOffset: 0,
                        inkBullets: [],
                    });
                }
            }
        }

        // Upgrade tier every 3 levels
        const currentLevel = UI._getLevel();
        if (currentLevel > 1 && currentLevel % CONFIG.LEVELS.upgradeEvery === 0) {
            Player.upgradeTier();
        }
    }

    function triggerShake(intensity) {
        screenShake.intensity = Math.min(CONFIG.SCREEN_SHAKE.maxIntensity, intensity);
    }

    function render() {
        ctx.save();

        // Apply screen shake
        ctx.translate(screenShake.x, screenShake.y);

        // Clear
        ctx.fillStyle = CONFIG.COLORS.bg;
        ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

        // Background
        Background.draw(ctx, canvas.width, canvas.height);

        if (state === 'menu') {
            UI.drawStartScreen(ctx, canvas.width, canvas.height);
        } else if (state === 'playing' || state === 'paused') {
            // Powerups
            for (const p of powerups) {
                const pulse = Math.sin(p.time * 0.1) * 0.3 + 0.7;
                ctx.save();
                ctx.globalAlpha = pulse;
                ctx.fillStyle = CONFIG.COLORS.gold;
                ctx.shadowColor = CONFIG.COLORS.gold;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = CONFIG.COLORS.white;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Bullets
            for (const b of bullets) {
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = 8;
                ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
                ctx.shadowBlur = 0;
            }

            // Enemies
            Enemies.draw(ctx, canvas.width, canvas.height);

            // Player
            Player.draw(ctx);

            // Particles
            Particles.draw(ctx);

            // HUD
            UI.drawHUD(ctx, canvas.width, canvas.height);

            // Boss warning
            UI.drawBossWarning(ctx, canvas.width, canvas.height);

            // Unleash chromatic aberration effect
            if (Player.hasUnleash()) {
                ctx.globalAlpha = 0.05;
                ctx.fillStyle = CONFIG.COLORS.red;
                ctx.fillRect(2, 0, canvas.width, canvas.height);
                ctx.fillStyle = CONFIG.COLORS.blue;
                ctx.fillRect(-2, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1;
            }
        } else if (state === 'gameover') {
            // Still draw game elements in background
            Enemies.draw(ctx, canvas.width, canvas.height);
            Particles.draw(ctx);
            UI.drawGameOverScreen(ctx, canvas.width, canvas.height);
        } else if (state === 'paused') {
            Enemies.draw(ctx, canvas.width, canvas.height);
            Player.draw(ctx);
            Particles.draw(ctx);
            UI.drawHUD(ctx, canvas.width, canvas.height);
            UI.drawPauseScreen(ctx, canvas.width, canvas.height);
        }

        ctx.restore();
    }

    // Expose for other modules
    return {
        init,
        getBullets: () => bullets,
        _getEnemies: () => Enemies._getEnemies(),
    };
})();

// Make Enemies module accessible for grid access
Enemies._getGrid = (type) => {
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
    return GRIDS[type];
};

// Make Enemies module accessible for internal access
Enemies._getEnemies = () => {
    // We need to access the internal enemies array
    // This is a workaround - we'll use a getter
    return window._enemiesRef || [];
};

// Make UI module accessible
UI._getLevel = () => window._levelRef || 1;
UI._setLevel = (l) => { window._levelRef = l; };

// Make Enemies module accessible for boss state
Enemies._setBossActive = (v) => { window._bossActiveRef = v; };
Enemies._getEnemies = () => window._enemiesRef || [];

// Initialize the game
window.addEventListener('DOMContentLoaded', () => {
    Game.init();
});
