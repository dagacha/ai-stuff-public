/**
 * game.js
 * Main game loop, state machine, and collision detection.
 */

const Game = (() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    let lastTime = 0;
    let screenShake = 0;

    function init() {
        resize();
        window.addEventListener('resize', resize);
        
        // Initial Setup
        Background.init(canvas.width, canvas.height);
        Player.init();
        UI.init();

        // Input for Menu/Restart
        canvas.addEventListener('click', () => {
            AudioSys.init(); // Initialize Audio Context on user interaction
            if (UI.getGameState() === 'MENU' || UI.getGameState() === 'GAMEOVER') {
                startGame();
            }
        });

        // Pause
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (UI.getGameState() === 'PLAYING') UI.setGameState('PAUSED');
                else if (UI.getGameState() === 'PAUSED') UI.setGameState('PLAYING');
            }
        });

        requestAnimationFrame(loop);
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.imageSmoothingEnabled = false; // Pixel art style
    }

    function startGame() {
        UI.setGameState('PLAYING');
        Player.getShip().hp = CONFIG.PLAYER.health;
        Player.getShip().tier = 1;
        Enemies.setLevel(1);
        UI.setLevel(1);
        UI.setScore(0); // Reset score logic handled in UI
        Player.getShip().unleashTimer = 0;
    }

    function update() {
        if (UI.getGameState() !== 'PLAYING') return;

        // Background
        Background.update(canvas.width, canvas.height);

        // Player
        Player.update();
        Player.updateBullets();

        // Enemies
        Enemies.update();
        const enemies = Enemies.getEnemies();
        const bullets = Player.getBullets();
        const ship = Player.getShip();

        // Collision: Bullet vs Enemy
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                let e = enemies[j];
                // Circle Collision
                let dx = b.x - e.x;
                let dy = b.y - e.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < (b.width/2 + e.width/2)) {
                    // Hit!
                    Particles.spawnExplosion(b.x, b.y, '#FFFF00', 3, 2); // Sparks
                    let dead = e.takeDamage(b.damage);
                    
                    if (dead) {
                        // Enemy Death
                        Particles.spawnExplosion(e.x, e.y, e.color, 15, 6); // Ink/Explosion
                        AudioSys.explosion(e.width);
                        UI.addScore(e.maxHp * 10);
                        Enemies.setLevel(Math.floor(UI.getScore() / CONFIG.GAME.levelUpScore) + 1);
                        
                        // Powerup Chance
                        if (e.type === 'medium' || e.type === 'boss') {
                            // Drop powerup logic could go here, simplified to auto-unleash for now
                            if (Math.random() > 0.5) Player.addUnleash();
                        }

                        enemies.splice(j, 1);
                    }
                    
                    hit = true;
                    break; // Bullet hits one enemy
                }
            }
            if (hit) bullets.splice(i, 1);
        }

        // Collision: Enemy vs Player
        for (let e of enemies) {
            let dx = ship.x - e.x;
            let dy = ship.y - e.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            // Ship radius + buffer
            if (dist < (30 + e.width/2)) {
                ship.hp -= 10;
                screenShake = 10;
                AudioSys.explosion(10);
                Particles.spawnExplosion(ship.x, ship.y, '#FF0000', 10, 4);
                
                // Push enemy back slightly
                e.y += 50; 
                
                if (ship.hp <= 0) {
                    UI.setGameState('GAMEOVER');
                    AudioSys.explosion(200);
                }
            }
        }

        // Particles
        Particles.update();

        // Screen Shake Decay
        if (screenShake > 0) screenShake *= 0.9;
        if (screenShake < 0.5) screenShake = 0;
    }

    function draw() {
        // Clear Screen
        ctx.fillStyle = CONFIG.COLORS.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply Screen Shake
        ctx.save();
        if (screenShake > 0) {
            const dx = (Math.random() - 0.5) * screenShake;
            const dy = (Math.random() - 0.5) * screenShake;
            ctx.translate(dx, dy);
        }

        // Draw Layers
        Background.draw(ctx, canvas.width, canvas.height);
        Enemies.draw(ctx);
        Player.draw(ctx);
        Player.drawBullets(ctx);
        Particles.draw(ctx);

        ctx.restore();

        // UI Overlay (No Shake)
        UI.update();
        UI.draw(ctx, canvas.width, canvas.height);
    }

    function loop(timestamp) {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    return { init };
})();

// Start Game
window.onload = () => Game.init();
