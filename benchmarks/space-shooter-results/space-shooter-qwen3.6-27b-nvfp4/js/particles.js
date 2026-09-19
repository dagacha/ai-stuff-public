/**
 * particles.js - Full particle system for explosions, trails, sparks, ink, and powerups.
 * All particles are managed in a single pool and drawn each frame.
 */
const Particles = {
    pool: [],
    maxCount: CONFIG.PARTICLES.maxCount,

    // Spawn a single particle
    spawn(x, y, props) {
        if (this.pool.length >= this.maxCount) {
            // Remove oldest
            this.pool.shift();
        }
        this.pool.push({
            x: x,
            y: y,
            vx: props.vx || 0,
            vy: props.vy || 0,
            life: props.life || 20,
            maxLife: props.life || 20,
            size: props.size || 3,
            color: props.color || '#FFFFFF',
            type: props.type || 'default',
            gravity: props.gravity || 0,
            shrink: props.shrink !== undefined ? props.shrink : true,
        });
    },

    // Engine trail particles
    spawnEngineTrail(x, y, tier) {
        const colors = ['#F39C12', '#F1C40F', '#E67E22', '#FFD700'];
        for (let i = 0; i < CONFIG.PARTICLES.engineTrail.count; i++) {
            this.spawn(x + (Math.random() - 0.5) * 6, y, {
                vx: (Math.random() - 0.5) * 0.5,
                vy: 1 + Math.random() * 1.5,
                life: CONFIG.PARTICLES.engineTrail.life + Math.random() * 8,
                size: CONFIG.PARTICLES.engineTrail.size + Math.random() * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                type: 'engine',
                gravity: 0.02,
                shrink: true,
            });
        }
    },

    // Bullet trail particles
    spawnBulletTrail(x, y, color) {
        this.spawn(x + (Math.random() - 0.5) * 2, y, {
            vx: 0,
            vy: -0.5,
            life: CONFIG.PARTICLES.bulletTrail.life,
            size: CONFIG.PARTICLES.bulletTrail.size,
            color: color,
            type: 'trail',
            shrink: true,
        });
    },

    // Spark particles on hit
    spawnSparks(x, y, count = 4) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            this.spawn(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: CONFIG.PARTICLES.spark.life + Math.random() * 6,
                size: CONFIG.PARTICLES.spark.size + Math.random() * 2,
                color: Math.random() > 0.5 ? '#FFFFFF' : '#F1C40F',
                type: 'spark',
                gravity: 0.05,
                shrink: true,
            });
        }
    },

    // Ink splatter on enemy death
    spawnInkSplatter(x, y, color, size = 1) {
        const count = CONFIG.PARTICLES.inkSplatter.count * size;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4 * size;
            this.spawn(x + (Math.random() - 0.5) * size * 10, y + (Math.random() - 0.5) * size * 10, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 25 + Math.random() * 15,
                size: CONFIG.PARTICLES.inkSplatter.size * size * (0.5 + Math.random()),
                color: color,
                type: 'ink',
                gravity: 0.08,
                shrink: true,
            });
        }
    },

    // Explosion particles
    spawnExplosion(x, y, color, size = 1) {
        // Green core burst
        this.spawn(x, y, {
            vx: 0, vy: 0,
            life: 8, size: 12 * size,
            color: '#2ECC71', type: 'explosion_core',
            shrink: false,
        });
        // Scattered colored particles
        const colors = [color, '#2ECC71', '#F1C40F', '#FFFFFF', '#FF6B9D', '#5B9BD5'];
        for (let i = 0; i < CONFIG.PARTICLES.explosion.count * size; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4 * size;
            this.spawn(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: CONFIG.PARTICLES.explosion.life * size + Math.random() * 10,
                size: CONFIG.PARTICLES.explosion.size * size * (0.3 + Math.random()),
                color: colors[Math.floor(Math.random() * colors.length)],
                type: 'explosion',
                gravity: 0.04,
                shrink: true,
            });
        }
    },

    // Powerup sparkle
    spawnPowerupSparkles(x, y) {
        for (let i = 0; i < CONFIG.PARTICLES.powerup.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            this.spawn(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: CONFIG.PARTICLES.powerup.life,
                size: CONFIG.PARTICLES.powerup.size,
                color: '#F1C40F',
                type: 'powerup',
                shrink: true,
            });
        }
    },

    // Update all particles
    update() {
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const p = this.pool[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.life--;
            if (p.shrink) {
                p.size *= 0.97;
            }
            if (p.life <= 0) {
                this.pool.splice(i, 1);
            }
        }
    },

    // Draw all particles
    draw(ctx) {
        for (const p of this.pool) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
    },

    // Clear all particles
    clear() {
        this.pool.length = 0;
    },
};