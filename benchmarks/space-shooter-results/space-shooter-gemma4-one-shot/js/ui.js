class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }
    drawHUD(score, tier, unleash) {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '20px monospace';
        this.ctx.fillText(`SCORE: ${score}`, 20, 40);
        this.ctx.fillText(`TIER: ${tier}`, 20, 70);
        
        // Unleash Meter
        this.ctx.strokeStyle = '#FFF';
        this.ctx.strokeRect(20, 90, 100, 10);
        this.ctx.fillStyle = CONFIG.COLORS.UNLEASH;
        this.ctx.fillRect(20, 90, unleash * 100, 10);
    }
    drawMenu() {
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '50px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('NEBULA STRIKE', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '20px monospace';
        this.ctx.fillText('CLICK TO START', this.canvas.width / 2, this.canvas.height / 2 + 20);
    }
    drawGameOver(score) {
        this.ctx.fillStyle = 'rgba(255,0,0,0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '50px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '20px monospace';
        this.ctx.fillText(`FINAL SCORE: ${score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText('CLICK TO RESTART', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
    drawPause() {
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '40px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
    }
}