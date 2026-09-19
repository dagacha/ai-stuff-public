/**
 * audio.js
 * Procedural audio generation using Web Audio API.
 */
const AudioSys = (() => {
    let ctx = null;
    let masterGain = null;

    function init() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.3; // Master volume
            masterGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
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

    // Specific Sounds
    return {
        init,
        shoot: () => playTone(800, 'square', 0.1, 0.5),
        hit: () => playNoise(0.1, 0.8),
        explosion: (size) => playNoise(size === 'boss' ? 1.0 : 0.3, size === 'boss' ? 1.0 : 0.6),
        powerup: () => {
            playTone(400, 'sine', 0.1);
            setTimeout(() => playTone(600, 'sine', 0.1), 100);
            setTimeout(() => playTone(800, 'sine', 0.2), 200);
        },
        unleash: () => playTone(100, 'sawtooth', 2.0, 0.8),
        bossWarning: () => playTone(150, 'square', 0.5, 0.8)
    };
})();
