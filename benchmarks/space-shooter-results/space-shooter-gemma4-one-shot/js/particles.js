class Particle {
    constructor(x, y, color, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = Math.random() * 3 + 1;
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

class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    spawn(x, y, color, count, speed, life) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const s = Math.random() * speed;
            this.particles.push(new Particle(x, y, color, Math.cos(angle) * s, Math.sin(angle) * s, life));
        }
    }
    spawnEngineTrail(x, y) {
        this.particles.push(new Particle(x, y, '#FF4500', (Math.random() - 0.5) * 1, 2, 20));
    }
    spawnBulletTrail(x, y, color) {
        this.particles.push(new Particle(x, y, color, 0, 0, 5));
    }
    spawnSpark(x, y) {
        this.spawn(x, y, '#FFFFFF', 5, 4, 10);
    }
    spawnInk(x, y) {
        this.spawn(x, y, '#333', 10, 1, 30);
    }
    spawnExplosion(x, y, color, size) {
        this.spawn(x, y, color, size, 5, 30);
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