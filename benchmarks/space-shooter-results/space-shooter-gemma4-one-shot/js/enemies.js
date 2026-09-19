class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // small, medium, baby
        this.hp = type === 'small' ? 1 : type === 'medium' ? 3 : 0.5;
        this.size = CONFIG.ENEMY_SIZES[type.toUpperCase()];
        this.color = CONFIG.COLORS[`ENEMY_${type.toUpperCase()}`];
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = Math.random() * 2 + 1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
    }
    draw(ctx, hitFlash) {
        ctx.fillStyle = hitFlash ? '#FFF' : this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        // Pixel art detail
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(this.x - this.size / 4, this.y - this.size / 4, this.size / 2, this.size / 2);
    }
}

class Boss {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.type = 'boss';
        this.hp = 50;
        this.maxHp = 50;
        this.size = CONFIG.ENEMY_SIZES.BOSS;
        this.color = CONFIG.COLORS.ENEMY_BOSS;
        this.vx = 2;
        this.vy = 0.5;
        this.phase = 0;
    }
    update() {
        this.x += this.vx;
        if (this.x > window.innerWidth - 100 || this.x < 100) this.vx *= -1;
        this.y += this.vy;
        if (this.y > 200) this.vy = 0;
    }
    draw(ctx, hitFlash) {
        ctx.fillStyle = hitFlash ? '#FFF' : this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        // Core detail
        ctx.fillStyle = '#000';
        ctx.fillRect(this.x - 20, this.y - 20, 40, 40);
    }
}