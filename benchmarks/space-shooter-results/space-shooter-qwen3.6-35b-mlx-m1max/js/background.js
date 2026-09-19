// js/background.js
/**
 * background.js - 4-layer parallax background for vertical scrolling.
 * Stars, nebula, planets, and comets all scroll DOWNWARD.
 * Mouse-reactive depth parallax.
 */

const Background = (() => {
    let stars = [];
    let nebulae = [];
    let planets = [];
    let comets = [];
    let mouseX = 0;
    let mouseY = 0;

    function init(w, h) {
        stars = [];
        nebulae = [];
        planets = [];
        comets = [];

        // Stars: 4 depth layers
        for (let layer = 0; layer < 4; layer++) {
            const count = 40 + layer * 30;
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    size: 1 + layer * 0.5,
                    speed: 0.1 + layer * 0.15,
                    brightness: 0.3 + layer * 0.2,
                    layer,
                });
            }
        }

        // Nebulae
        for (let i = 0; i < 6; i++) {
            nebulae.push({
                x: Math.random() * w,
                y: Math.random() * h,
                radius: 60 + Math.random() * 120,
                color: [
                    'rgba(78, 205, 196, 0.03)',
                    'rgba(155, 89, 182, 0.03)',
                    'rgba(255, 105, 180, 0.02)',
                    'rgba(0, 191, 255, 0.03)',
                ][Math.floor(Math.random() * 4)],
                speed: 0.2 + Math.random() * 0.3,
                layer: 1 + Math.random() * 2,
            });
        }

        // Planets: far (small, dim, slow) and near (large, bright, fast)
        for (let i = 0; i < 4; i++) {
            const isNear = i < 2;
            planets.push({
                x: Math.random() * w,
                y: Math.random() * h,
                radius: isNear ? 60 + Math.random() * 40 : 20 + Math.random() * 20,
                opacity: isNear ? 0.8 : 0.4,
                speed: isNear ? 0.5 + Math.random() * 0.3 : 0.1 + Math.random() * 0.1,
                color: isNear
                    ? `hsl(${Math.random() * 360}, 60%, 40%)`
                    : `hsl(${Math.random() * 360}, 30%, 25%)`,
                layer: isNear ? 2 : 0,
                ring: Math.random() > 0.5,
            });
        }

        // Comets
        for (let i = 0; i < 3; i++) {
            comets.push({
                x: Math.random() * w,
                y: Math.random() * h,
                speed: 3 + Math.random() * 3,
                angle: Math.PI / 4 + (Math.random() - 0.5) * 0.5,
                length: 30 + Math.random() * 50,
                active: false,
                timer: Math.random() * 600,
            });
        }
    }

    function update(w, h) {
        const parallaxX = (mouseX - w / 2) * 0.02;
        const parallaxY = (mouseY - h / 2) * 0.02;

        // Stars
        for (const s of stars) {
            s.y += s.speed;
            s.x += parallaxX * (0.5 + s.layer * 0.2);
            if (s.y > h + 5) {
                s.y = -5;
                s.x = Math.random() * w;
            }
        }

        // Nebulae
        for (const n of nebulae) {
            n.y += n.speed;
            n.x += parallaxX * 0.3;
            if (n.y > h + n.radius) {
                n.y = -n.radius;
                n.x = Math.random() * w;
            }
        }

        // Planets
        for (const p of planets) {
            p.y += p.speed;
            p.x += parallaxX * (0.3 + p.layer * 0.2);
            if (p.y > h + p.radius) {
                p.y = -p.radius;
                p.x = Math.random() * w;
            }
        }

        // Comets
        for (const c of comets) {
            c.timer--;
            if (c.timer <= 0 && !c.active) {
                c.active = true;
                c.x = Math.random() * w;
                c.y = -50;
                c.timer = 300 + Math.random() * 300;
            }
            if (c.active) {
                c.x += Math.cos(c.angle) * c.speed;
                c.y += Math.sin(c.angle) * c.speed;
                if (c.y > h + 100 || c.x > w + 100 || c.x < -100) {
                    c.active = false;
                    c.timer = 300 + Math.random() * 300;
                }
            }
        }
    }

    function draw(ctx, w, h) {
        // Stars
        for (const s of stars) {
            ctx.globalAlpha = s.brightness;
            ctx.fillStyle = CONFIG.COLORS.white;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Nebulae
        for (const n of nebulae) {
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
            grad.addColorStop(0, n.color);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2);
        }

        // Planets
        for (const p of planets) {
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();

            // Planet ring
            if (p.ring) {
                ctx.strokeStyle = `rgba(255,255,255,${p.opacity * 0.3})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, p.radius * 1.5, p.radius * 0.3, 0.3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;

        // Comets
        for (const c of comets) {
            if (!c.active) continue;
            const tailX = c.x - Math.cos(c.angle) * c.length;
            const tailY = c.y - Math.sin(c.angle) * c.length;
            const grad = ctx.createLinearGradient(tailX, tailY, c.x, c.y);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(1, 'rgba(255,255,255,0.8)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(c.x, c.y);
            ctx.stroke();

            // Head glow
            ctx.fillStyle = 'rgba(200,220,255,0.9)';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function setMouse(x, y) {
        mouseX = x;
        mouseY = y;
    }

    return {
        init,
        update,
        draw,
        setMouse,
    };
})();
