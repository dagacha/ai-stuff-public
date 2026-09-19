/**
 * game.js
 * Main game loop, state machine, collision detection, and initialization.
 */
const game = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    state: 'menu', // menu, playing, paused, gameover
    level: 1,
    frame: 0,
    score: 0,
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    shake: 0,
    bullets: [],
    powerups: [],

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Input Listeners
        window.addEventListener('mousemove', e => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('mousedown', () => {
            this.mouseDown = true;
            AudioSys.init(); // Initialize audio context on first interaction
            this.handleClick();
        });
        window.addEventListener('mouseup', () => this.mouseDown = false);
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.togglePause();
        });

        // Init Systems
        Background.init();
        Player.init();

        this.loop();
    },

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    },

    handleClick() {
        if (this.state === 'menu') {
            this.startGame();
        } else if (this.state === 'gameover') {
            this.startGame();
        }
    },

    togglePause() {
        if (this.state === 'playing') this.state = 'paused';
        else if (this.state === 'paused') this.state = 'playing';
    },

    startGame() {
        this.state = 'playing';
        this.level = 1;
        this.frame = 0;
        this.bullets = [];
        this.powerups = [];
        Enemies.list = [];
        Enemies.bossActive = false;
        Enemies.waveActive = false;
        Player.init();
        Player.score = 0;
        Player.combo = 0;
        Player.tier = 1;
        Player.unleashMode = false;
    },

    nextLevel() {
        this.level++;
        // Check for tier up
        if (this.level % 3 === 0 && Player.tier < 4) {
            Player.tier++;
        }
        
        // Check for boss
        if (this.level % CONFIG.gameplay.bossInterval === 0) {
            Enemies.spawnBoss();
        } else {
            Enemies.spawnWave(this.level);
        }
    },

    update() {
        if (this.state !== 'playing') return;

        this.frame++;

        // Background
        Background.update(this.mouseX, this.mouseY);

        // Player
        Player.update();

        // Enemies
        Enemies.update();

        // Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;

            // Bullet Trails
            if (this.frame % 2 === 0) {
                Particles.spawn(b.x, b.y, 'trail', b.color, 1);
            }

            // Remove off-screen
            if (b.y < -50 || b.y > this.height + 50 || b.x < -50 || b.x > this.width + 50) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Collision: Bullet vs Enemy
            let hit = false;
            for (let j = Enemies.list.length - 1; j >= 0; j--) {
                let e = Enemies.list[j];
                let dx = b.x - e.x;
                let dy = b.y - e.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < (b.width/2 + e.size/2)) {
                    // Hit!
                    e.health -= b.damage;
                    e.hitFlash = 3;
                    hit = true;
                    
                    // Feedback
                    Particles.spawn(b.x, b.y, 'spark', '#FFF', 3);
                    Particles.spawnDamageNumber(e.x, e.y, b.damage);
                    AudioSys.hit();
                    this.shake = 2;

                    if (e.health <= 0) {
                        this.killEnemy(e, j);
                    }
                    break;
                }
            }
            if (hit) this.bullets.splice(i, 1);
        }

        // Collision: Player vs Enemy
        Enemies.list.forEach(e => {
            let dx = Player.x - e.x;
            let dy = Player.y - e.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < (Player.x + 30 + e.size/2)) { // Buffer for ship radius
                Player.health -= 20;
                this.shake = 10;
                Particles.spawn(Player.x, Player.y, 'explosion', '#FF0000', 10);
                AudioSys.explosion('small');
                
                // Push enemy away
                e.y += 50; 
                
                if (Player.health <= 0) {
                    this.state = 'gameover';
                    AudioSys.explosion('boss');
                }
            }
        });

        // Particles
        Particles.update();

        // Screen Shake Decay
        if (this.shake > 0) this.shake *= CONFIG.gameplay.screenShakeDecay;
        if (this.shake < 0.5) this.shake = 0;
    },

    killEnemy(e, index) {
        Enemies.list.splice(index, 1);
        
        // Score & Combo
        Player.score += e.score * (1 + Player.combo * 0.1);
        Player.combo++;
        Player.comboTimer = CONFIG.gameplay.comboTimeout;

        // Effects
        Particles.spawn(e.x, e.y, 'explosion', e.color, 10);
        Particles.spawn(e.x, e.y, 'ink', e.color, 5);
        AudioSys.explosion(e.type);
        this.shake = e.type === 'boss' ? 20 : 5;

        // Split Logic (Medium)
        if (e.type === 'medium') {
            Enemies.spawn('baby', e.x - 20, e.y);
            Enemies.spawn('baby', e.x + 20, e.y);
        }

        // Powerup Drop (Boss/Big)
        if (e.type === 'boss' || (e.type === 'medium' && Math.random() > 0.7)) {
            // Simple powerup logic: just heal or upgrade for now to keep code concise
            // Or spawn a "Unleash" orb
            Player.unleashMode = true;
            Player.unleashTimer = CONFIG.gameplay.unleashDuration;
            AudioSys.powerup();
        }
    },

    draw() {
        // Clear
        this.ctx.fillStyle = CONFIG.colors.bg;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Apply Shake
        this.ctx.save();
        if (this.shake > 0) {
            const dx = (Math.random() - 0.5) * this.shake;
            const dy = (Math.random() - 0.5) * this.shake;
            this.ctx.translate(dx, dy);
        }

        // Draw Layers
        Background.draw(this.ctx);
        
        // Draw Particles (Behind)
        Particles.draw(this.ctx);

        // Draw Enemies
        Enemies.draw(this.ctx);

        // Draw Bullets
        this.bullets.forEach(b => {
            this.ctx.fillStyle = b.color;
            this.ctx.fillRect(b.x - b.width/2, b.y, b.width, b.width * 2); // Elongated bullet
        });

        // Draw Player
        if (this.state !== 'gameover') {
            Player.draw(this.ctx);
        }

        this.ctx.restore();

        // UI (No Shake)
        UI.draw(this.ctx);
    },

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
};

// Start
window.onload = () => game.init();
