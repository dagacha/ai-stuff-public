/**
 * background.js - 4-layer parallax scrolling background.
 * Everything scrolls DOWNWARD (positive y) for vertical shooter feel.
 * Reacts to mouse position for depth.
 */
const Background = {
    stars: [],
    nebula: [],
    planets: [],
    comets: [],
    width: window.innerWidth,
    height: window.innerHeight,

    init() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this._initStars();
        this._initNebula();
        this._initPlanets();
        this._initComets();
    },

    _initStars() {
        this.stars = [];
        const count = 120;
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: 0.5 + Math.random() * 2,
                speed: 0.15 + Math.random() * 0.35,
                opacity: 0.3 + Math.random() * 0.7,
                twinkleSpeed: 0.01 + Math.random() * 0.03,
                twinklePhase: Math.random() * Math.PI * 2,
            });
        }
    },

    _initNebula() {
        this.nebula = [];
        const count = 6;
        for (let i = 0; i < count; i++) {
            this.nebula.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                width: 80 + Math.random() * 120,
                height: 40 + Math.random() * 80,
                speed: 0.2 + Math.random() * 0.3,
                opacity: 0.04 + Math.random() * 0.06,
                color: ['#FF6B9D', '#5B9BD5', '#9B59B5', '#4ECDC4', '#F1C40F', '#E74C3C'][Math.floor(Math.random() * 6)],
            });
        }
    },

    _initPlanets() {
        this.planets = [];
        // Far planets (small, dim, slow)
        for (let i = 0; i < 4; i++) {
            this.planets.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: 10 + Math.random() * 10,
                speed: 0.1 + Math.random() * 0.15,
                opacity: 0.25 + Math.random() * 0.15,
                color: ['#E74C3C', '#F39C12', '#5B9BD5', '#9B59B5'][i],
                ring: Math.random() > 0.5,
            });
        }
        // Near planets (large, bright, fast)
        for (let i = 0; i < 3; i++) {
            this.planets.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: 30 + Math.random() * 20,
                speed: 0.4 + Math.random() * 0.4,
                opacity: 0.6 + Math.random() * 0.4,
                color: ['#FF6B9D', '#4ECDC4', '#F1C40F'][i],
                ring: Math.random() > 0.4,
            });
        }
    },

    _initComets() {
        this.comets = [];
        for (let i = 0; i < 3; i++) {
            this.comets.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                speed: 1.5 + Math.random() * 2,
                angle: Math.PI * 0.15 + Math.random() * 0.2, // diagonal downward
                length: 40 + Math.random() * 60,
                opacity: 0.3 + Math.random() * 0.4,
                active: true,
                timer: Math.random() * 200,
            });
        }
    },

    update(mouseX, mouseY) {
        const time = Date.now() * 0.001;
        const mouseInfluenceX = (mouseX / this.width - 0.5) * 10;
        const mouseInfluenceY = (mouseY / this.height - 0.5) * 5;

        // Update stars
        for (const s of this.stars) {
            s.y += s.speed;
            s.x += mouseInfluenceX * 0.02;
            if (s.y > this.height) {
                s.y = -2;
                s.x = Math.random() * this.width;
            }
            if (s.x < -5) s.x = this.width + 5;
            if (s.x > this.width + 5) s.x = -5;
        }

        // Update nebula
        for (const n of this.nebula) {
            n.y += n.speed;
            n.x += mouseInfluenceX * 0.04;
            if (n.y > this.height + n.height) {
                n.y = -n.height;
                n.x = Math.random() * this.width;
            }
            if (n.x < -n.width) n.x = this.width + n.width;
            if (n.x > this.width + n.width) n.x = -n.width;
        }

        // Update planets
        for (const p of this.planets) {
            p.y += p.speed;
            p.x += mouseInfluenceX * (p.speed * 0.1);
            if (p.y > this.height + p.radius * 2) {
                p.y = -p.radius * 2;
                p.x = Math.random() * this.width;
            }
            if (p.x < -p.radius * 2) p.x = this.width + p.radius * 2;
            if (p.x > this.width + p.radius * 2) p.x = -p.radius * 2;
        }

        // Update comets
        for (const c of this.comets) {
            if (c.active) {
                c.x += Math.cos(c.angle) * c.speed;
                c.y += Math.sin(c.angle) * c.speed;
                if (c.y > this.height + c.length) {
                    c.active = false;
                    c.timer = 100 + Math.random() * 200;
                }
            } else {
                c.timer--;
                if (c.timer <= 0) {
                    c.active = true;
                    c.x = Math.random() * this.width;
                    c.y = -c.length;
                    c.timer = 0;
                }
            }
        }
    },

    draw(ctx, time) {
        // Draw stars
        for (const s of this.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed * 60 + s.twinklePhase);
            ctx.globalAlpha = s.opacity * twinkle;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;

        // Draw nebula
        for (const n of this.nebula) {
            ctx.globalAlpha = n.opacity;
            ctx.fillStyle = n.color;
            ctx.fillRect(n.x, n.y, n.width, n.height);
        }
        ctx.globalAlpha = 1;

        // Draw planets
        for (const p of this.planets) {
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            if (p.ring) {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, p.radius * 1.6, p.radius * 0.4, 0.3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;

        // Draw comets
        for (const c of this.comets) {
            if (c.active) {
                ctx.globalAlpha = c.opacity;
                const tailX = c.x - Math.cos(c.angle) * c.length;
                const tailY = c.y - Math.sin(c.angle) * c.length;
                const grad = ctx.createLinearGradient(tailX, tailY, c.x, c.y);
                grad.addColorStop(0, 'rgba(255,255,255,0)');
                grad.addColorStop(1, '#FFFFFF');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(c.x, c.y);
                ctx.stroke();
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
            }
        }
        ctx.globalAlpha = 1;
    },

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this._initStars();
        this._initNebula();
        this._initPlanets();
        this._initComets();
    },
};