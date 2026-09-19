/** @file particles.js - Particle system for effects */

export class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }

    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawn(x, y, vx, vy, life, color, size) {
        this.particles.push(new Particle(x, y, vx, vy, life, color, size));
    }

    spawnExplosion(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1;
            this.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 30 + Math.random() * 20, color, Math.random() * 4 + 1);
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
    }

    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }
}

export const particles = new ParticleSystem();