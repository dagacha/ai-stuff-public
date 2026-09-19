/**
 * background.js
 * 4-layer parallax scrolling background for vertical top-down shooter.
 * Stars, nebula, planets, and comets all scroll downward.
 * Reacts to mouse position for depth feel.
 */

import CONFIG from './config.js';

class Background {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.mouseX = this.width / 2;
        this.mouseY = this.height / 2;
        this.layers = {
            stars: [],
            nebula: [],
            planets: [],
            comets: []
        };
        this.init();
        this.bindEvents();
    }

    init() {
        // Stars
        for (let i = 0; i < 150; i++) {
            this.layers.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.5 + 0.1,
                alpha: Math.random() * 0.8 + 0.2
            });
        }
        // Nebula
        for (let i = 0; i < 8; i++) {
            this.layers.nebula.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 100 + 50,
                color: `hsla(${Math.random()*360}, 70%, 50%, 0.15)`,
                speed: Math.random() * 0.3 + 0.1
            });
        }
        // Planets
        for (let i = 0; i < 5; i++) {
            const isNear = Math.random() > 0.5;
            this.layers.planets.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: isNear ? Math.random() * 40 + 60 : Math.random() * 20 + 20,
                color: isNear ? '#2A2A3A' : '#1A1A25',
                opacity: isNear ? 1.0 : 0.4,
                speed: isNear ? Math.random() * 0.3 + 0.5 : Math.random() * 0.1 + 0.1,
                crater: Math.random() * 0.3 + 0.1
            });
        }
        // Comets
        for (let i = 0; i < 3; i++) {
            this.layers.comets.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                speed: Math.random() * 3 + 2,
                angle: Math.PI / 4 + (Math.random() - 0.5) * 0.5,
                length: Math.random() * 50 + 30,
                active: true
            });
        }
    }

    bindEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('resize', () => {
            this.width = this.canvas.width;
            this.height = this.canvas.height;
        });
    }

    update() {
        const parallaxX = (this.mouseX - this.width / 2) * 0.02;
        const parallaxY = (this.mouseY - this.height / 2) * 0.02;

        // Stars
        for (const s of this.layers.stars) {
            s.y += s.speed;
            s.x += parallaxX * 0.1;
            if (s.y > this.height) { s.y = -10; s.x = Math.random() * this.width; }
            if (s.x < 0) s.x = this.width;
            if (s.x > this.width) s.x = 0;
        }

        // Nebula
        for (const n of this.layers.nebula) {
            n.y += n.speed;
            n.x += parallaxX * 0.2;
            if (n.y > this.height + n.radius) { n.y = -n.radius; n.x = Math.random() * this.width; }
        }

        // Planets
        for (const p of this.layers.planets) {
            p.y += p.speed;
            p.x += parallaxX * 0.3;
            if (p.y > this.height + p.radius) { p.y = -p.radius; p.x = Math.random() * this.width; }
        }

        // Comets
        for (const c of this.layers.comets) {
            c.x += Math.cos(c.angle) * c.speed;
            c.y += Math.sin(c.angle) * c.speed;
            if (c.y > this.height + 100 || c.x < -100 || c.x > this.width + 100) {
                c.x = Math.random() * this.width;
                c.y = -50;
                c.angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5;
                c.speed = Math.random() * 3 + 2;
            }
        }
    }

    draw(ctx) {
        ctx.fillStyle = CONFIG.CANVAS_BG;
        ctx.fillRect(0, 0, this.width, this.height);

        // Stars
        for (const s of this.layers.stars) {
            ctx.globalAlpha = s.alpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }

        // Nebula
        for (const n of this.layers.nebula) {
            const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius);
            grad.addColorStop(0, n.color);
            grad.addColorStop(1, 'transparent');
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Planets
        for (const p of this.layers.planets) {
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            // Crater detail
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(p.x - p.radius*0.3, p.y - p.radius*0.3, p.radius*p.crater, 0, Math.PI*2);
            ctx.fill();
        }

        // Comets
        for (const c of this.layers.comets) {
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#A0F0FF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(c.x - Math.cos(c.angle)*c.length, c.y - Math.sin(c.angle)*c.length);
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
        }

        ctx.globalAlpha = 1;
    }
}

export default Background;