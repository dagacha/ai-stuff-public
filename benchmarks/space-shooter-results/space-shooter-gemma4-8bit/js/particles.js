class Particle {
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
        this.size *= 0.98;
    }

    draw(ctx) {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawn(x, y, count, color, speed, life, size) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, life, color, size));
        }
    }

    spawnExplosion(x, y, color) {
        this.spawn(x, y, 12, color, 3, 30, 4);
        this.spawn(x, y, 8, '#FFFFFF', 2, 20, 2);
    }

    spawnTrail(x, y, color) {
        this.particles.push(new Particle(
            x + (Math.random() - 0.5) * 4,
            y + (Math.random() - 0.5) * 4,
            0, 0.5, 15, color, 2
        ));
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            p.draw(ctx);
        }
    }
}

const particles = new ParticleSystem();
