/**
 * player.js
 * Ship rendering, movement, and weapon logic.
 */

const Player = (() => {
    let ship = {
        x: 0,
        y: 0,
        width: 30,
        height: 40,
        hp: 100,
        maxHp: 100,
        tier: 1,
        fireTimer: 0,
        unleashTimer: 0,
        angle: 0
    };

    let mouseX = 0;
    let mouseY = 0;
    let isFiring = false;
    let bullets = [];

    function init() {
        ship.x = window.innerWidth / 2;
        ship.y = window.innerHeight - 100;
        mouseX = ship.x;
        mouseY = ship.y;
    }

    function update() {
        // Mouse Tracking with Lerp
        ship.x += (mouseX - ship.x) * CONFIG.PLAYER.speed;
        ship.y += (mouseY - ship.y) * CONFIG.PLAYER.speed;

        // Bank effect
        const dx = mouseX - ship.x;
        ship.angle = dx * 0.05;
        ship.angle = Math.max(-0.3, Math.min(0.3, ship.angle));

        // Engine Trails
        Particles.spawnTrail(ship.x - 10, ship.y + 20, '#FFA500');
        Particles.spawnTrail(ship.x + 10, ship.y + 20, '#FFA500');

        // Shooting
        if (isFiring) {
            ship.fireTimer++;
            const rate = CONFIG.PLAYER.fireRate;
            
            if (ship.fireTimer >= rate) {
                ship.fireTimer = 0;
                fireWeapon();
            }
        }

        // Unleash Mode
        if (ship.unleashTimer > 0) {
            ship.unleashTimer--;
            if (ship.unleashTimer === 0) {
                // End unleash
            }
        }
    }

    function fireWeapon() {
        const speed = CONFIG.PLAYER.bulletSpeeds[ship.tier - 1];
        const count = ship.tier >= 3 ? 3 : (ship.tier >= 2 ? 2 : 1);
        
        // Unleash Mode Logic
        if (ship.unleashTimer > 0) {
            AudioSys.shoot();
            for (let i = -2; i <= 2; i++) {
                bullets.push({
                    x: ship.x,
                    y: ship.y - 20,
                    vx: i * 2,
                    vy: -speed * 1.5,
                    width: 10,
                    height: 20,
                    color: '#FFFFFF',
                    damage: 5
                });
            }
            return;
        }

        AudioSys.shoot();
        for (let i = 0; i < count; i++) {
            let offset = (i - (count-1)/2) * 10;
            bullets.push({
                x: ship.x + offset,
                y: ship.y - 20,
                vx: 0,
                vy: -speed,
                width: 4,
                height: 12,
                color: CONFIG.PLAYER.colors[ship.tier-1],
                damage: 1
            });
        }
    }

    function draw(ctx) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);

        // Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = ship.unleashTimer > 0 ? '#FFFFFF' : CONFIG.PLAYER.colors[ship.tier-1];

        // Draw Ship (Pixel Art Style)
        ctx.fillStyle = ship.unleashTimer > 0 ? '#FFFFFF' : '#2C3E50'; // Dark body
        
        // Main Body
        ctx.fillRect(-10, -20, 20, 40);
        // Wings
        ctx.fillRect(-20, 0, 40, 10);
        // Cockpit
        ctx.fillStyle = ship.unleashTimer > 0 ? '#FFFF00' : '#4ECDC4';
        ctx.fillRect(-5, -10, 10, 10);

        // Thrusters
        ctx.fillStyle = '#FFA500';
        ctx.fillRect(-15, 20, 10, 5);
        ctx.fillRect(5, 20, 10, 5);

        ctx.restore();

        // Unleash Ring
        if (ship.unleashTimer > 0) {
            ctx.beginPath();
            ctx.arc(ship.x, ship.y, 50, 0, (ship.unleashTimer / CONFIG.GAME.unleashDuration) * Math.PI * 2);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    function drawBullets(ctx) {
        bullets.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.fillRect(b.x - b.width/2, b.y, b.width, b.height);
            ctx.shadowBlur = 0;
            
            // Bullet Trail
            Particles.spawnTrail(b.x, b.y + b.height, b.color);
        });
    }

    function updateBullets() {
        bullets = bullets.filter(b => b.y > -50);
        bullets.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
        });
    }

    function getBullets() { return bullets; }
    function getShip() { return ship; }
    function setMouse(x, y) { mouseX = x; mouseY = y; }
    function setFiring(val) { isFiring = val; }
    function addUnleash() { ship.unleashTimer = CONFIG.GAME.unleashDuration; AudioSys.unleashStart(); }

    window.addEventListener('mousemove', e => setMouse(e.clientX, e.clientY));
    window.addEventListener('mousedown', () => setFiring(true));
    window.addEventListener('mouseup', () => setFiring(false));

    return { init, update, draw, updateBullets, drawBullets, getBullets, getShip, addUnleash };
})();
