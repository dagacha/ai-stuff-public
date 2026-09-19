/**
 * player.js
 * Ship rendering, mouse tracking with lerp, weapons, upgrade tiers, health, and engine trail spawning.
 */

import CONFIG from './config.js';
import { particles } from './particles.js';
import { audio } from './audio.js';

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.health = 100;
        this.maxHealth = 100;
        this.tier = 1;
        this.fireTimer = 0;
        this.unleashTimer = 0;
        this.angle = 0;
        this.prevX = x;
        this.prevY = y;
    }

    update(mouseX, mouseY, keys) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.targetX = mouseX;
        this.targetY = mouseY;
        this.x += (this.targetX - this.x) * CONFIG.SHIP_LERP_FACTOR;
        this.y += (this.targetY - this.y) * CONFIG.SHIP_LERP_FACTOR;
        this.angle = (this.x - this.prevX) * CONFIG.SHIP_BANK_ANGLE;
        this.angle = Math.max(-0.2, Math.min(0.2, this.angle));

        // Engine trails
        if (Math.random() > 0.3) {
            particles.spawnTrail(this.x - 10, this.y + 20, '#FF8C00');
            particles.spawnTrail(this.x + 10, this.y + 20, '#FFD700');
        }

        if (this.unleashTimer > 0) this.unleashTimer--;
    }

    fire() {
        if (this.fireTimer > 0) return [];
        this.fireTimer = CONFIG.FIRE_RATE;
        const speed = CONFIG.BULLET_SPEEDS[this.tier - 1];
        const size = CONFIG.BULLET_SIZES[this.tier - 1];
        const spread = CONFIG.SPREAD_BASE + (this.tier - 1) * CONFIG.SPREAD_INCREMENT;
        const bullets = [];
        const count = this.tier >= 3 ? 3 : this.tier >= 2 ? 2 : 1;
        const angleStep = spread * (count - 1);
        const startX = count === 1 ? 0 : -angleStep;

        for (let i = 0; i < count; i++) {
            const angle = -Math.PI/2 + (i * spread - angleStep/2) + this.angle;
            bullets.push({
                x: this.x,
                y: this.y - 15,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: size / 2,
                damage: 10 + this.tier * 5,
                color: this.unleashTimer > 0 ? '#FFFFFF' : this.tier === 1 ? '#4ECDC4' : this.tier === 2 ? '#39FF14' : this.tier === 3 ? '#FFD700' : '#FFFFFF'
            });
        }
        audio.playLaser(this.tier - 1);
        return bullets;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    activateUnleash() {
        this.unleashTimer = CONFIG.UNLEASH_DURATION;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Unleash glow
        if (this.unleashTimer > 0) {
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 20 + Math.sin(Date.now() * 0.01) * 10;
        } else {
            ctx.shadowColor = this.tier === 1 ? '#4ECDC4' : this.tier === 2 ? '#39FF14' : this.tier === 3 ? '#FFD700' : '#FFFFFF';
            ctx.shadowBlur = 10;
        }

        // Ship body (pixel art style using rects)
        const s = 4; // pixel scale
        ctx.fillStyle = '#2A2A3A';
        // Main hull
        ctx.fillRect(-6*s, -8*s, 12*s, 16*s);
        // Wings
        ctx.fillRect(-10*s, -2*s, 4*s, 8*s);
        ctx.fillRect(6*s, -2*s, 4*s, 8*s);
        // Cockpit
        ctx.fillStyle = this.unleashTimer > 0 ? '#FFFFFF' : '#4ECDC4';
        ctx.fillRect(-2*s, -6*s, 4*s, 6*s);
        // Thrusters
        ctx.fillStyle = '#FF8C00';
        ctx.fillRect(-4*s, 8*s, 2*s, 2*s);
        ctx.fillRect(2*s, 8*s, 2*s, 2*s);

        ctx.restore();

        // Unleash countdown ring
        if (this.unleashTimer > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 30, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * (this.unleashTimer / CONFIG.UNLEASH_DURATION)));
            ctx.stroke();
            ctx.restore();
        }
    }
}

export default Player;