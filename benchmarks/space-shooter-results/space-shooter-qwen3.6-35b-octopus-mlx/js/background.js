/* js/background.js */
const Background = (() => {
    let layers = [];
    let offset = 0;

    const init = (width, height) => {
        layers = [
            { speed: 0.2, count: 50, size: 2, color: '#111122' },
            { speed: 0.5, count: 30, size: 3, color: '#222244' },
            { speed: 1.0, count: 20, size: 4, color: '#333366' },
            { speed: 2.0, count: 10, size: 5, color: '#444488' }
        ];
        // Initialize random positions
        layers.forEach(l => {
            l.stars = [];
            for(let i=0; i<l.count; i++) {
                l.stars.push({
                    x: Math.random() * width,
                    y: Math.random() * height
                });
            }
        });
    };

    const update = (width, height) => {
        offset += 2; // Base scroll speed
        
        layers.forEach(layer => {
            layer.stars.forEach(star => {
                star.y += layer.speed * 2;
                if (star.y > height) {
                    star.y = 0;
                    star.x = Math.random() * width;
                }
            });
        });
    };

    const draw = (ctx, width, height) => {
        ctx.fillStyle = CONFIG.colors.bg;
        ctx.fillRect(0, 0, width, height);

        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            layer.stars.forEach(star => {
                ctx.fillRect(star.x, star.y, layer.size, layer.size);
            });
        });
    };

    return { init, update, draw };
})();
