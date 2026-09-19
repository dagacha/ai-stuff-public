/** @file background.js - 4-layer parallax vertical scrolling */

export class Background {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layers = {
            stars: [],
            nebula: [],
            planets: [],
            comets: []
        };
        this.init();
    }

    init() {
        // Stars
        for (let i = 0; i < 100; i++) {
            this.layers.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: Math.random() * 0.5 + 0.1
            });
        }
        // Nebula
        for (let i = 0; i < 5; i++) {
            this.layers.nebula.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 200 + 100,
                speed: Math.random() * 0.2 + 0.05,
                color: `rgba(50, 0, 100, 0.1)`
            });
        }
        // Planets
        for (let i = 0; i < 4; i++) {
            this.layers.planets.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 40 + 20,
                speed: Math.random() * 0.3 + 0.1,
                isFar: Math.random() > 0.5,
                color: '#34495e'
            });
        }
    }

    update(mouseX, mouseY) {
        const dx = (mouseX - this.canvas.width / 2) * 0.01;
        const dy = (mouseY - this.canvas.height / 2) * 0.01;

        this.layers.stars.forEach(s => {
            s.y += s.speed;
            s.x += dx * 0.1;
            if (s.y > this.canvas.height) s.y = 0;
            if (s.x > this.canvas.width) s.x = 0;
            if (s.x < 0) s.x = this.canvas.width;
        });

        this.layers.nebula.forEach(n => {
            n.y += n.speed;
            if (n.y > this.canvas.height) n.y = -n.size;
        });

        this.layers.planets.forEach(p => {
            p.y += p.speed;
            if (p.y > this.canvas.height) p.y = -p.size;
            p.x += dx * 0.5;
        });
    }

    draw(ctx) {
        ctx.fillStyle = '#0D1117';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Nebula
        this.layers.nebula.forEach(n => {
            ctx.fillStyle = n.color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Stars
        ctx.fillStyle = '#FFFFFF';
        this.layers.stars.forEach(s => {
            ctx.fillRect(s.x, s.y, s.size, s.size);
        });

        // Draw Planets
        this.layers.planets.forEach(p => {
            ctx.globalAlpha = p.isFar ? 0.4 : 1.0;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        });
    }
}