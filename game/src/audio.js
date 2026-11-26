// Optional sound, synthesised with WebAudio — no audio files. A low engine
// hum follows the throttle, rings chime, landings chirp and crashes thud.
// Everything starts on the first user gesture; M mutes.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    context = new AudioCtor();
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
    return true;
  }

  function tone(freq, start, duration, gainValue, type) {
    if (!context || muted) return;
    const osc = context.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  return {
    start() {
      ensure();
    },
    setEngine(throttle, flying) {
      if (!context || !engineOsc) return;
      const now = context.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + throttle * 75, now, 0.08);
      engineGain.gain.setTargetAtTime(muted || !flying ? 0 : 0.035 + throttle * 0.03, now, 0.1);
    },
    ring() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(880, now, 0.22, 0.16);
      tone(1318, now + 0.09, 0.3, 0.13);
    },
    landed() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(523, now, 0.18, 0.14);
      tone(659, now + 0.12, 0.18, 0.14);
      tone(784, now + 0.24, 0.34, 0.16);
    },
    crashed() {
      if (!ensure() || muted) return;
      const now = context.currentTime;
      tone(90, now, 0.5, 0.3, 'triangle');
      tone(55, now + 0.05, 0.6, 0.25, 'sine');
    },
    stall() {
      if (!ensure() || muted) return;
      tone(740, context.currentTime, 0.12, 0.08, 'square');
    },
    toggleMute() {
      muted = !muted;
      if (engineGain && context) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
