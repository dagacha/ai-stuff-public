class UI {
    constructor() {
        this.score = 0;
        this.lives = 3;
        this.gameOver = false;
        this.gameStarted = false;
        this.level = 1;
    }

    draw(ctx) {
        if (!this.gameStarted) {
            this.drawStartScreen(ctx);
            return;
        }

        if (this.gameOver) {
            this.drawGameOver(ctx);
            return;
        }

        // HUD
        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${this.score}`, 20, 40);
        ctx.fillText(`LEVEL: ${this.level}`, 20, 70);
        ctx.fillText(`LIVES: ${this.lives}`, 20, 100);

        // Weapon tier indicator
        ctx.fillText(`WEAPON: T${player.weaponTier}`, 20, 130);

        // Unleash indicator
        if (player.unleashTimer > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`UNLEASH: ${Math.ceil(player.unleashTimer / 60)}s`, 20, 160);
        }
    }

    drawStartScreen(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        ctx.fillStyle = '#4ECDC4';
        ctx.textAlign = 'center';
        ctx.font = 'bold 60px monospace';
        ctx.fillText('OCTOPUS INVADERS', window.innerWidth / 2, window.innerHeight / 2 - 50);

        ctx.font = '24px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Click to Start', window.innerWidth / 2, window.innerHeight / 2 + 50);

        ctx.font = '16px monospace';
        ctx.fillText('Mouse to move • Click to shoot', window.innerWidth / 2, window.innerHeight / 2 + 100);
    }

    drawGameOver(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        ctx.fillStyle = '#FF6B6B';
        ctx.textAlign = 'center';
        ctx.font = 'bold 60px monospace';
        ctx.fillText('GAME OVER', window.innerWidth / 2, window.innerHeight / 2 - 50);

        ctx.font = '30px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`Final Score: ${this.score}`, window.innerWidth / 2, window.innerHeight / 2 + 20);

        ctx.font = '20px monospace';
        ctx.fillText('Click to Restart', window.innerWidth / 2, window.innerHeight / 2 + 80);
    }
}

const ui = new UI();
