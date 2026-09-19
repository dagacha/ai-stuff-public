class Player {
    constructor() {
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight - 100;
        this.targetX = this.x;
        this.targetY = this.y;
        this.weaponTier = 1;
        this.bullets = [];
        this.shootCooldown = 0;
        this.radius = 20;
        this.unleashTimer = 0;
    }

    update(mouseX, mouseY) {
        // Smooth lerp movement
        this.targetX = mouseX;
        this.targetY = Math.min(mouseY, window.innerHeight - 50);

        this.x += (this.targetX - this.x) * 0.35;
        this.y += (this.targetY - this.y) * 0.35;

        // Shooting
        if (this.shootCooldown > 0) this.shootCooldown--;

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].update();
            if (this.bullets[i].y < -20) {
                this.bullets.splice(i, 1);
            }
        }

        // Unleash mode
        if (this.unleashTimer > 0) {
            this.unleashTimer--;
        }

        // Engine trail particles
        particles.spawnTrail(this.x, this.y + 20, '#FF6B35');
    }

    shoot() {
        if (this.shootCooldown > 0) return;

        const speed = CONFIG.speeds['bulletTier' + this.weaponTier];
        audio.playShoot();

        if (this.unleashTimer > 0) {
            // Unleash mode - massive spread
            for (let i = -3; i <= 3; i++) {
                this.bullets.push(new Bullet(this.x + i * 15, this.y - 20, i * 2, -speed, true));
            }
            this.shootCooldown = 5;
        } else {
            // Normal shooting
            if (this.weaponTier === 1) {
                this.bullets.push(new Bullet(this.x, this.y - 20, 0, -speed, false));
            } else if (this.weaponTier === 2) {
                this.bullets.push(new Bullet(this.x - 10, this.y - 20, 0, -speed, false));
                this.bullets.push(new Bullet(this.x + 10, this.y - 20, 0, -speed, false));
            } else if (this.weaponTier === 3) {
                this.bullets.push(new Bullet(this.x, this.y - 20, 0, -speed, false));
                this.bullets.push(new Bullet(this.x - 15, this.y - 15, -1, -speed, false));
                this.bullets.push(new Bullet(this.x + 15, this.y - 15, 1, -speed, false));
            } else {
                this.bullets.push(new Bullet(this.x, this.y - 20, 0, -speed, false));
                this.bullets.push(new Bullet(this.x - 20, this.y - 15, -2, -speed, false));
                this.bullets.push(new Bullet(this.x + 20, this.y - 15, 2, -speed, false));
                this.bullets.push(new Bullet(this.x - 10, this.y - 25, -1, -speed, false));
                this.bullets.push(new Bullet(this.x + 10, this.y - 25, 1, -speed, false));
            }
            this.shootCooldown = 10 - this.weaponTier;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Unleash glow
        if (this.unleashTimer > 0) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#FFFFFF';
        } else {
            ctx.shadowBlur = 15;
            ctx.shadowColor = CONFIG.colors.player;
        }

        // F-117 style ship body
        ctx.fillStyle = this.unleashTimer > 0 ? '#FFFFFF' : CONFIG.colors.playerBody;

        // Main fuselage
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(15, 10);
        ctx.lineTo(0, 20);
        ctx.lineTo(-15, 10);
        ctx.closePath();
        ctx.fill();

        // Wings
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(25, 15);
        ctx.lineTo(15, 20);
        ctx.lineTo(0, 5);
        ctx.lineTo(-15, 20);
        ctx.lineTo(-25, 15);
        ctx.closePath();
        ctx.fill();

        // Cyan edge glow
        ctx.strokeStyle = CONFIG.colors.player;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Thrusters
        ctx.fillStyle = '#FF6B35';
        ctx.fillRect(-8, 18, 4, 8);
        ctx.fillRect(4, 18, 4, 8);

        ctx.restore();

        // Draw bullets
        for (const bullet of this.bullets) {
            bullet.draw(ctx);
        }
    }

    upgradeWeapon() {
        if (this.weaponTier < 4) {
            this.weaponTier++;
        }
    }

    activateUnleash() {
        this.unleashTimer = 300; // 5 seconds at 60fps
    }

    getRadius() {
        return this.radius;
    }
}

class Bullet {
    constructor(x, y, vx, vy, isUnleash) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.isUnleash = isUnleash;
        this.radius = isUnleash ? 6 : 4;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Trail particles
        if (Math.random() < 0.3) {
            particles.spawnTrail(this.x, this.y, this.isUnleash ? '#FFFFFF' : CONFIG.colors.bullet);
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.isUnleash ? '#FFFFFF' : CONFIG.colors.bullet;
        ctx.shadowBlur = this.isUnleash ? 10 : 5;
        ctx.shadowColor = this.isUnleash ? '#FFFFFF' : CONFIG.colors.player;
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        ctx.shadowBlur = 0;
    }
}

const player = new Player();
