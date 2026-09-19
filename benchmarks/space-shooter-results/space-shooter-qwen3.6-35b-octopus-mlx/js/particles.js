/* js/particles.js */
const Particles = (() => {
    let list = [];

    const spawnExplosion = (x, y, color, count = 10) => {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            list.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color: color,
                type: 'spark'
            });
        }
    };

    const spawnDamageNumber = (x, y, amount) => {
        list.push({
            x, y,
            vx: 0,
            vy: -1,
            life: 1.0,
            text: amount,
            type: 'text'
        });
    };

    const update = (ctx) => {
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;

            if (p.life <= 0) {
                list.splice(i, 1);
                continue;
            }

            ctx.globalAlpha = p.life;
            if (p.type === 'spark') {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 3, 3);
            } else if (p.type === 'text') {
                ctx.fillStyle = CONFIG.colors.textHighlight;
                ctx.font = '20px monospace';
                ctx.fillText(p.text, p.x, p.y);
            }
            ctx.globalAlpha = 1.0;
        }
    };

    return { spawnExplosion, spawnDamageNumber, update };
})();
