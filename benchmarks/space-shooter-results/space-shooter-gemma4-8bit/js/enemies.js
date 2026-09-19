class Enemy {
    constructor(type, x, y) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.size = CONFIG.enemySizes[type];
        this.hp = type === 'boss' ? 50 : type === 'medium' ? 3 : 1;
        this.maxHp = this.hp;
        this.speed = type === 'baby' ? 3 : type === 'boss' ? 0.5 : type === 'medium' ? 1.5 : 2;
        this.angle = 0;
        this.inkCooldown = 0;
        this.tentaclePhase = 0;
    }

    update(playerX) {
        this.y += this.speed;
        this.tentaclePhase += 0.1;

        // Sine wave for small enemies
        if (this.type === 'small') {
            this.x += Math.sin(this.y * 0.02) * 2;
        }

        // Boss tracks player
        if (this.type === 'boss') {
            this.x += (playerX - this.x) * 0.02;
        }

        // Medium shoots ink
        if (this.type === 'medium' && this.inkCooldown <= 0) {
            if (Math.random() < 0.01) {
                this.inkCooldown = 60;
                return new InkBlob(this.x, this.y + this.size/2);
            }
        }
        if (this.inkCooldown > 0) this.inkCooldown--;

        return null;
    }

    draw(ctx) {
        const size = this.size;
        const half = size / 2;

        ctx.save();
        ctx.translate(this.x, this.y);

        // Flash when hit
        if (this.hitFlash > 0) {
            ctx.fillStyle = '#FFFFFF';
            this.hitFlash--;
        } else {
            ctx.fillStyle = CONFIG.colors['enemy' + this.type.charAt(0).toUpperCase() + this.type.slice(1)];
        }

        // Pixel art octopus body
        const gridSize = 8;
        const cellSize = size / gridSize;

        // Body (center 4x4)
        for (let row = 2; row < 6; row++) {
            for (let col = 2; col < 6; col++) {
                ctx.fillRect(
                    (col - gridSize/2) * cellSize,
                    (row - gridSize/2) * cellSize,
                    cellSize - 1,
                    cellSize - 1
                );
            }
        }

        // Tentacles (animated)
        const tentacleCount = this.type === 'boss' ? 8 : this.type === 'medium' ? 4 : 2;
        for (let i = 0; i < tentacleCount; i++) {
            const angle = (Math.PI * 2 * i) / tentacleCount + this.tentaclePhase * 0.1;
            const len = half + Math.sin(this.tentaclePhase + i) * 5;
            const tx = Math.cos(angle) * len;
            const ty = Math.sin(angle) * len;

            ctx.fillRect(tx - cellSize/2, ty - cellSize/2, cellSize, cellSize);
        }

        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(-cellSize, -cellSize/2, cellSize, cellSize);
        ctx.fillRect(cellSize/2, -cellSize/2, cellSize, cellSize);

        // Health bar for boss/medium
        if (this.type === 'boss' || this.type === 'medium') {
            const barWidth = size;
            const barHeight = 4;
            ctx.fillStyle = '#333';
            ctx.fillRect(-barWidth/2, -half - 10, barWidth, barHeight);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(-barWidth/2, -half - 10, barWidth * (this.hp / this.maxHp), barHeight);
        }

        ctx.restore();
    }

    takeDamage(dmg) {
        this.hp -= dmg;
        this.hitFlash = 3;
        audio.playHit();
        return this.hp <= 0;
    }

    getRadius() {
        return this.size / 2;
    }
}

class InkBlob {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vy = 4;
        this.radius = 8;
    }

    update() {
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.fillStyle = CONFIG.colors.ink;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

class EnemyManager {
    constructor() {
        this.enemies = [];
        this.inkBlobs = [];
        this.waveTimer = 0;
        this.level = 1;
    }

    spawnWave() {
        const count = 3 + Math.floor(this.level / 2);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * (window.innerWidth - 100) + 50;
            const type = Math.random() < 0.7 ? 'small' : 'medium';
            this.enemies.push(new Enemy(type, x, -50 - i * 40));
        }
    }

    spawnBoss() {
        const x = window.innerWidth / 2;
        this.enemies.push(new Enemy('boss', x, -100));
    }

    update(playerX) {
        // Wave spawning
        this.waveTimer++;
        if (this.waveTimer > 180 - this.level * 5) {
            this.waveTimer = 0;
            if (this.level % 5 === 0 && this.enemies.filter(e => e.type === 'boss').length === 0) {
                this.spawnBoss();
            } else {
                this.spawnWave();
            }
        }

        // Update enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const ink = this.enemies[i].update(playerX);
            if (ink) this.inkBlobs.push(ink);

            if (this.enemies[i].y > window.innerHeight + 100) {
                this.enemies.splice(i, 1);
            }
        }

        // Update ink blobs
        for (let i = this.inkBlobs.length - 1; i >= 0; i--) {
            this.inkBlobs[i].update();
            if (this.inkBlobs[i].y > window.innerHeight) {
                this.inkBlobs.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const enemy of this.enemies) enemy.draw(ctx);
        for (const ink of this.inkBlobs) ink.draw(ctx);
    }
}

const enemyManager = new EnemyManager();
