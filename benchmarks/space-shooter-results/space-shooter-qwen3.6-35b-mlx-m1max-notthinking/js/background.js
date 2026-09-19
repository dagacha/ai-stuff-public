/**
 * background.js
 * Handles 4-layer parallax scrolling background.
 */
const Background = {
    layers: [],
    
    init() {
        // Layer 1: Stars (Far, slow, small)
        for(let i=0; i<100; i++) {
            this.layers.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2,
                speed: 0.2,
                color: '#FFFFFF',
                type: 'star'
            });
        }

        // Layer 2: Nebula (Medium, transparent)
        for(let i=0; i<5; i++) {
            this.layers.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 100 + 50,
                speed: 0.5,
                color: `rgba(255, 0, 255, ${Math.random() * 0.1})`,
                type: 'nebula'
            });
        }

        // Layer 3: Planets (Near, fast, large)
        for(let i=0; i<3; i++) {
            this.layers.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 60 + 40,
                speed: 1.0,
                color: '#222',
                type: 'planet'
            });
        }
    },

    update(mouseX, mouseY) {
        // Parallax effect: shift layers slightly based on mouse
        const px = (mouseX - window.innerWidth / 2) * 0.05;
        const py = (mouseY - window.innerHeight / 2) * 0.05;

        this.layers.forEach(obj => {
            obj.y += obj.speed;
            
            // Wrap around
            if (obj.y > window.innerHeight + obj.size) {
                obj.y = -obj.size;
                obj.x = Math.random() * window.innerWidth;
            }

            // Store base position for parallax calc
            if (!obj.baseX) obj.baseX = obj.x;
            if (!obj.baseY) obj.baseY = obj.y;
        });
    },

    draw(ctx) {
        const px = (game.mouseX - window.innerWidth / 2) * 0.05;
        const py = (game.mouseY - window.innerHeight / 2) * 0.05;

        this.layers.forEach(obj => {
            let drawX = obj.x + px * (obj.speed * 0.1); // Parallax factor
            let drawY = obj.y + py * (obj.speed * 0.1);

            ctx.fillStyle = obj.color;
            
            if (obj.type === 'star') {
                ctx.fillRect(drawX, drawY, obj.size, obj.size);
            } else if (obj.type === 'nebula') {
                ctx.beginPath();
                ctx.arc(drawX, drawY, obj.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (obj.type === 'planet') {
                ctx.beginPath();
                ctx.arc(drawX, drawY, obj.size, 0, Math.PI * 2);
                ctx.fill();
                // Simple shading
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath();
                ctx.arc(drawX - obj.size*0.3, drawY - obj.size*0.3, obj.size*0.8, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
};
