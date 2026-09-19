/**
 * ui.js
 * Handles HUD, Menus, and Game Over screens.
 */
const UI = {
    draw(ctx) {
        ctx.font = '20px monospace';
        ctx.fillStyle = CONFIG.colors.text;
        ctx.textBaseline = 'top';

        // HUD
        if (game.state === 'playing') {
            // Score
            ctx.fillText(`SCORE: ${Player.score}`, 20, 40);
            
            // Level
            ctx.textAlign = 'center';
            ctx.fillText(`LEVEL: ${game.level}`, window.innerWidth / 2, 40);
            
            // Combo
            ctx.textAlign = 'right';
            ctx.fillText(`COMBO: x${Player.combo}`, window.innerWidth - 20, 40);

            // Health Bar
            ctx.textAlign = 'left';
            const barWidth = 200;
            const barHeight = 10;
            const barX = (window.innerWidth / 2) - (barWidth / 2);
            const barY = window.innerHeight - 30;
            
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = Player.health > 30 ? '#00FF00' : '#FF0000';
            ctx.fillRect(barX, barY, barWidth * (Player.health / CONFIG.ship.maxHealth), barHeight);
        }

        // Menus
        if (game.state === 'menu') {
            this.drawCenteredScreen(ctx, 'OCTOPUS INVADERS', 'CLICK TO START', true);
        } else if (game.state === 'gameover') {
            this.drawCenteredScreen(ctx, 'GAME OVER', `FINAL SCORE: ${Player.score}\nCLICK TO RESTART`, false);
        } else if (game.state === 'paused') {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
            ctx.fillStyle = '#FFF';
            ctx.font = '40px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', window.innerWidth/2, window.innerHeight/2);
        }
    },

    drawCenteredScreen(ctx, title, subtitle, isTitle) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#00FFFF';
        ctx.font = isTitle ? '60px monospace' : '40px monospace';
        
        // Pulsing effect
        const pulse = Math.sin(Date.now() / 200) * 10;
        ctx.shadowBlur = 10 + pulse;
        ctx.shadowColor = '#00FFFF';
        
        ctx.fillText(title, window.innerWidth/2, window.innerHeight/2 - 50);
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFF';
        ctx.font = '20px monospace';
        const lines = subtitle.split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, window.innerWidth/2, window.innerHeight/2 + 20 + (i * 30));
        });
    }
};
