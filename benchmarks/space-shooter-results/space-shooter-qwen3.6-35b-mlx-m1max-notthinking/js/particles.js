/**
 * particles.js
 * Manages the particle system for explosions, trails, and effects.
 */
const Particles = {
    list: [],

    spawn(x, y, type, color, count = 1) {
        for (let i = 0; i < count; i++) {
            let p = {
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.02,
                size: Math.random() * 3 + 1,
                color: color,
                type: type // 'trail', 'spark', 'explosion', 'ink'
            };

            if (type === 'trail') {
                p.vx = 0;
                p.vy = Math.random() * 2; // Move down with ship
                p.decay = 0.1;
                p.size = 2;
            } else if (type === 'explosion') {
                p.vx *= 3;
                p.vy *= 3;
                p.decay = 0.02;
                p.size = Math.random() * 5 + 2;
            } else if (type === 'ink') {
                p.vx *= 2;
                p.vy *= 2;
                p.decay = 0.015;
            }

            this.list.push(p);
        }
    },

    spawnDamageNumber(x, y, amount) {
        this.list.push({
            x: x,
            y: y,
            vx: 0,
            vy: -1, // Float up
            life: 1.0,
            decay: 0.02,
            text: `-${amount}`,
            type: 'text',
            color: '#FFFF00'
        });
    },

    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            let p = this.list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;

            if (p.life <= 0) {
                this.list.splice(i, 1);
            }
        }
    },

    draw(ctx) {
        for (let p of this.list) {
            ctx.globalAlpha = p.life;
            
            if (p.type === 'text') {
                ctx.fillStyle = p.color;
                ctx.font = '20px monospace';
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, p.size, p.size);
            }
            ctx.globalAlpha = 1.0;
        }
    }
};
