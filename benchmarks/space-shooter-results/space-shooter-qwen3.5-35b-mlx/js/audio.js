/**
 * audio.js
 * Procedural audio generation using Web Audio API.
 * No external assets.
 */

const AudioSys = (() => {
    let ctx = null;
    let masterGain = null;

    function init() {
        if (ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioContext();
        masterGain = ctx.createGain();
        masterGain.gain.value = CONFIG.AUDIO.masterVolume;
        masterGain.connect(ctx.destination);
    }

    function playTone(freq, type, duration, vol = 1) {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    function playNoise(duration, vol = 1) {
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        noise.connect(gain);
        gain.connect(masterGain);
        
        noise.start();
    }

    // Specific Sound Effects
    return {
        init,
        shoot: () => playTone(880, 'square', 0.1, 0.5),
        enemyHit: () => playNoise(0.1, 0.3),
        explosion: (size) => {
            const vol = size > 100 ? 0.8 : 0.4;
            playNoise(0.3 + (size/1000), vol);
            playTone(100, 'sawtooth', 0.2, vol);
        },
        powerup: () => {
            playTone(440, 'sine', 0.1, 0.5);
            setTimeout(() => playTone(880, 'sine', 0.2, 0.5), 100);
        },
        unleashStart: () => {
            playTone(200, 'sawtooth', 1.0, 0.6);
            playNoise(0.5, 0.5);
        },
        bossWarning: () => {
            playTone(150, 'square', 0.5, 0.8);
            setTimeout(() => playTone(150, 'square', 0.5, 0.8), 600);
        }
    };
})();
