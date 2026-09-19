class Star {
    constructor() {
        this.reset();
        this.y = Math.random() * window.innerHeight;
    }

    reset() {
        this.x = Math.random() * window.innerWidth;
        this.y = -10;
        this.size = Math.random() * 2 + 1;
        this.speed = this.size * 0.5;
        this.brightness = Math.random();
    }

    update() {
        this.y += this.speed;
        if (this.y > window.innerHeight) {
            this.reset();
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.brightness})`;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

class ParallaxLayer {
    constructor(count, speed, size, color) {
        this.items = [];
        for (let i = 0; i < count; i++) {
            this.items.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * size + size/2,
                speed: (Math.random() + 0.5) * speed,
                color: color
            });
        }
    }

    update() {
        for (const item of this.items) {
            item.y += item.speed;
            if (item.y > window.innerHeight + item.size) {
                item.y = -item.size;
                item.x = Math.random() * window.innerWidth;
            }
        }
    }

    draw(ctx) {
        for (const item of this.items) {
            ctx.fillStyle = item.color;
            ctx.fillRect(item.x, item.y, item.size, item.size);
        }
    }
}

class Background {
    constructor() {
        this.stars = Array(100).fill(null).map(() => new Star());
        this.nebula = new ParallaxLayer(5, 0.3, 60, 'rgba(100, 50, 150, 0.1)');
        this.planets = new ParallaxLayer(3, 0.1, 30, 'rgba(200, 100, 50, 0.3)');
        this.comets = new ParallaxLayer(2, 2, 4, 'rgba(255, 255, 255, 0.8)');
    }

    update() {
        for (const star of this.stars) star.update();
        this.nebula.update();
        this.planets.update();
        this.comets.update();
    }

    draw(ctx) {
        // Deep space gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
        gradient.addColorStop(0, '#0a0a2e');
        gradient.addColorStop(1, '#1a1a3e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        for (const star of this.stars) star.draw(ctx);
        this.nebula.draw(ctx);
        this.planets.draw(ctx);
        this.comets.draw(ctx);
    }
}

const background = new Background();
