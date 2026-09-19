/**
 * player.js
 * Ship rendering, movement, and weapon logic.
 */
const Player = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    health: 100,
    tier: 1,
    score: 0,
    combo: 0,
    comboTimer: 0,
    unleashMode: false,
    unleashTimer: 0,
    fireTimer: 0,
    tilt: 0,

    init() {
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight - 100;
        this.targetX = this.x;
        this.targetY = this.y;
        this.health = CONFIG.ship.maxHealth;
    },

    update() {
        // Mouse Tracking (Lerp)
        this.x += (this.targetX - this.x) * CONFIG.ship.lerpFactor;
        this.y += (this.targetY - this.y) * CONFIG.ship.lerpFactor;

        // Tilt calculation
        const diff = this.targetX - this.x;
        this.tilt = diff * 0.05;

        // Engine Trails
        if (game.frame % CONFIG.ship.engineTrailRate === 0) {
            Particles.spawn(this.x - 10, this.y + 20, 'trail', '#FFA500', 1);
            Particles.spawn(this.x + 10, this.y + 20, 'trail', '#FFA500', 1);
        }

        // Unleash Mode Logic
        if (this.unleashMode) {
            this.unleashTimer--;
            if (this.unleashTimer <= 0) {
                this.unleashMode = false;
            }
        }

        // Combo Timer
        if (this.combo > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) {
                this.combo = 0;
            }
        }

        // Shooting
        if (game.mouseDown) {
            this.fire();
        }
    },

    fire() {
        if (this.fireTimer > 0) {
            this.fireTimer--;
            return;
        }

        let stats = CONFIG.bullets.tier1;
        let damage = stats.damage;
        let speed = stats.speed;
        let color = stats.color;
        let width = stats.width;

        // Tier Upgrades
        if (this.tier >= 2) { stats = CONFIG.bullets.tier2; }
        if (this.tier >= 3) { stats = CONFIG.bullets.tier3; }
        if (this.tier >= 4) { stats = CONFIG.bullets.tier4; }

        // Apply stats
        damage = stats.damage;
        speed = stats.speed;
        color = stats.color;
        width = stats.width;

        // Unleash Mode Overwrite
        if (this.unleashMode) {
            damage *= 3;
            speed *= 1.5;
            color = CONFIG.colors.unleash;
            width *= 2;
        }

        // Fire Logic
        game.bullets.push({
            x: this.x,
            y: this.y - 20,
            vx: 0,
            vy: -speed,
            width: width,
            damage: damage,
            color: color,
            type: 'player'
        });

        // Spread shots for higher tiers
        if (this.tier >= 3) {
            game.bullets.push({ x: this.x - 10, y: this.y - 10, vx: -2, vy: -speed, width: width, damage: damage, color: color, type: 'player' });
            game.bullets.push({ x: this.x + 10, y: this.y - 10, vx: 2, vy: -speed, width: width, damage: damage, color: color, type: 'player' });
        }
        if (this.tier >= 4 && this.unleashMode) {
             game.bullets.push({ x: this.x - 20, y: this.y, vx: -4, vy: -speed, width: width, damage: damage, color: color, type: 'player' });
             game.bullets.push({ x: this.x + 20, y: this.y, vx: 4, vy: -speed, width: width, damage: damage, color: color, type: 'player' });
        }

        AudioSys.shoot();
        this.fireTimer = this.unleashMode ? 3 : 8; // Faster fire in unleash
    },

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt * Math.PI / 180);

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.unleashMode ? '#FFFFFF' : (this.tier === 1 ? CONFIG.colors.player : (this.tier === 2 ? CONFIG.colors.playerTier2 : (this.tier === 3 ? CONFIG.colors.playerTier3 : CONFIG.colors.playerTier4)));

        // Ship Body (Pixel Art Style)
        ctx.fillStyle = this.unleashMode ? '#FFFFFF' : '#444';
        
        // Main Hull
        ctx.fillRect(-10, -15, 20, 30);
        // Wings
        ctx.fillRect(-20, 0, 10, 15);
        ctx.fillRect(10, 0, 10, 15);
        // Cockpit
        ctx.fillStyle = this.unleashMode ? '#FFFF00' : '#00FFFF';
        ctx.fillRect(-5, -5, 10, 10);

        // Unleash Ring
        if (this.unleashMode) {
            ctx.strokeStyle = CONFIG.colors.unleash;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 40, 0, Math.PI * 2 * (this.unleashTimer / CONFIG.gameplay.unleashDuration));
            ctx.stroke();
        }

        ctx.restore();
    }
};
