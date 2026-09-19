// js/particles.js
/**
 * particles.js - Particle system for explosions, trails, sparks, ink splatter, etc.
 * All particles are drawn in the main game loop via particles.draw(ctx).
 */

const Particles = (() => {
    let particles = [];

    function spawn(type, x, y, options = {}) {
        if (particles.length >= CONFIG.PARTICLES.maxParticles) return;

        const p = {
            type,
            x,
            y,
            vx: options.vx || 0,
            vy: options.vy || 0,
            life: options.life || 30,
            maxLife: options.life || 30,
            size: options.size || 3,
            color: options.color || CONFIG.COLORS.white,
            gravity: options.gravity || 0,
            friction: options.friction || 0.98,
            rotation: options.rotation || 0,
            rotationSpeed: options.rotationSpeed || 0,
            text: options.text || null,
            fontSize: options.fontSize || 14,
            trail: options.trail || false,
            trailColor: options.trailColor || null,
        };

        if (type === 'explosion') {
            const count = options.count || 20;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
                const speed = 1 + Math.random() * 4;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 4,
                    color: options.color || CONFIG.COLORS.green,
                    life: 20 + Math.random() * 20,
                    maxLife: 40,
                });
            }
            // Green core burst
            for (let i = 0; i < 8; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.5 + Math.random() * 2;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 4 + Math.random() * 3,
                    color: CONFIG.COLORS.green,
                    life: 15 + Math.random() * 10,
                    maxLife: 25,
                });
            }
            return;
        }

        if (type === 'inkSplatter') {
            const count = options.count || 12;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 3;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 3 + Math.random() * 6,
                    color: options.color || CONFIG.COLORS.pink,
                    life: 20 + Math.random() * 15,
                    maxLife: 35,
                });
            }
            return;
        }

        if (type === 'spark') {
            const count = options.count || 5;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 1 + Math.random() * 2,
                    color: Math.random() > 0.5 ? CONFIG.COLORS.yellow : CONFIG.COLORS.white,
                    life: 8 + Math.random() * 7,
                    maxLife: 15,
                });
            }
            return;
        }

        if (type === 'engineTrail') {
            p.life = CONFIG.PARTICLES.engineTrailLife;
            p.maxLife = CONFIG.PARTICLES.engineTrailLife;
            p.size = 2 + Math.random() * 3;
            p.color = Math.random() > 0.5 ? CONFIG.COLORS.orange : CONFIG.COLORS.yellow;
        }

        if (type === 'bulletTrail') {
            p.life = CONFIG.PARTICLES.bulletTrailLife;
            p.maxLife = CONFIG.PARTICLES.bulletTrailLife;
            p.size = 1 + Math.random() * 2;
            p.color = options.color || CONFIG.COLORS.cyan;
        }

        if (type === 'damageNumber') {
            p.life = CONFIG.PARTICLES.damageNumberLife;
            p.maxLife = CONFIG.PARTICLES.damageNumberLife;
            p.vy = -1; // float upward
            p.gravity = 0;
            p.text = options.text || '-10';
            p.fontSize = options.fontSize || 16;
            p.color = CONFIG.COLORS.yellow;
        }

        if (type === 'powerupSparkle') {
            const count = options.count || 10;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 2;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 3,
                    color: CONFIG.COLORS.gold,
                    life: 20 + Math.random() * 15,
                    maxLife: 35,
                });
            }
            return;
        }

        if (type === 'rainbowDust') {
            const count = options.count || 15;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 3;
                particles.push({
                    ...p,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: 2 + Math.random() * 4,
                    color: CONFIG.COLORS.rainbow[Math.floor(Math.random() * CONFIG.COLORS.rainbow.length)],
                    life: 25 + Math.random() * 20,
                    maxLife: 45,
                });
            }
            return;
        }

        particles.push(p);
    }

    function update() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.life--;
            if (p.rotation !== undefined) {
                p.rotation += p.rotationSpeed;
            }
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function draw(ctx) {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);

            if (p.type === 'damageNumber') {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.font = `bold ${p.fontSize}px monospace`;
                ctx.fillStyle = p.color;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
                ctx.restore();
                continue;
            }

            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.rotation) {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }

            ctx.restore();
        }
    }

    function clear() {
        particles = [];
    }

    return {
        spawn,
        update,
        draw,
        clear,
    };
})();
