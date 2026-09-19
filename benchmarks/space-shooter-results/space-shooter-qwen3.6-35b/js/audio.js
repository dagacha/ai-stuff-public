/**
 * audio.js
 * Procedural audio generation using Web Audio API.
 * Handles all SFX, music, and ambient sounds without external files.
 */

import CONFIG from './config.js';

class AudioController {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.ambientOsc = null;
        this.ambientGain = null;
        this.unleashOsc = null;
        this.unleashGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = CONFIG.SFX_VOLUME;
            this.masterGain.connect(this.ctx.destination);
            this.startAmbient();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported or blocked.');
        }
    }

    startAmbient() {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        this.ambientOsc = this.ctx.createOscillator();
        this.ambientGain = this.ctx.createGain();
        this.ambientOsc.type = 'sine';
        this.ambientOsc.frequency.value = 50;
        this.ambientGain.gain.value = CONFIG.AMBIENT_VOLUME;
        this.ambientOsc.connect(this.ambientGain);
        this.ambientGain.connect(this.masterGain);
        this.ambientOsc.start();
    }

    stopAmbient() {
        if (this.ambientOsc) {
            this.ambientOsc.stop();
            this.ambientOsc = null;
        }
    }

    playLaser(tier = 0) {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800 - tier * 100, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playHit() {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
    }

    playExplosion(size = 'small') {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        const vol = size === 'boss' ? 0.4 : size === 'medium' ? 0.3 : 0.2;
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = size === 'boss' ? 200 : 400;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
    }

    playPowerup() {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    startUnleashDrone() {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        this.unleashOsc = this.ctx.createOscillator();
        this.unleashGain = this.ctx.createGain();
        this.unleashOsc.type = 'sawtooth';
        this.unleashOsc.frequency.value = 60;
        this.unleashGain.gain.value = 0.15;
        this.unleashOsc.connect(this.unleashGain);
        this.unleashGain.connect(this.masterGain);
        this.unleashOsc.start();
    }

    stopUnleashDrone() {
        if (this.unleashOsc) {
            this.unleashOsc.stop();
            this.unleashOsc = null;
        }
    }

    playBossAlarm() {
        if (!this.ctx || !CONFIG.AUDIO_ENABLED) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.setValueAtTime(100, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.setValueAtTime(0, this.ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.4);
    }
}

export const audio = new AudioController();