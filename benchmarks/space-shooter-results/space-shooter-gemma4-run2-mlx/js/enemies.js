class Enemy {
    constructor(x, y, type, level) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.level = level;
        this.hp = type.hp;
        this.r = type.size / 2;
        this.color = type.color;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = type.speed;
        this.flash = 0;
        this.sinOffset = Math.random() * Math.PI * 2;
    }

    update() {
        if (this.type === CONFIG.ENEMY_TYPES.SMALL) {
            this.x += Math.sin(Date.now() * 0.005 + this.sinOffset) * 2;
        }
        this.y += this.vy;
        if (this.flash > 0) this.flash--;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        const drawColor = this.flash > 0 ? '#ffffff' : this.color;
        ctx.fillStyle = drawColor;

        // Pixel Art Octopus Grid Rendering
        const s = this.r;
        const grid = 4; 
        const step = (s * 2) / grid;

        // Body
        ctx.fillRect(-s/2, -s/2, s, s);
        // Tentacles (simulated with grid rectangles)
        for(let i=0; i<4; i++) {
            const angle = (i * Math.PI/2);
            ctx.fillRect(Math.cos(angle)*s/2, Math.sin(angle)*s/2, step, step);
        }
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(-s/4, -s/4, 4, 4);
        ctx.fillRect(s/4 - 4, -s/4, 4, 4);

        ctx.restore();
    }

    takeDamage(dmg) {
        this.hp -= dmg;
        this.flash = 3;
        audio.playHit();
        return this.hp <= 0;
    }
}

class EnemyManager {
    constructor() {
        this.enemies = [];
    }

    spawn(level) {
        const chance = Math.random();
        let type = CONFIG.ENEMY_TYPES.SMALL;
        
        if (level % 5 === 0 && this.enemies.filter(e => e.type === CONFIG.ENEMY_TYPES.BOSS).length === 0) {
            type = CONFIG.ENEMY_TYPES.BOSS;
        } else if (chance > 0.7) {
            type = CONFIG.ENEMY_TYPES.MEDIUM;
        } else if (chance > 0.5) {
            type = CONFIG.ENEMY_TYPES.BABY;
        }

        const x = Math.random() * (window.innerWidth - 100) + 50;
        this.enemies.push(new Enemy(x, -50, type, level));
    }

    update() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update();
            if (this.enemies[i].y > window.innerHeight + 100) {
                this.enemies.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        this.enemies.forEach(e => e.draw(ctx));
    }
}

const enemyManager = new EnemyManager();