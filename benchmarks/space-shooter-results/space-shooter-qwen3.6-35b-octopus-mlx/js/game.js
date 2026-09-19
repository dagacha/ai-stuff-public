/* js/game.js */
const Game = (() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    let width, height;
    let bullets = [];
    let enemies = [];
    let state = 'START'; // START, PLAYING, PAUSED, GAMEOVER
    let level = 1;
    let score = 0;
    let unleashMode = false;
    let unleashTimer = 0;
    let frameCount = 0;

    // Expose to other modules
    window.Game = {
        bullets, enemies, state, level, score, unleashMode, unleashTimer
    };

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        ctx.imageSmoothingEnabled = false;
        Background.init(width, height);
        Player.init(width, height);
    };

    const reset = () => {
        bullets = [];
        enemies = [];
        level = 1;
        score = 0;
        unleashMode = false;
        unleashTimer = 0;
        frameCount = 0;
        state = 'PLAYING';
    };

    const checkCollisions = () => {
        // Bullets vs Enemies
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            let hit = false;

            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                let dx = b.x - e.x;
                let dy = b.y - e.y;
                let distSq = dx*dx + dy*dy;
                let radSum = b.size + e.radius;

                if (distSq < radSum * radSum) {
                    // Hit!
                    hit = true;
                    e.hp--;
                    
                    // Feedback
                    Particles.spawnExplosion(b.x, b.y, e.color, 3);
                    Particles.spawnDamageNumber(e.x, e.y, 10);
                    AudioSys.playBossHit(); // Small hit sound

                    if (e.hp <= 0) {
                        // Enemy Destroyed
                        Particles.spawnExplosion(e.x, e.y, e.color, 15);
                        AudioSys.playExplosion();
                        
                        // Score
                        let points = e.score;
                        if (unleashMode) points *= CONFIG.powerup.multiplier;
                        score += points;

                        // Powerup Chance
                        if (Math.random() < 0.05) {
                            unleashMode = true;
                            unleashTimer = CONFIG.powerup.duration;
                            AudioSys.playPowerup();
                        }

                        enemies.splice(j, 1);
                    }
                    break; // Bullet hits one enemy
                }
            }

            if (hit) {
                bullets.splice(i, 1);
            }
        }

        // Player vs Enemies
        for (let e of enemies) {
            let dx = Player.ship.x - e.x;
            let dy = Player.ship.y - e.y;
            let distSq = dx*dx + dy*dy;
            if (distSq < (Player.ship.radius + e.radius) * (Player.ship.radius + e.radius)) {
                state = 'GAMEOVER';
                AudioSys.playExplosion();
                Particles.spawnExplosion(Player.ship.x, Player.ship.y, '#ffffff', 50);
            }
        }
    };

    const loop = () => {
        // Clear
        ctx.clearRect(0, 0, width, height);

        // Background
        Background.update(width, height);
        Background.draw(ctx, width, height);

        if (state === 'PLAYING') {
            frameCount++;
            
            // Level Up Logic
            if (score > level * CONFIG.game.levelUpScore) {
                level++;
                // Increase difficulty
                Enemies.spawnRate = Math.max(20, 60 - (level * 2));
            }

            // Update Systems
            Player.update(ctx, width, height);
            Enemies.update(ctx, width, height, Player.ship);
            
            // Update Bullets
            for (let i = bullets.length - 1; i >= 0; i--) {
                let b = bullets[i];
                b.x += b.vx;
                b.y += b.vy;
                
                // Draw Bullet
                ctx.fillStyle = b.color;
                ctx.fillRect(b.x - b.size/2, b.y - b.size/2, b.size, b.size);

                // Cleanup
                if (b.y < -50 || b.y > height + 50 || b.x < -50 || b.x > width + 50) {
                    bullets.splice(i, 1);
                }
            }

            // Particles
            Particles.update(ctx);

            // Collisions
            checkCollisions();
        }

        // UI
        UI.draw(ctx, width, height);

        requestAnimationFrame(loop);
    };

    // Event Listeners
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', Player.handleInput);
    window.addEventListener('mousedown', () => {
        if (state === 'START' || state === 'GAMEOVER') {
            reset();
        }
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (state === 'PLAYING') state = 'PAUSED';
            else if (state === 'PAUSED') state = 'PLAYING';
        }
    });

    // Init
    resize();
    loop();

})();
