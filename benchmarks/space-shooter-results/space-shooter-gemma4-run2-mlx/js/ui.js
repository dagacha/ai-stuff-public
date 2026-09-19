class UI {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.gameOver = false;
    }

    addScore(pts) {
        this.score += pts;
    }

    draw(ctx) {
        ctx.font = '20px monospace';
        ctx.fillStyle = CONFIG.COLORS.text;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${this.score}`, 20, 40);
        ctx.fillText(`LEVEL: ${this.level}`, 20, 70);

        if (this.gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = '50px monospace';
            ctx.fillText('GAME OVER', window.innerWidth / 2, window.innerHeight / 2);
            ctx.font = '20px monospace';
            ctx.fillText('CLICK TO RESTART', window.innerWidth / 2, window.innerHeight / 2 + 50);
        }
    }
}

const ui = new UI();