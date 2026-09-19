/**
 * ui.js
 * HUD, Menus, and Text Rendering.
 */

const UI = (() => {
    let score = 0;
    let combo = 0;
    let comboTimer = 0;
    let gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAMEOVER
    let level = 1;

    function init() {
        // Reset stats
        score = 0;
        combo = 0;
        level = 1;
    }

    function update() {
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer === 0) combo = 0;
        }
    }

    function draw(ctx, width, height) {
        ctx.font = "20px monospace";
        ctx.textAlign = "left";

        if (gameState === 'MENU') {
            drawMenuScreen(ctx, width, height);
        } else if (gameState === 'PLAYING' || gameState === 'PAUSED') {
            drawHUD(ctx, width, height);
        } else if (gameState === 'GAMEOVER') {
            drawGameOverScreen(ctx, width, height);
        }
    }

    function drawMenuScreen(ctx, w, h) {
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = "center";
        
        // Title
        ctx.font = "bold 60px monospace";
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4ECDC4';
        ctx.fillText("OCTOPUS INVADERS", w/2, h/2 - 50);
        
        // Subtitle
        ctx.shadowBlur = 0;
        ctx.font = "20px monospace";
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText("CLICK TO START", w/2, h/2 + 20);

        // Preview Enemies
        const types = ['small', 'medium', 'baby', 'boss'];
        const colors = ['#FF007F', '#00FFFF', '#00FF00', '#9D00FF'];
        let startX = w/2 - 150;
        
        types.forEach((type, i) => {
            ctx.fillStyle = colors[i];
            // Simple box representation for menu preview
            ctx.fillRect(startX + (i*80), h/2 + 60, 40, 40);
            ctx.fillStyle = '#FFF';
            ctx.font = "12px monospace";
            ctx.fillText(type.toUpperCase(), startX + (i*80) + 20, h/2 + 120);
        });
    }

    function drawHUD(ctx, w, h) {
        // Score
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${score}`, 20, 40);

        // Level
        ctx.textAlign = "center";
        ctx.fillText(`LEVEL ${level}`, w/2, 40);

        // Combo
        ctx.textAlign = "right";
        ctx.fillStyle = combo > 1 ? '#FFD700' : '#FFFFFF';
        ctx.fillText(`COMBO x${combo}`, w - 20, 40);

        // Health Bar
        const ship = Player.getShip();
        const barWidth = 200;
        const barHeight = 10;
        const barX = (w - barWidth) / 2;
        const barY = h - 30;

        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        ctx.fillStyle = ship.hp > 30 ? '#00FF00' : '#FF0000';
        ctx.fillRect(barX, barY, barWidth * (ship.hp / ship.maxHp), barHeight);
        
        ctx.fillStyle = '#FFF';
        ctx.textAlign = "center";
        ctx.fillText("SHIELD INTEGRITY", w/2, barY - 10);
    }

    function drawGameOverScreen(ctx, w, h) {
        ctx.fillStyle = '#FF0000';
        ctx.textAlign = "center";
        ctx.font = "bold 50px monospace";
        ctx.fillText("GAME OVER", w/2, h/2 - 50);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = "20px monospace";
        ctx.fillText(`FINAL SCORE: ${score}`, w/2, h/2 + 10);
        ctx.fillText(`LEVEL REACHED: ${level}`, w/2, h/2 + 40);
        
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText("CLICK TO RESTART", w/2, h/2 + 90);
    }

    function addScore(amount) {
        score += amount * (1 + (combo * 0.1));
        combo++;
        comboTimer = 120; // 2 seconds to keep combo
    }

    function setGameState(state) { gameState = state; }
    function getGameState() { return gameState; }
    function setLevel(l) { level = l; }
    function getLevel() { return level; }

    return { init, update, draw, addScore, setGameState, getGameState, setLevel, getLevel };
})();
