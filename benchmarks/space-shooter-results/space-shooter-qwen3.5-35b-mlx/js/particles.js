/**
 * particles.js
 * Handles all visual effects: explosions, trails, sparks.
 */

const Particles = (() => {
    let particles = [];

    class Particle {
        constructor(x, y, vx, vy, color, life, size) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.color = color;
            this.life = life;
            this.maxLife = life;
            this.size = size;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.life--;
            this.size *= 0.95; // Shrink over time
        }

        draw(ctx) {
            ctx.globalAlpha = this.life / this.maxLife;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.size, this.size);
            ctx.globalAlpha = 1.0;
        }
    }

    // Damage Number Class
    class DamageNumber {
        constructor(x, y, text, color) {
            this.x = x;
            this.y = y;
            this.text = text;
            this.color = color;
            this.life = 60; // 1 second
            this.vy = -2; // Float up
        }

        update() {
            this.y += this.vy;
            this.life--;
        }

        draw(ctx) {
            ctx.globalAlpha = Math.max(0, this.life / 60);
            ctx.fillStyle = this.color;
            ctx.font = "bold 20px monospace";
            ctx.fillText(this.text, this.x, this.y);
            ctx.globalAlpha = 1.0;
        }
    }

    let damageNumbers = [];

    function spawnExplosion(x, y, color, count = 10, size = 5) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1;
            particles.push(new Particle(
                x, y, 
                Math.cos(angle) * speed, 
                Math.sin(angle) * speed, 
                color, 
                30 + Math.random() * 20, 
                size
            ));
        }
    }

    function spawnTrail(x, y, color) {
        particles.push(new Particle(
            x, y, 
            (Math.random() - 0.5) * 0.5, 
            Math.random() * 2 + 1, // Move down
            color, 
            10, 
            3
        ));
    }

    function spawnDamage(x, y, amount) {
        damageNumbers.push(new DamageNumber(x, y, `-${amount}`, '#FFFF00'));
    }

    function update() {
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => p.update());
        
        damageNumbers = damageNumbers.filter(d => d.life > 0);
        damageNumbers.forEach(d => d.update());
    }

    function draw(ctx) {
        particles.forEach(p => p.draw(ctx));
        damageNumbers.forEach(d => d.draw(ctx));
    }

    return { update, draw, spawnExplosion, spawnTrail, spawnDamage };
})();
