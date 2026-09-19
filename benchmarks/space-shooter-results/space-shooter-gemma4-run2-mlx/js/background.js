class BackgroundLayer {
    constructor(count, speed, size, color) {
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: size,
                color: color
            });
        }
        this.speed = speed;
    }

    update() {
        this.stars.forEach(s => {
            s.y += this.speed;
            if (s.y > window.innerHeight) {
                s.y = -s.size;
                s.x = Math.random() * window.innerWidth;
            }
        });
    }

    draw(ctx) {
        ctx.fillStyle = this.stars[0].color; // Using star color as context fill
        this.stars.forEach(s => {
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x, s.y, s.size, s.size);
        });
    }
}

class ParallaxBackground {
    constructor() {
        this.layers = [
            new BackgroundLayer(100, 0.5, 1, '#ffffff'), // Stars
            new BackgroundLayer(30, 0.8, 2, '#4444ff'), // Nebula bits
            new BackgroundLayer(5, 1.2, 4, '#ff00ff'),  // Large particles
            new BackgroundLayer(2, 2.5, 6, '#ffffff')   // Comets
        ];
    }

    update() {
        this.layers.forEach(l => l.update());
    }

    draw(ctx) {
        this.layers.forEach(l => l.draw(ctx));
    }
}

const background = new ParallaxBackground();