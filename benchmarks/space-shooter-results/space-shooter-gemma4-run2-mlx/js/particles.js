class Particle {
    constructor(x, y, color, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 3, 3);
        ctx.globalAlpha = 1;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawnExplosion(x, y, color) {
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            this.particles.push(new Particle(x, y, color, Math.cos(angle) * speed, Math.sin(angle) * speed, 30));
        }
    }

    spawnInk(x, y) {
        for (let i = 0; i < 5; i++) {
            this.particles.push(new Particle(x, y, '#000000', (Math.random()-0.5)*2, (Math.random()-0.5)*2, 60));
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

const particleSystem = new ParticleSystem();