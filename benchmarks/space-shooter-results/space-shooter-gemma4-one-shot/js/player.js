class Player {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.x = width / 2;
        this.y = height - 100;
        this.targetX = width / 2;
        this.targetY = height - 100;
        this.tier = 1;
        this.size = CONFIG.PLAYER.SIZE;
        this.bullets = [];
        this.lastShot = 0;
        this.shootDelay = 250;
    }
    update(mouseX, mouseY, particles) {
        this.targetX = mouseX;
        this.targetY = mouseY;
        this.x += (this.targetX - this.x) * CONFIG.PLAYER.LERP;
        this.y += (this.targetY - this.y) * CONFIG.PLAYER.LERP;

        if (this.bullets.length > 0) {
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                this.bullets[i].y -= this.bullets[i].speed;
                particles.spawnBulletTrail(this.bullets[i].x, this.bullets[i].y, CONFIG.COLORS.BULLET);
                if (this.bullets[i].y < -20) this.bullets.splice(i, 1);
            }
        }
    }
    shoot() {
        const now = Date.now();
        if (now - this.lastShot < this.shootDelay) return null;
        this.lastShot = now;

        const b = { x: this.x, y: this.y, speed: 10 };
        if (this.tier === 1) {
            this.bullets.push({ ...b, x: this.x - 5, y: this.y, speed: 10 });
            this.bullets.push({ ...b, x: this.x + 5, y: this.y, speed: 10 });
        } else if (this.tier === 2) {
            this.bullets.push({ ...b, x: this.x, y: this.y, speed: 12 });
            this.bullets.push({ ...b, x: this.x - 15, y: this.y, speed: 10 });
            this.bullets.push({ ...b, x: this.x + 15, y: this.y, speed: 10 });
        } else {
            this.bullets.push({ ...b, x: this.x, y: this.y, speed: 14 });
            this.bullets.push({ ...b, x: this.x - 20, y: this.y, speed: 12 });
            this.bullets.push({ ...b, x: this.x + 20, y: this.y, speed: 12 });
            this.bullets.push({ ...b, x: this.x - 35, y: this.y, speed: 10 });
            this.bullets.push({ ...b, x: this.x + 35, y: this.y, speed: 10 });
        }
        AudioEngine.playLaser();
        return b;
    }
    draw(ctx, particles) {
        particles.spawnEngineTrail(this.x, this.y + this.size / 2);
        ctx.fillStyle = CONFIG.COLORS.PLAYER;
        // Ship shape
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - this.size / 2);
        ctx.lineTo(this.x - this.size / 2, this.y + this.size / 2);
        ctx.lineTo(this.x + this.size / 2, this.y + this.size / 2);
        ctx.closePath();
        ctx.fill();
        // Core
        ctx.fillStyle = CONFIG.COLORS.PLAYER_CORE;
        ctx.fillRect(this.x - 2, this.y, 4, 10);

        this.bullets.forEach(b => {
            ctx.fillStyle = CONFIG.COLORS.BULLET;
            ctx.fillRect(b.x - 2, b.y - 5, 4, 10);
        });
    }
}