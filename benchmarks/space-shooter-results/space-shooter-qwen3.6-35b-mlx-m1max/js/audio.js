// js/audio.js
/**
 * audio.js - Procedural audio using Web Audio API.
 * All sounds are generated programmatically - no external files.
 */

const Audio = (() => {
    let ctx = null;
    let masterGain = null;
    let ambientGain = null;
    let ambientOsc = null;
    let unleashDrone = null;
    let unleashDroneGain = null;

    function init() {
        if (ctx) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(ctx.destination);

        // Ambient space hum
        ambientGain = ctx.createGain();
        ambientGain.gain.value = 0.03;
        ambientGain.connect(masterGain);

        ambientOsc = ctx.createOscillator();
        ambientOsc.type = 'sine';
        ambientOsc.frequency.value = 55;
        ambientOsc.connect(ambientGain);
        ambientOsc.start();

        // Unleash drone
        unleashDroneGain = ctx.createGain();
        unleashDroneGain.gain.value = 0;
        unleashDroneGain.connect(masterGain);

        unleashDrone = ctx.createOscillator();
        unleashDrone.type = 'sawtooth';
        unleashDrone.frequency.value = 80;
        unleashDrone.connect(unleashDroneGain);
        unleashDrone.start();
    }

    function playLaser() {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }

    function playExplosion(size) {
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        const vol = size === 'boss' ? 0.3 : size === 'medium' ? 0.2 : 0.12;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(size === 'boss' ? 400 : 800, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();

        // Low rumble
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4);
        oscGain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    }

    function playHit() {
        if (!ctx) return;
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();
    }

    function playPowerup() {
        if (!ctx) return;
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.08);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(ctx.currentTime + i * 0.08);
            osc.stop(ctx.currentTime + i * 0.08 + 0.15);
        });
    }

    function playBossWarning() {
        if (!ctx) return;
        for (let i = 0; i < 4; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 440;
            gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.2);
            gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.2 + 0.1);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.2 + 0.15);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(ctx.currentTime + i * 0.2);
            osc.stop(ctx.currentTime + i * 0.2 + 0.15);
        }
    }

    function setUnleashDrone(active) {
        if (!ctx) return;
        const target = active ? 0.15 : 0;
        unleashDroneGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.2);
    }

    function playInkBlast() {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    }

    return {
        init,
        playLaser,
        playExplosion,
        playHit,
        playPowerup,
        playBossWarning,
        setUnleashDrone,
        playInkBlast,
    };
})();
