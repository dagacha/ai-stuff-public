/**
 * ui.js
 * HUD rendering, start/gameover screens, score display, health bar, combo counter.
 */

import CONFIG from './config.js';

class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = 'menu'; // menu, playing, paused, gameover
        this.score = 0;
        this.level = 1;
        this.combo = 0;
        this.maxCombo = 0;
        this.enemiesKilled = 0;
        this.font = CONFIG.HUD_FONT;
    }

    update(state, score, level, combo, maxCombo, enemiesKilled) {
        this.state = state;
        this.score = score;
        this.level = level;
        this.combo = combo;
        this.maxCombo = maxCombo;
        this.enemiesKilled = enemiesKilled;
    }

    drawHUD(player) {
        const ctx = this.ctx;
        ctx.font = this.font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'top';

        // Score
        ctx.fillText(`SCORE: ${this.score}`, CONFIG.HUD_PADDING, CONFIG.HUD_Y);
        // Level
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${this.level}`, this.canvas.width / 2, CONFIG.HUD_Y);
        // Combo
        ctx.textAlign = 'right';
        ctx.fillText(`COMBO: ${this.combo}x`, this.canvas.width - CONFIG.HUD_PADDING, CONFIG.HUD_Y);

        // Health bar
        ctx.textAlign = 'left';
        const barX = (this.canvas.width - CONFIG.HEALTH_BAR_WIDTH) / 2;
        const barY = this.canvas.height - CONFIG.HEALTH_BAR_Y_OFFSET;
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, CONFIG.HEALTH_BAR_WIDTH, CONFIG.HEALTH_BAR_HEIGHT);
        const healthPct = player.health / player.maxHealth;
        ctx.fillStyle = healthPct > 0.5 ? '#39FF14' : healthPct > 0.25 ? '#FFD700' : '#FF0000';
        ctx.fillRect(barX, barY, CONFIG.HEALTH_BAR_WIDTH * healthPct, CONFIG.HEALTH_BAR_HEIGHT);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, CONFIG.HEALTH_BAR_WIDTH, CONFIG.HEALTH_BAR_HEIGHT);

        // Unleash indicator
        if (player.unleashTimer > 0) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('UNLEASH MODE', this.canvas.width / 2, CONFIG.HUD_Y + 30);
        }
    }

    drawMenu() {
        const ctx = this.ctx;
        ctx.fillStyle = '#0D1117';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Title
        ctx.font = 'bold 60px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4ECDC4';
        ctx.shadowColor = '#4ECDC4';
        ctx.shadowBlur = 20;
        ctx.fillText('OCTOPUS INVADERS', this.canvas.width / 2, this.canvas.height / 3);
        ctx.shadowBlur = 0;

        // Preview enemies
        const previewY = this.canvas.height / 2;
        const types = ['small', 'medium', 'baby', 'boss'];
        const colors = ['#FF69B4', '#00BFFF', '#00FFFF', '#9400D3'];
        const sizes = [36, 48, 20, 150];
        for (let i = 0; i < 4; i++) {
            const x = this.canvas.width/2 - 150 + i * 100;
            ctx.fillStyle = colors[i];
            ctx.fillRect(x - sizes[i]/2, previewY - sizes[i]/2, sizes[i], sizes[i]);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '16px monospace';
            ctx.fillText(types[i], x, previewY + sizes[i]/2 + 20);
        }

        // Click prompt
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px monospace';
        const pulse = Math.sin(Date.now() * 0.005) * 0.5 + 0.5;
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.fillText('CLICK TO START', this.canvas.width / 2, this.canvas.height * 0.8);
        ctx.globalAlpha = 1;
    }

    drawGameOver() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF0000';
        ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 3);

        ctx.font = '24px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`FINAL SCORE: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        ctx.fillText(`LEVEL REACHED: ${this.level}`, this.canvas.width / 2, this.canvas.height / 2 + 40);
        ctx.fillText(`ENEMIES KILLED: ${this.enemiesKilled}`, this.canvas.width / 2, this.canvas.height / 2 + 80);
        ctx.fillText(`MAX COMBO: ${this.maxCombo}x`, this.canvas.width / 2, this.canvas.height / 2 + 120);

        ctx.fillStyle = '#4ECDC4';
        ctx.font = '20px monospace';
        ctx.fillText('CLICK TO RESTART', this.canvas.width / 2, this.canvas.height * 0.8);
    }

    drawPause() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(13, 17, 23, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        ctx.font = '20px monospace';
        ctx.fillText('PRESS ESC TO RESUME', this.canvas.width / 2, this.canvas.height / 2 + 40);
    }
}

export default UI;