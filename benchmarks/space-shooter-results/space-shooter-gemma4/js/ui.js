/** @file ui.js - HUD and Screens */

export class UIManager {
    constructor(ctx, canvas) {
        this.ctx = ctx;
        this.canvas = canvas;
    }

    drawHUD(score, level, combo, health, unleashActive) {
        this.ctx.font = '20px monospace';
        this.ctx.fillStyle = '#FFFFFF';
        
        // Score
        this.ctx.fillText(`SCORE: ${score}`, 20, 40);
        // Level
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`LEVEL ${level}`, this.canvas.width / 2, 40);
        // Combo
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`COMBO: x${combo}`, this.canvas.width - 20, 40);
        
        // Health Bar
        this.ctx.textAlign = 'center';
        const barW = 200;
        const barH = 15;
        const barX = this.canvas.width / 2 - barW / 2;
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(barX, this.canvas.height - 40, barW, barH);
        this.ctx.fillStyle = health > 30 ? '#00FF00' : '#FF0000';
        this.ctx.fillRect(barX, this.canvas.height - 40, (health / 100) * barW, barH);
    }

    drawStartScreen() {
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = 'center';
        this.ctx.font = '50px monospace';
        this.ctx.fillStyle = '#4ECDC4';
        this.ctx.fillText('OCTOPUS INVADERS', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '20px monospace';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText('CLICK TO START', this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawGameOver(score, level) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = 'center';
        this.ctx.font = '50px monospace';
        this.ctx.fillStyle = '#FF007F';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '25px monospace';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(`FINAL SCORE: ${score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText(`LEVEL REACHED: ${level}`, this.canvas.width / 2, this.canvas.height / 2 + 40);
        this.ctx.fillText('CLICK TO RESTART', this.canvas.width / 2, this.canvas.height / 2 + 100);
    }
}