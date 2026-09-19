class Background {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.stars = Array.from({ length: 100 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            s: Math.random() * 2,
            v: Math.random() * 2 + 1
        }));
        this.nebula = Array.from({ length: 3 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 300 + 200,
            v: 0.5,
            c: `rgba(50, 0, 100, 0.1)`
        }));
        this.planets = Array.from({ length: 2 }, () => ({
            x: Math.random() * width,
            y: -200,
            r: Math.random() * 50 + 50,
            v: 0.8,
            c: '#1a1a2e'
        }));
        this.comets = [];
    }
    update(mouseX, mouseY) {
        this.stars.forEach(s => {
            s.y += s.v;
            if (s.y > this.height) s.y = 0;
            s.x += (mouseX - this.width / 2) * 0.001;
        });
        this.nebula.forEach(n => {
            n.y += n.v;
            if (n.y > this.height + n.r) n.y = -n.r;
        });
        this.planets.forEach(p => {
            p.y += p.v;
            if (p.y > this.height + p.r) {
                p.y = -p.r;
                p.x = Math.random() * this.width;
            }
        });
        if (Math.random() < 0.005) {
            this.comets.push({ x: Math.random() * this.width, y: -50, v: 10, l: 20 });
        }
        this.comets.forEach((c, i) => {
            c.y += c.v;
            c.x += 2;
            if (c.y > this.height) this.comets.splice(i, 1);
        });
    }
    draw(ctx) {
        this.nebula.forEach(n => {
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
            grad.addColorStop(0, n.c);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
        });
        this.stars.forEach(s => {
            ctx.fillStyle = '#FFF';
            ctx.fillRect(s.x, s.y, s.s, s.s);
        });
        this.planets.forEach(p => {
            ctx.fillStyle = p.c;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.strokeStyle = '#FFF';
        this.comets.forEach(c => {
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x - 20, c.y - 20);
            ctx.stroke();
        });
    }
}