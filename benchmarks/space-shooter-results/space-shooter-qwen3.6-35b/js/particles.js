/**
 * particles.js
 * Manages all visual particle effects: explosions, trails, sparks, ink splatter, and floating damage numbers.
 */

import CONFIG from './config.js';

class Particle {
    constructor(x, y, vx, vy, color, size, lifetime, type = 'normal') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.lifetime = lifetime;
        this.maxLifetime = lifetime;
        this.type = type;
        this.alpha = 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;
        this.alpha = this.lifetime / this.maxLifetime;
        if (this.type === 'trail') {
            this.size *= 0.95;
        } else if (this.type === 'damage') {
            this.vy = -CONFIG.DAMAGE_NUMBER_RISE / this.maxLifetime;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        if (this.type === 'damage') {
            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(this.color, this.x, this.y);
            ctx.fillText(this.color, this.x, this.y);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        }
        ctx.restore();
    }

    isDead() {
        return this.lifetime <= 0;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawnExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, color, Math.random() * 6 + 2, CONFIG.PARTICLE_LIFETIME, 'normal'));
        }
        // Green core burst
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 0.5;
            this.particles.push(new Particle(x, y, Math.cos(angle)*speed, Math.sin(angle)*speed, '#39FF14', 8, 15, 'normal'));
        }
    }

    spawnInk(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push(new Particle(x, y, Math.cos(angle)*speed, Math.sin(angle)*speed, color, Math.random() * 8 + 4, 30, 'normal'));
        }
    }

    spawnTrail(x, y, color) {
        this.particles.push(new Particle(x, y, (Math.random()-0.5)*0.5, Math.random()*2+1, color, 3, 10, 'trail'));
    }

    spawnSpark(x, y, color) {
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.particles.push(new Particle(x, y, Math.cos(angle)*speed, Math.sin(angle)*speed, color, 2, 15, 'normal'));
        }
    }

    spawnDamageNumber(x, y, value) {
        this.particles.push(new Particle(x, y, 0, 0, `-${value}`, 0, CONFIG.DAMAGE_NUMBER_LIFETIME, 'damage'));
    }

    update() {
        this.particles = this.particles.filter(p => {
            p.update();
            return !p.isDead();
        });
    }

    draw(ctx) {
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }
}

export const particles = new ParticleSystem();