/**
 * background.js
 * 4-layer parallax scrolling background.
 */

const Background = (() => {
    let stars = [];
    let nebulae = [];
    let planets = [];
    let comets = [];
    
    // Mouse tracking for parallax
    let mouseX = 0;
    let mouseY = 0;

    function init(w, h) {
        // Generate Stars
        for(let i=0; i<100; i++) {
            stars.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1
            });
        }

        // Generate Planets (Depth layers)
        for(let i=0; i<5; i++) {
            planets.push({
                x: Math.random() * w,
                y: Math.random() * h,
                size: Math.random() * 40 + 20,
                opacity: Math.random() * 0.3 + 0.1,
                speed: Math.random() * 0.2 + 0.05
            });
        }
    }

    function update(w, h) {
        // Update Stars
        stars.forEach(s => {
            s.y += s.speed;
            if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        });

        // Update Planets
        planets.forEach(p => {
            p.y += p.speed;
            if (p.y > h + p.size) { p.y = -p.size; p.x = Math.random() * w; }
        });

        // Update Comets (Rare)
        if (Math.random() < 0.005) {
            comets.push({
                x: Math.random() * w,
                y: -100,
                vx: (Math.random() - 0.5) * 2,
                vy: Math.random() * 5 + 5,
                life: 100
            });
        }
        comets.forEach(c => {
            c.x += c.vx;
            c.y += c.vy;
            c.life--;
        });
        comets = comets.filter(c => c.life > 0);
    }

    function draw(ctx, w, h) {
        // Parallax offset based on mouse
        const offsetX = (mouseX - w/2) * 0.05;
        const offsetY = (mouseY - h/2) * 0.05;

        // Draw Stars
        ctx.fillStyle = '#FFFFFF';
        stars.forEach(s => {
            ctx.globalAlpha = Math.random() * 0.5 + 0.5;
            ctx.fillRect(s.x + offsetX, s.y + offsetY, s.size, s.size);
        });
        ctx.globalAlpha = 1.0;

        // Draw Planets
        planets.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x + offsetX * 0.5, p.y + offsetY * 0.5, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 100, 255, ${p.opacity})`;
            ctx.fill();
        });

        // Draw Comets
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        comets.forEach(c => {
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x - c.vx * 5, c.y - c.vy * 5);
            ctx.stroke();
        });
    }

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    return { init, update, draw };
})();
