class Player {
    constructor() {
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight - 100;
        this.r = CONFIG.PLAYER.size / 2;
        this.lastShot = 0;
    }

    update(mouseX) {
        this.x += (mouseX - this.x) * CONFIG.PLAYER.speed;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // F-117 Style Stealth Shape
        ctx.fillStyle = CONFIG.COLORS.player;
        ctx.shadowBlur = 15;
        ctx.shadowColor = CONFIG.COLORS.playerGlow;
        
        // Main Body (Triangle/Polygon)
        ctx.beginPath();
        ctx.moveTo(0, -this.r);
        ctx.lineTo(this.r, this.r);
        ctx.lineTo(-this.r, this.r);
        ctx.closePath();
        ctx.fill();

        // Cyan Glow Wing Edges
        ctx.strokeStyle = CONFIG.COLORS.playerGlow;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot > CONFIG.PLAYER.fireRate) {
            this.lastShot = now;
            audio.playShoot();
            return true;
        }
        return false;
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 4;
        this.vy = -10;
    }
    update() { this.y += this.vy; }
    draw(ctx) {
        ctx.fillStyle = CONFIG.COLORS.playerGlow;
        ctx.fillRect(this.x - 2, this.y - 5, 4, 10);
    }
}

class BulletManager {
    constructor() {
        this.bullets = [];
    }
    update() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update();
            if (this.bullets[i].y < -20) this.bullets.splice(i, 1);
        }
    }
    draw(ctx) {
        this.bullets.forEach(b => b.draw(ctx));
    }
}

const player = new Player();
const bulletManager = new BulletManager();