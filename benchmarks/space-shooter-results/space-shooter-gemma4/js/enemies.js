/** @file enemies.js - Pixelated Octopus enemies */
import { CONFIG } from './config.js';
import { particles } from './particles.js';

// Pixel Grids (1 = filled, 0 = empty)
const GRIDS = {
    SMALL: [
        [0,1,1,0],
        [1,1,1,1],
        [1,1,1,1],
        [0,1,1,0]
    ],
    MEDIUM: [
        [0,0,1,1,0,0],
        [0,1,1,1,1,0],
        [1,1,1,1,1,1],
        [1,1,1,1,1,1],
        [0,1,0,0,1,0]
    ],
    BOSS: [
        [0,0,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,0],
        [0,0,1,0,0,1,0,0]
    ]
};

export class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.hitFlash = 0;
        
        switch(type) {
            case 'small':
                this.size = CONFIG.ENEMY_SIZES.SMALL;
                this.hp = 1;
                this.color = CONFIG.COLORS.SMALL_OCTO;
                this.grid = GRIDS.SMALL;
                this.speed = 2;
                break;
            case 'medium':
                this.size = CONFIG.ENEMY_SIZES.MEDIUM;
                this.hp = 3;
                this.color = CONFIG.COLORS.MED_OCTO;
                this.grid = GRIDS.MEDIUM;
                this.speed = 1.5;
                break;
            case 'boss':
                this.size = CONFIG.ENEMY_SIZES.BOSS;
                this.hp = 50;
                this.maxHp = 50;
                this.color = CONFIG.COLORS.BOSS_OCTO;
                this.grid = GRIDS.BOSS;
                this.speed = 0.5;
                break;
        }
        this.radius = this.size / 2;
    }

    update() {
        this.y += this.speed;
        if (this.hitFlash > 0) this.hitFlash--;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        if (this.hitFlash > 0) {
            ctx.fillStyle = '#FFFFFF';
        } else {
            ctx.fillStyle = this.color;
        }

        const cellW = this.size / this.grid[0].length;
        const cellH = this.size / this.grid.length;

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[r].length; c++) {
                if (this.grid[r][c] === 1) {
                    // Simple tentacle animation for bottom row
                    let offset = 0;
                    if (r === this.grid.length - 1) {
                        offset = Math.sin(Date.now() * 0.01 + this.x) * 2;
                    }
                    ctx.fillRect(
                        (c * cellW) - (this.size/2) + offset, 
                        (r * cellH) - (this.size/2), 
                        cellW, cellH
                    );
                }
            }
        }
        ctx.restore();
    }
}