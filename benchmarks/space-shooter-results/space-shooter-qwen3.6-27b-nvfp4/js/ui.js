/**
 * ui.js - HUD rendering, start screen, game over screen, combo display.
 * All UI text in monospace font, proper spacing.
 */
const UI = {
    drawHUD(ctx, score, level, combo, health, maxHealth, unleashActive, unleashProgress) {
        // Score - top left
        ctx.font = CONFIG.UI.hudFont;
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.textAlign = 'left';
        ctx.fillText('SCORE', 20, CONFIG.UI.hudY);
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText(`${score}`, 20, CONFIG.UI.hudY + 24);

        // Level - top center
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.fillText('LEVEL', window.innerWidth / 2, CONFIG.UI.hudY);
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText(`${level}`, window.innerWidth / 2, CONFIG.UI.hudY + 24);

        // Combo - top right
        ctx.textAlign = 'right';
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.fillText('COMBO', window.innerWidth - CONFIG.UI.hudPadding, CONFIG.UI.hudY);
        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.fillText(`${combo}x`, window.innerWidth - CONFIG.UI.hudPadding, CONFIG.UI.hudY + 24);

        // Health bar - bottom center
        const barW = CONFIG.UI.healthBarWidth;
        const barH = CONFIG.UI.healthBarHeight;
        const barX = (window.innerWidth - barW) / 2;
        const barY = window.innerHeight - 40;

        // Background
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = '#1A2530';
        ctx.fillRect(barX, barY, barW, barH);

        // Health fill
        const healthPct = health / maxHealth;
        const healthColor = healthPct > 0.5 ? CONFIG.COLORS.cyan : healthPct > 0.25 ? CONFIG.COLORS.gold : CONFIG.COLORS.red;
        ctx.fillStyle = healthColor;
        ctx.fillRect(barX, barY, barW * healthPct, barH);

        // Health label
        ctx.font = '14px monospace';
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.textAlign = 'center';
        ctx.fillText('HP', window.innerWidth / 2, barY - 5);

        // Unleash indicator
        if (unleashActive) {
            ctx.font = '16px monospace';
            ctx.fillStyle = CONFIG.COLORS.gold;
            ctx.textAlign = 'center';
            ctx.fillText(`UNLEASH: ${(unleashProgress * 5).toFixed(1)}s`, window.innerWidth / 2, barY - 30);
        }
    },

    drawStartScreen(ctx, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Darken background
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Title
        const titleY = h * 0.25;
        const pulse = 0.7 + 0.3 * Math.sin(time * 3);

        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.shadowColor = CONFIG.COLORS.cyan;
        ctx.shadowBlur = 20 * pulse;
        ctx.fillText('OCTOPUS INVADERS', w / 2, titleY);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '18px monospace';
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText('A Cyberpunk Space Shooter', w / 2, titleY + 40);

        // Show octopus types as preview
        const previewY = h * 0.45;
        const previewSpacing = 120;
        const startX = w / 2 - previewSpacing * 1.5;

        const types = [
            { label: 'Small', color: CONFIG.COLORS.pink, size: 36 },
            { label: 'Medium', color: CONFIG.COLORS.electricBlue, size: 48 },
            { label: 'Baby', color: CONFIG.COLORS.cyanLight, size: 20 },
            { label: 'Boss', color: CONFIG.COLORS.purple, size: 60 },
        ];

        for (let i = 0; i < types.length; i++) {
            const t = types[i];
            const px = startX + i * previewSpacing;
            const py = previewY;

            // Draw simplified octopus preview
            ctx.fillStyle = t.color;
            const s = t.size;
            // Simple pixel art representation
            ctx.fillRect(px - s / 2, py - s / 2, s, s * 0.6);
            ctx.fillRect(px - s / 4, py - s / 2 + s * 0.6, s / 2, s * 0.4);

            ctx.font = '12px monospace';
            ctx.fillStyle = t.color;
            ctx.fillText(t.label, px, py + s / 2 + 20);
        }

        // Click to start
        const startPulse = 0.6 + 0.4 * Math.sin(time * 4);
        ctx.globalAlpha = startPulse;
        ctx.font = '24px monospace';
        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.fillText('CLICK TO START', w / 2, h * 0.75);
        ctx.globalAlpha = 1;

        // Controls
        ctx.font = '16px monospace';
        ctx.fillStyle = CONFIG.COLORS.darkGray;
        ctx.fillText('MOUSE: Move  |  LEFT CLICK: Fire  |  ESC: Pause', w / 2, h * 0.85);
    },

    drawGameOverScreen(ctx, score, level, enemiesKilled, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Darken
        ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Game Over title
        const pulse = 0.7 + 0.3 * Math.sin(time * 3);
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLORS.red;
        ctx.shadowColor = CONFIG.COLORS.red;
        ctx.shadowBlur = 15 * pulse;
        ctx.fillText('GAME OVER', w / 2, h * 0.3);
        ctx.shadowBlur = 0;

        // Stats
        ctx.font = '20px monospace';
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText(`SCORE: ${score}`, w / 2, h * 0.45);
        ctx.fillText(`LEVEL: ${level}`, w / 2, h * 0.50);
        ctx.fillText(`ENEMIES KILLED: ${enemiesKilled}`, w / 2, h * 0.55);

        // Click to restart
        const restartPulse = 0.6 + 0.4 * Math.sin(time * 4);
        ctx.globalAlpha = restartPulse;
        ctx.font = '22px monospace';
        ctx.fillStyle = CONFIG.COLORS.gold;
        ctx.fillText('CLICK TO RESTART', w / 2, h * 0.7);
        ctx.globalAlpha = 1;
    },

    drawPauseScreen(ctx) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        ctx.fillStyle = 'rgba(13, 17, 23, 0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLORS.cyan;
        ctx.fillText('PAUSED', w / 2, h / 2 - 20);

        ctx.font = '20px monospace';
        ctx.fillStyle = CONFIG.COLORS.white;
        ctx.fillText('Press ESC to Resume', w / 2, h / 2 + 30);
    },

    drawBossWarning(ctx, time) {
        const w = window.innerWidth;
        const pulse = 0.5 + 0.5 * Math.sin(time * 6);
        
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(155, 89, 182, ${pulse})`;
        ctx.fillText('⚠ BOSS INCOMING ⚠', w / 2, window.innerHeight / 2 - 50);
    }
};
