/**
 * audio.js - Procedural Web Audio API sound engine.
 * All sounds generated from oscillators, noise bursts, and envelopes.
 */
const AudioEngine = {
    ctx: null,
    masterGain: null,
    masterVolume: CONFIG.AUDIO.masterVolume,

    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.ctx.destination);
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // Laser pew - short oscillator sweep
    playLaser() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(CONFIG.AUDIO.laserFreq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + CONFIG.AUDIO.laserDuration);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + CONFIG.AUDIO.laserDuration);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + CONFIG.AUDIO.laserDuration);
    },

    // Explosion - noise burst + low rumble
    playExplosion(size = 'medium') {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const dur = size === 'boss' ? 0.7 : size === 'small' ? 0.25 : CONFIG.AUDIO.explosionDuration;

        // Noise burst
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(size === 'boss' ? 0.3 : 0.15, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = size === 'boss' ? 600 : 1200;
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);

        // Low rumble
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(size === 'boss' ? 60 : size === 'small' ? 120 : 90, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + dur);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(size === 'boss' ? 0.25 : 0.12, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + dur);
    },

    // Hit sound - short noise burst
    playHit() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const dur = CONFIG.AUDIO.hitDuration;
        const bufferSize = this.ctx.sampleRate * dur;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
    },

    // Powerup collect chime - ascending tone
    playPowerup() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const dur = CONFIG.AUDIO.powerupDuration;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + dur * 0.33);
        osc.frequency.setValueAtTime(784, now + dur * 0.66);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + dur);
    },

    // Boss warning alarm
    playBossWarning() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            const t = now + i * 0.25;
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(660, t + 0.1);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.setValueAtTime(0.1, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.25);
        }
    },

    // Unleash mode bass drone
    playUnleashDrone() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const dur = CONFIG.AUDIO.unleashDroneDuration;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(CONFIG.AUDIO.unleashDroneFreq, now);
        osc.frequency.linearRampToValueAtTime(CONFIG.AUDIO.unleashDroneFreq * 1.5, now + dur);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + dur * 0.8);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + dur);
    },

    // Ambient space hum
    startAmbient() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(38, now);
        gain.gain.setValueAtTime(0.03, now);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        this.ambientOsc = osc;
        this.ambientGain = gain;
    },

    stopAmbient() {
        if (this.ambientOsc) {
            this.ambientOsc.stop();
            this.ambientOsc = null;
        }
    },
};