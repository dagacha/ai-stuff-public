// js/player.js
/**
 * player.js - Ship rendering, mouse tracking with lerp, weapons,
 * upgrade tiers, health, and engine trail spawning.
 */

const Player = (() => {
    let ship = {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        health: CONFIG.PLAYER.maxHealth,
        maxHealth: CONFIG.PLAYER.maxHealth,
        tier: 1,
        fireTimer: 0,
        bankAngle: 0,
        lastMouseX: 0,
        lastMouseY: 0,
        unleashTimer: 0,
        hasPowerup: false,
    };

    let mouseX = 0;
    let mouseY = 0;
    let mouseDown = false;

    function init(w, h) {
        ship.x = w / 2;
        ship.y = h - 100;
        ship.targetX = ship.x;
        ship.targetY = ship.y;
        ship.health = ship.maxHealth;
        ship.tier = 1;
        ship.fireTimer = 0;
        ship.bankAngle = 0;
        ship.unleashTimer = 0;
        ship.hasPowerup = false;
        mouseX = ship.x;
        mouseY = ship.y;
    }

    function update(w, h) {
        // Lerp mouse tracking
        ship.x += (mouseX - ship.x) * CONFIG.PLAYER.lerpFactor;
        ship.y += (mouseY - ship.y) * CONFIG.PLAYER.lerpFactor;

        // Clamp to screen
        ship.x = Math.max(20, Math.min(w - 20, ship.x));
        ship.y = Math.max(20, Math.min(h - 20, ship.y));

        // Bank angle based on horizontal movement
        const dx = mouseX - ship.lastMouseX;
        ship.bankAngle += (dx * CONFIG.PLAYER.bankAngle - ship.bankAngle) * 0.2;
        ship.bankAngle = Math.max(-0.15, Math.min(0.15, ship.bankAngle));
        ship.lastMouseX = mouseX;
        ship.lastMouseY = mouseY;

        // Engine trails
        if (ship.fireTimer % CONFIG.PLAYER.engineTrailSpawnRate === 0) {
            Particles.spawn('engineTrail', ship.x - 10, ship.y + 20, {
                vx: (Math.random() - 0.5) * 0.5,
                vy: 2 + Math.random() * 2,
                size: 2 + Math.random() * 3,
            });
            Particles.spawn('engineTrail', ship.x + 10, ship.y + 20, {
                vx: (Math.random() - 0.5) * 0.5,
                vy: 2 + Math.random() * 2,
                size: 2 + Math.random() * 3,
            });
        }

        // Firing
        if (mouseDown) {
            ship.fireTimer++;
            const fireRate = ship.hasPowerup ? CONFIG.BULLETS.unleashFireRate : CONFIG.BULLETS.fireRate;
            if (ship.fireTimer >= fireRate) {
                ship.fireTimer = 0;
                fire(w, h);
            }
        } else {
            ship.fireTimer = 0;
        }

        // Unleash timer
        if (ship.unleashTimer > 0) {
            ship.unleashTimer--;
            if (ship.unleashTimer <= 0) {
                ship.hasPowerup = false;
                Audio.setUnleashDrone(false);
            }
        }
    }

    function fire(w, h) {
        const speed = [0, CONFIG.BULLETS.tier1Speed, CONFIG.BULLETS.tier2Speed, CONFIG.BULLETS.tier3Speed, CONFIG.BULLETS.tier4Speed][ship.tier];
        const width = [0, CONFIG.BULLETS.tier1Width, CONFIG.BULLETS.tier2Width, CONFIG.BULLETS.tier3Width, CONFIG.BULLETS.tier4Width][ship.tier];
        const color = getBulletColor();

        if (ship.hasPowerup) {
            // Unleash: massive spread beams
            for (let i = -3; i <= 3; i++) {
                Game.bullets.push({
                    x: ship.x + i * 8,
                    y: ship.y - 15,
                    vx: i * 0.8,
                    vy: -speed,
                    width: width * 2,
                    height: 12,
                    color: CONFIG.COLORS.white,
                    damage: 20,
                    trailColor: CONFIG.COLORS.white,
                });
            }
            Audio.playLaser();
        } else {
            switch (ship.tier) {
                case 1:
                    Game.bullets.push({
                        x: ship.x,
                        y: ship.y - 15,
                        vx: 0,
                        vy: -speed,
                        width: width,
                        height: 10,
                        color: color,
                        damage: 10,
                        trailColor: color,
                    });
                    break;
                case 2:
                    Game.bullets.push({
                        x: ship.x - 8,
                        y: ship.y - 12,
                        vx: 0,
                        vy: -speed,
                        width: width,
                        height: 10,
                        color: color,
                        damage: 10,
                        trailColor: color,
                    });
                    Game.bullets.push({
                        x: ship.x + 8,
                        y: ship.y - 12,
                        vx: 0,
                        vy: -speed,
                        width: width,
                        height: 10,
                        color: color,
                        damage: 10,
                        trailColor: color,
                    });
                    break;
                case 3:
                    for (let i = -1; i <= 1; i++) {
                        Game.bullets.push({
                            x: ship.x + i * 6,
                            y: ship.y - 12,
                            vx: i * 0.5,
                            vy: -speed,
                            width: width,
                            height: 10,
                            color: color,
                            damage: 10,
                            trailColor: color,
                        });
                    }
                    break;
                case 4:
                    for (let i = -2; i <= 2; i++) {
                        Game.bullets.push({
                            x: ship.x + i * 5,
                            y: ship.y - 12,
                            vx: i * 0.7,
                            vy: -speed,
                            width: width,
                            height: 10,
                            color: color,
                            damage: 12,
                            trailColor: color,
                        });
                    }
                    // Homing missiles (slower, bigger)
                    Game.bullets.push({
                        x: ship.x - 15,
                        y: ship.y - 5,
                        vx: -1,
                        vy: -speed * 0.7,
                        width: 8,
                        height: 14,
                        color: CONFIG.COLORS.gold,
                        damage: 25,
                        trailColor: CONFIG.COLORS.gold,
                        homing: true,
                    });
                    Game.bullets.push({
                        x: ship.x + 15,
                        y: ship.y - 5,
                        vx: 1,
                        vy: -speed * 0.7,
                        width: 8,
                        height: 14,
                        color: CONFIG.COLORS.gold,
                        damage: 25,
                        trailColor: CONFIG.COLORS.gold,
                        homing: true,
                    });
                    break;
            }
        }
    }

    function getBulletColor() {
        const colors = [null, CONFIG.COLORS.cyan, '#44FF44', CONFIG.COLORS.gold, CONFIG.COLORS.white];
        return colors[ship.tier];
    }

    function draw(ctx) {
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.bankAngle);

        const tier = ship.tier;
        const glowColor = getBulletColor();

        // Unleash glow
        if (ship.hasPowerup) {
            ctx.shadowColor = CONFIG.COLORS.white;
            ctx.shadowBlur = 20;
        }

        // Ship body - pixel art style
        const s = 3; // pixel size

        // Main body
        ctx.fillStyle = CONFIG.COLORS.gunmetal;
        // Nose
        ctx.fillRect(-s * 2, -s * 8, s * 4, s * 2);
        // Upper body
        ctx.fillRect(-s * 3, -s * 6, s * 6, s * 4);
        // Wings
        ctx.fillRect(-s * 7, -s * 2, s * 4, s * 3);
        ctx.fillRect(s * 3, -s * 2, s * 4, s * 3);
        // Lower body
        ctx.fillRect(-s * 2, -s * 2, s * 4, s * 4);
        // Tail
        ctx.fillRect(-s, s * 2, s * 2, s * 3);

        // Cockpit
        ctx.fillStyle = glowColor;
        ctx.fillRect(-s, -s * 5, s * 2, s * 2);

        // Wing details
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(-s * 6, -s, s * 2, s);
        ctx.fillRect(s * 4, -s, s * 2, s);
        ctx.globalAlpha = 1;

        // Thrusters
        ctx.fillStyle = CONFIG.COLORS.orange;
        ctx.fillRect(-s * 2, s * 4, s * 2, s * 2);
        ctx.fillRect(s * 0, s * 4, s * 2, s * 2);

        // Thruster flames
        const flameLen = 3 + Math.random() * 4;
        ctx.fillStyle = CONFIG.COLORS.yellow;
        ctx.fillRect(-s * 2, s * 4 + s * 2, s * 2, flameLen);
        ctx.fillRect(s * 0, s * 4 + s * 2, s * 2, flameLen);

        // Tier-specific additions
        if (tier >= 2) {
            // Wider wings
            ctx.fillStyle = CONFIG.COLORS.gunmetal;
            ctx.fillRect(-s * 9, -s, s * 2, s * 2);
            ctx.fillRect(s * 7, -s, s * 2, s * 2);
            // Wing tips glow
            ctx.fillStyle = glowColor;
            ctx.fillRect(-s * 9, -s, s, s);
            ctx.fillRect(s * 8, -s, s, s);
        }

        if (tier >= 3) {
            // Delta wing extensions
            ctx.fillStyle = CONFIG.COLORS.gunmetal;
            ctx.fillRect(-s * 10, s, s * 3, s);
            ctx.fillRect(s * 7, s, s * 3, s);
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = 0.4;
            ctx.fillRect(-s * 10, s, s * 3, s);
            ctx.fillRect(s * 7, s, s * 3, s);
            ctx.globalAlpha = 1;
        }

        if (tier >= 4) {
            // Rainbow edge shimmer
            const shimmer = Math.floor(Date.now() / 100) % CONFIG.COLORS.rainbow.length;
            ctx.fillStyle = CONFIG.COLORS.rainbow[shimmer];
            ctx.globalAlpha = 0.5;
            ctx.fillRect(-s * 10, s, s, s);
            ctx.fillRect(s * 9, s, s, s);
            ctx.globalAlpha = 1;
        }

        ctx.shadowBlur = 0;
        ctx.restore();

        // Unleash countdown ring
        if (ship.hasPowerup && ship.unleashTimer > 0) {
            const maxTime = CONFIG.UNLEASH.duration;
            const ratio = ship.unleashTimer / maxTime;
            ctx.save();
            ctx.translate(ship.x, ship.y);
            ctx.strokeStyle = CONFIG.UNLEASH.ringColor;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function takeDamage(amount) {
        ship.health -= amount;
        if (ship.health < 0) ship.health = 0;
    }

    function heal(amount) {
        ship.health = Math.min(ship.maxHealth, ship.health + amount);
    }

    function upgradeTier() {
        if (ship.tier < 4) {
            ship.tier++;
        }
    }

    function activateUnleash() {
        ship.hasPowerup = true;
        ship.unleashTimer = CONFIG.UNLEASH.duration;
        Audio.playPowerup();
        Audio.setUnleashDrone(true);
        Particles.spawn('powerupSparkle', ship.x, ship.y, { count: 20 });
    }

    function setMouse(x, y) {
        mouseX = x;
        mouseY = y;
    }

    function setMouseDown(down) {
        mouseDown = down;
    }

    function reset() {
        ship.health = ship.maxHealth;
        ship.tier = 1;
        ship.fireTimer = 0;
        ship.bankAngle = 0;
        ship.unleashTimer = 0;
        ship.hasPowerup = false;
    }

    return {
        update,
        draw,
        takeDamage,
        heal,
        upgradeTier,
        activateUnleash,
        setMouse,
        setMouseDown,
        reset,
        getShip: () => ship,
        getHealth: () => ship.health,
        getMaxHealth: () => ship.maxHealth,
        getTier: () => ship.tier,
        getUnleashTimer: () => ship.unleashTimer,
        hasUnleash: () => ship.hasPowerup,
    };
})();
