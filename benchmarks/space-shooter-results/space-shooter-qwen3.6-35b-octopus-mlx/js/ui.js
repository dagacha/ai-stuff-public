/* js/ui.js */
const UI = (() => {
    const draw = (ctx, width, height) => {
        // HUD
        ctx.fillStyle = CONFIG.colors.text;
        ctx.font = '20px monospace';
        ctx.textAlign = 'left';
        
        // Score
        ctx.fillText(`SCORE: ${Game.score}`, 20, 40);
        
        // Level
        ctx.fillText(`LEVEL: ${Game.level}`, 20, 70);

        // Unleash Timer
        if (Game.unleashMode) {
            ctx.fillStyle = '#ffff00';
            ctx.fillText(`UNLEASH: ${Math.ceil(Game.unleashTimer / 60)}s`, 20, 100);
        }

        // Screens
        if (Game.state === 'START') {
            drawCenterScreen(ctx, width, height, "OCTOPUS INVADERS", "CLICK TO START", "MOUSE to Move | CLICK to Fire");
        } else if (Game.state === 'GAMEOVER') {
            drawCenterScreen(ctx, width, height, "GAME OVER", `FINAL SCORE: ${Game.score}`, "CLICK TO RESTART");
        } else if (Game.state === 'PAUSED') {
            drawCenterScreen(ctx, width, height, "PAUSED", "", "PRESS ESC TO RESUME");
        }
    };

    const drawCenterScreen = (ctx, w, h, title, sub, info) => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = CONFIG.colors.textHighlight;
        ctx.font = '40px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(title, w/2, h/2 - 40);

        ctx.fillStyle = CONFIG.colors.text;
        ctx.font = '20px monospace';
        ctx.fillText(sub, w/2, h/2 + 10);

        ctx.font = '16px monospace';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(info, w/2, h/2 + 50);
    };

    return { draw };
})();
