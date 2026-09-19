/**
 * player.js - Ship rendering, mouse tracking, weapons, upgrade tiers, health, engine trails.
 * Ship is a pixel-art angular stealth fighter with cyan glow.
 */
const Player = {
    x: 0,
    y: 0,
    width: CONFIG.PLAYER.width,
    height: CONFIG.PLAYER.height,
    radius: CONFIG.PLAYER.radius,
    health: CONFIG.PLAYER.maxHealth,
    maxHealth: CONFIG.PLAYER.maxHealth,
    tier: 1,
    mouseX: 0,
    mouseY: 0,
    tiltTimer: 0,
    tiltDirection: 0,
    unleashActive: false,
    unleashTimer: 0,
    unleashDuration: CONFIG.PLAYER.unleashDuration,
    invincibleTimer: 0,
    damage: 1,

    init() {
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight * 0.8;
        this.health = this.maxHealth;
        this.tier = 1;
        this.damage = 1;
        this.unleashActive = false;
        this.unleashTimer = 0;
        this.invincibleTimer = 0;
    },

    update(mouseX, mouseY) {
        this.mouseX = mouseX;
        this.mouseY = mouseY;

        // Lerp mouse tracking
        this.x += (mouseX - this.x) * CONFIG.PLAYER.lerpFactor;
        this.y += (mouseY - this.y) * CONFIG.PLAYER.lerpFactor;

        // Clamp to screen
        this.x = Math.max(this.radius, Math.min(window.innerWidth - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(window.innerHeight - this.radius, this.y));

        // Tilt animation based on horizontal movement
        const dx = mouseX - this.x;
        if (Math.abs(dx) > 5) {
            this.tiltDirection = dx > 0 ? 1 : -1;
            this.tiltTimer = 3;
        }
        if (this.tiltTimer > 0) this.tiltTimer--;
        else this.tiltDirection *= 0.9;

        // Engine trails
        Particles.spawnEngineTrail(
            this.x - 8, this.y + this.height / 2, this.tier
        );
        Particles.spawnEngineTrail(
            this.x + 8, this.y + this.height / 2, this.tier
        );

        // Unleash timer
        if (this.unleashActive) {
            this.unleashTimer -= 16.67; // approx 60fps
            if (this.unleashTimer <= 0) {
                this.unleashActive = false;
            }
        }

        // Invincibility timer
        if (this.invincibleTimer > 0) this.invincibleTimer--;
    },

    getTier() {
        return this.tier;
    },

    setTier(tier) {
        this.tier = Math.min(4, Math.max(1, tier));
    },

    getFireRate() {
        const base = CONFIG.PLAYER.baseFireRate;
        if (this.unleashActive) return Math.max(4, base / 2);
        return base;
    },

    getBulletSpeed() {
        return CONFIG.BULLET_SPEEDS[Math.min(this.tier - 1, 3)];
    },

    getBulletCount() {
        if (this.unleashActive) return 7;
        return this.tier;
    },

    getSpreadAngle() {
        if (this.unleashActive) return 0.6;
        return 0.15 + this.tier * 0.05;
    },

    getDamage() {
        return this.damage;
    },

    setDamage(d) {
        this.damage = d;
        return this;
    },

    getUnleashProgress() {
        if (this.unleashActive) {
            return this.unleashTimer / this.unleashDuration;
        }
        return 0;
    },

    takeDamage(amount) {
        if (this.invincibleTimer > 0) return false;
        this.health -= amount;
        this.invincibleTimer = 30;
        if (this.health < 0) this.health = 0;
        return true;
    },

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    },

    activateUnleash() {
        this.unleashActive = true;
        this.unleashTimer = this.unleashDuration;
        AudioEngine.playUnleashDrone();
    },

    isUnleashing() {
        return this.unleashActive;
    },

    render(ctx, time) {
        const tilt = this.tiltDirection * 0.15;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(tilt);

        // Unleash glow
        if (this.unleashActive) {
            const glowSize = 50 + Math.sin(time * 8) * 5;
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = glowSize;
        }

        // Draw pixel-art ship (angular stealth fighter)
        const shipGrid = [
            [0,0,0,1,1,0,0,0],
            [0,0,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1],
            [0,1,1,1,1,1,1,0],
            [0,0,1,1,1,1,0,0],
            [0,0,0,1,1,0,0,0],
        ];

        // Ship body color based on tier
        const bodyColors = ['#3A4A5A', '#3A4A5A', '#3A4A5A', '#3A4A5A'];
        const glowColors = [CONFIG.COLORS.cyan, '#2ECC71', CONFIG.COLORS.gold, CONFIG.COLORS.white];

        // Draw ship body
        const gridW = 8;
        const gridH = 7;
        const cellW = this.width / gridW;
        const cellH = this.height / gridH;

        ctx.fillStyle = bodyColors[this.tier - 1];
        for (let row = 0; row < gridH; row++) {
            for (let col = 0; col < gridW; col++) {
                if (shipGrid[row][col] === 1) {
                    ctx.fillRect(
                        -this.width / 2 + col * cellW,
                        -this.height / 2 + row * cellH,
                        cellW, cellH
                    );
                }
            }
        }

        // Glow edges
        ctx.shadowColor = glowColors[this.tier - 1];
        ctx.shadowBlur = 8 + (this.unleashActive ? 12 : 0);
        ctx.strokeStyle = glowColors[this.tier - 1];
        ctx.lineWidth = 1.5;

        // Draw glow outline
        ctx.beginPath();
        // Simple diamond outline for the ship
        const hw = this.width / 2;
        const hh = this.height / 2;
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw * 0.7, -hh * 0.2);
        ctx.lineTo(hw, hh * 0.1);
        ctx.lineTo(hw * 0.5, hh);
        ctx.lineTo(-hw * 0.5, hh);
        ctx.lineTo(-hw, hh * 0.1);
        ctx.lineTo(-hw * 0.7, -hh * 0.2);
        ctx.closePath();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();

        // Unleash countdown ring
        if (this.unleashActive) {
            const progress = this.getUnleashProgress();
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.strokeStyle = '#2ECC71';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
            ctx.restore();
        }
    },

    isInvincible() {
        return this.invincibleTimer > 0;
    },
};