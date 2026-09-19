/* js/player.js */
const Player = (() => {
    let ship = {
        x: 0, y: 0,
        vx: 0, vy: 0,
        level: 1,
        score: 0,
        fireTimer: 0,
        unleashTimer: 0,
        flashTimer: 0
    };
    
    let mouseX = 0, mouseY = 0;
    let isFiring = false;

    const init = (width, height) => {
        ship.x = width / 2;
        ship.y = height - 100;
        mouseX = ship.x;
        mouseY = ship.y;
    };

    const handleInput = (e) => {
        if (e.type === 'mousemove') {
            mouseX = e.clientX;
            mouseY = e.clientY;
        } else if (e.type === 'mousedown') {
            isFiring = true;
            AudioSys.init(); // Ensure audio context is ready
        } else if (e.type === 'mouseup') {
            isFiring = false;
        }
    };

    const update = (ctx, width, height) => {
        // Mouse Lerp
        ship.x += (mouseX - ship.x) * CONFIG.player.lerp;
        ship.y += (mouseY - ship.y) * CONFIG.player.lerp;

        // Clamp
        ship.x = Math.max(20, Math.min(width - 20, ship.x));
        ship.y = Math.max(20, Math.min(height - 20, ship.y));

        // Fire Logic
        if (ship.fireTimer > 0) ship.fireTimer--;
        
        if (isFiring && ship.fireTimer <= 0) {
            fireWeapon(ctx);
            ship.fireTimer = CONFIG.player.fireRate;
        }

        // Unleash Mode
        if (ship.unleashTimer > 0) {
            ship.unleashTimer--;
            if (ship.unleashTimer <= 0) {
                Game.unleashMode = false;
            }
        }

        // Flash
        if (ship.flashTimer > 0) ship.flashTimer--;

        draw(ctx);
    };

    const fireWeapon = (ctx) => {
        const tier = Math.min(4, Math.floor(ship.level / 3) + 1);
        
        if (Game.unleashMode) {
            // Unleash: Massive spread
            for(let i=-3; i<=3; i++) {
                Game.bullets.push({
                    x: ship.x, y: ship.y - 20,
                    vx: i * 2, vy: -15,
                    color: '#ffffff', size: 6
                });
            }
            AudioSys.playLaser();
        } else {
            // Standard Tiers
            if (tier === 1) {
                Game.bullets.push({ x: ship.x, y: ship.y - 20, vx: 0, vy: -15, color: CONFIG.colors.player, size: 4 });
            } else if (tier === 2) {
                Game.bullets.push({ x: ship.x - 10, y: ship.y - 20, vx: 0, vy: -15, color: '#00ff00', size: 4 });
                Game.bullets.push({ x: ship.x + 10, y: ship.y - 20, vx: 0, vy: -15, color: '#00ff00', size: 4 });
            } else if (tier === 3) {
                Game.bullets.push({ x: ship.x, y: ship.y - 20, vx: 0, vy: -15, color: '#ffff00', size: 4 });
                Game.bullets.push({ x: ship.x, y: ship.y - 20, vx: -3, vy: -14, color: '#ffff00', size: 4 });
                Game.bullets.push({ x: ship.x, y: ship.y - 20, vx: 3, vy: -14, color: '#ffff00', size: 4 });
            } else {
                // Tier 4: Homing-ish spread
                for(let i=-2; i<=2; i++) {
                    Game.bullets.push({ x: ship.x, y: ship.y - 20, vx: i, vy: -15, color: '#ffffff', size: 5 });
                }
            }
            AudioSys.playLaser();
        }
    };

    const draw = (ctx) => {
        // Glow
        let glowColor = CONFIG.colors.playerGlow;
        if (Game.unleashMode) glowColor = '#ffffff';
        
        if (ship.flashTimer > 0) {
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = glowColor;
        }

        // Draw Ship (Pixel Art Style)
        const s = 10; // grid unit
        const x = ship.x;
        const y = ship.y;

        // Simple pixel ship shape
        ctx.fillRect(x - s, y - 2*s, s*2, s*2); // Body
        ctx.fillRect(x - 2*s, y - s, s, s*2);   // Left Wing
        ctx.fillRect(x + s, y - s, s, s*2);     // Right Wing
        ctx.fillRect(x - s/2, y - 3*s, s, s);   // Nose

        // Unleash Ring
        if (Game.unleashMode) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 40, 0, Math.PI * 2);
            ctx.stroke();
        }
    };

    return { init, handleInput, update, ship };
})();
