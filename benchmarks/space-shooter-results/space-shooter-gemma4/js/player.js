/** @file player.js - Ship movement, upgrades, and shooting */
import { CONFIG } from './config.js';
import { particles } from './particles.js';

export class Player {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = canvas.width / 2;
        this.y = canvas.height - 100;
        this.radius = 20;
        this.health = CONFIG.PLAYER.BASE_HEALTH;
        this.tier = 1;
        this.unleashActive = false;
        this.unleashTimer = 0;
        this.tilt = 0;
    }

    update(mouseX, mouseY) {
        // Lerp movement
        const dx = mouseX - this.x;
        this.x += dx * CONFIG.PLAYER.LERP;
        
        // Tilt animation
        this.tilt = dx * 0.05;

        // Engine particles
        particles.spawn(this.x, this.y + 15, (Math.random() - 0.5) * 2, 2, 10, '#FFD700', 3);

        if (this.unleashActive) {
            this.unleashTimer -= 16.6; // approx ms per frame
            if (this.unleashTimer <= 0) this.unleashActive = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt * Math.PI / 180);

        // Draw Pixelated Ship
        ctx.fillStyle = CONFIG.COLORS.PLAYER_BODY;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(15, 15);
        ctx.lineTo(0, 5);
        ctx.lineTo(-15, 15);
        ctx.closePath();
        ctx.fill();

        // Glow
        ctx.strokeStyle = this.unleashActive ? '#FFFFFF' : CONFIG.COLORS.PLAYER_GLOW;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Unleash Ring
        if (this.unleashActive) {
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, (this.unleashTimer / CONFIG.PLAYER.UNLEASH_DURATION) * Math.PI * 2);
            ctx.strokeStyle = '#00FF00';
            ctx.stroke();
        }

        ctx.restore();
    }
}