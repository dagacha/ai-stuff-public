// js/ui.js
/**
 * ui.js - HUD rendering, start screen, game over screen, pause screen.
 * All UI text uses 20px monospace font with proper spacing.
 */

const UI = (() => {
    let score = 0;
    let combo = 0;
    let comboTimer = 0;
    let comboMultiplier = 1;
    let enemiesKilled = 0;
    let level = 1;
    let screenFlash = 0;
    let screenFlashColor = CONFIG.COLORS.red;

    function drawHUD(ctx, w, h) {
        ctx.save();
        ctx.font = '20px monospace';
        ctx.textBaseline = 'top';

        // Score (top left)
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.textAlign = 'left';
        ctx.fillText(`SCORE: ${score}`, 20, 40);

        // Level (top center)
        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level}`, w / 2, 40);

        // Combo (top right)
        ctx.textAlign = 'right';
        if (combo > 1) {
            ctx.fillStyle = CONFIG.COLORS.yellow;
            ctx.fillText(`COMBO x${comboMultiplier}`, w - 20, 40);
        }

        // Health bar (bottom center)
        const barWidth = 200;
        const barHeight = 16;
        const barX = (w - barWidth) / 2;
        const barY = h - 40;

        // Background
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health fill
        const healthRatio = Player.getHealth() / Player.getMaxHealth();
        const healthColor = healthRatio > 0.5 ? CONFIG.COLORS.green : healthRatio > 0.25 ? CONFIG.COLORS.orange : CONFIG.COLORS.red;
        ctx.fillStyle = healthColor;
        ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);

        // Health bar border
        ctx.strokeStyle = CONFIG.COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Health text
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(Player.getHealth())}/${Player.getMaxHealth()}`, w / 2, barY + 2);

        // Unleash indicator
        if (Player.hasUnleash()) {
            const timeLeft = Math.ceil(Player.getUnleashTimer() / 60);
            ctx.font = 'bold 24px monospace';
            ctx.fillStyle = CONFIG.COLORS.white;
            ctx.textAlign = 'center';
            ctx.fillText(`⚡ UNLEASH x${timeLeft}s ⚡`, w / 2, 70);
        }

        // Screen flash
        if (screenFlash > 0) {
            ctx.globalAlpha = screenFlash / 30;
            ctx.fillStyle = screenFlashColor;
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;
            screenFlash--;
        }

        ctx.restore();
    }

    function drawStartScreen(ctx, w, h) {
        ctx.save();

        // Title with pulsing glow
        const pulse = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow effect
        ctx.shadowColor = CONFIG.COLORS.cyan;
        ctx.shadowBlur = 20 + pulse * 20;
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.fillText('OCTOPUS INVADERS', w / 2, h / 3);

        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '18px monospace';
        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.fillText('A Cyberpunk Space Shooter', w / 2, h / 3 + 50);

        // Draw preview octopi
        const previewY = h / 2 + 20;
        const previewTypes = [
            { type: 'small', color: CONFIG.COLORS.pink, label: 'GRUNT' },
            { type: 'medium', color: CONFIG.COLORS.blue, label: 'SHOOTER' },
            { type: 'baby', color: '#00FFFF', label: 'BABY' },
            { type: 'boss', color: CONFIG.COLORS.purple, label: 'BOSS' },
        ];

        const totalWidth = previewTypes.length * 100;
        const startX = (w - totalWidth) / 2 + 50;

        for (let i = 0; i < previewTypes.length; i++) {
            const p = previewTypes[i];
            const px = startX + i * 100;
            const size = p.type === 'boss' ? 40 : p.type === 'medium' ? 28 : p.type === 'small' ? 22 : 16;

            // Draw mini octopus
            const grid = p.type === 'small' ? Enemies._getGrid('small') :
                         p.type === 'medium' ? Enemies._getGrid('medium') :
                         p.type === 'baby' ? Enemies._getGrid('baby') :
                         Enemies._getGrid('boss');
            const rows = grid.length;
            const cols = grid[0].length;
            const cellW = size / cols;
            const cellH = size / rows;
            const cx = px - size / 2;
            const cy = previewY - size / 2;

            ctx.fillStyle = p.color;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (grid[r][c]) {
                        ctx.fillRect(cx + c * cellW, cy + r * cellH, cellW, cellH);
                    }
                }
            }

            // Label
            ctx.font = '10px monospace';
            ctx.fillStyle = CONFIG.COLORS.white;
            ctx.fillText(p.label, px, previewY + size / 2 + 10);
        }

        // Click to start
        const blink = Math.sin(Date.now() * 0.005) > 0;
        if (blink) {
            ctx.font = 'bold 24px monospace';
            ctx.fillStyle = CONFIG.COLORS.white;
            ctx.fillText('CLICK TO START', w / 2, h * 0.75);
        }

        // Controls
        ctx.font = '14px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Mouse to move • Click to shoot • ESC to pause', w / 2, h * 0.85);

        ctx.restore();
    }

    function drawGameOverScreen(ctx, w, h) {
        ctx.save();

        // Darken
        ctx.fillStyle = 'rgba(13, 17, 23, 0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Game Over
        ctx.font = 'bold 48px monospace';
        ctx.fillStyle = CONFIG.COLORS.red;
        ctx.shadowColor = CONFIG.COLORS.red;
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', w / 2, h / 3);
        ctx.shadowBlur = 0;

        // Stats
        ctx.font = '24px monospace';
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.fillText(`FINAL SCORE: ${score}`, w / 2, h / 2 - 40);

        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.fillText(`LEVEL REACHED: ${level}`, w / 2, h / 2);

        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText(`ENEMIES KILLED: ${enemiesKilled}`, w / 2, h / 2 + 40);

        // Restart
        const blink = Math.sin(Date.now() * 0.005) > 0;
        if (blink) {
            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = CONFIG.COLORS.white;
            ctx.fillText('CLICK TO RESTART', w / 2, h * 0.75);
        }

        ctx.restore();
    }

    function drawPauseScreen(ctx, w, h) {
        ctx.save();

        ctx.fillStyle = 'rgba(13, 17, 23, 0.6)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 40px monospace';
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText('PAUSED', w / 2, h / 2 - 20);

        ctx.font = '18px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Press ESC to resume', w / 2, h / 2 + 30);

        ctx.restore();
    }

    function drawBossWarning(ctx, w, h) {
        if (!Enemies.isBossWarning()) return;
        const timer = Enemies.getBossWarningTimer();
        const alpha = Math.min(1, timer / 30);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = CONFIG.COLORS.red;
        ctx.shadowColor = CONFIG.COLORS.red;
        ctx.shadowBlur = 15;
        ctx.fillText('⚠ BOSS APPROACHING ⚠', w / 2, h / 2);
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    function addScore(points) {
        score += points * comboMultiplier;
        combo++;
        comboTimer = CONFIG.COMBO.decayTime;
        comboMultiplier = Math.min(CONFIG.COMBO.maxMultiplier, 1 + Math.floor(combo / 5));
        enemiesKilled++;
    }

    function updateCombo() {
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer <= 0) {
                combo = 0;
                comboMultiplier = 1;
            }
        }
    }

    function resetCombo() {
        combo = 0;
        comboMultiplier = 1;
        comboTimer = 0;
    }

    function triggerScreenFlash(color, duration) {
        screenFlash = duration || 15;
        screenFlashColor = color || CONFIG.COLORS.red;
    }

    function setLevel(l) {
        level = l;
    }

    function reset() {
        score = 0;
        combo = 0;
        comboTimer = 0;
        comboMultiplier = 1;
        enemiesKilled = 0;
        level = 1;
        screenFlash = 0;
    }

    return {
        drawHUD,
        drawStartScreen,
        drawGameOverScreen,
        drawPauseScreen,
        drawBossWarning,
        addScore,
        updateCombo,
        resetCombo,
        triggerScreenFlash,
        setLevel,
        reset,
    };
})();
