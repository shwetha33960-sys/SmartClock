/* Synthesised sounds (no audio files). Browsers allow audio only after a click. */
const Sound = (() => {
  let ctx = null, master = null;
  const loops = new Map();     // ring id -> interval
  let preview = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // one enveloped oscillator note; `when` is seconds from now
  function beep(freq, dur, peak, type, when, freqEnd) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.08);
  }
  function bell(f, when, peak) {
    beep(f, 1.8, (peak || 0.35), 'sine', when);
    beep(f * 2.76, 1.0, (peak || 0.35) * 0.5, 'sine', when);
    beep(f * 5.4, 0.5, (peak || 0.35) * 0.22, 'sine', when);
  }

  // Each tune plays one cycle; alarms repeat it every `len` seconds.
  const TUNES = {
    Radar: { len: 2.3, play() {
      for (let k = 0; k < 2; k++) { beep(600, 0.5, 0.45, 'sine', k * 1.0, 1500); beep(600, 0.5, 0.16, 'sine', k * 1.0 + 0.22, 1500); }
    } },
    Chimes: { len: 3.2, play() { [1319, 1047, 880, 784, 659].forEach((f, i) => beep(f, 1.2, 0.3, 'sine', i * 0.28)); } },
    Marimba: { len: 2.0, play() {
      [0, 0.95].forEach(o => [523, 659, 784, 1047, 784, 659].forEach((f, i) => beep(f, 0.3, 0.4, 'triangle', o + i * 0.13)));
    } },
    Beacon: { len: 1.8, play() { [0, 0.22, 0.44].forEach(t => beep(880, 0.14, 0.4, 'triangle', t)); beep(1760, 0.4, 0.4, 'triangle', 0.8); } },
    Bells: { len: 3.4, play() { [[784, 0], [988, 0.5], [1175, 1.0], [988, 1.5]].forEach(([f, t]) => bell(f, t)); } },
    Sunrise: { len: 4.4, play() { [262, 330, 392, 523, 659, 784].forEach((f, i) => beep(f, 1.5, 0.15 + i * 0.04, 'sine', i * 0.5)); } },
    Digital: { len: 1.3, play() { for (let i = 0; i < 4; i++) beep(i % 2 ? 1250 : 990, 0.14, 0.5, 'square', i * 0.2); } }
  };
  const DEFAULT = 'Digital';

  function playTune(name) { const t = TUNES[name] || TUNES[DEFAULT]; t.play(); return t.len; }

  return {
    unlock() { ensure(); },
    ready() { return !!ctx && ctx.state === 'running'; },
    tunes: Object.keys(TUNES),
    beep,
    chime() { beep(660, 0.5, 0.35, 'sine', 0); beep(880, 0.6, 0.35, 'sine', 0.15); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.5, 0.35, 'triangle', i * 0.14)); },

    alarmStart(id, tune) {
      ensure();
      this.alarmStop(id);
      const len = playTune(tune);
      loops.set(id, setInterval(() => playTune(tune), len * 1000));
    },
    alarmStop(id) { if (loops.has(id)) { clearInterval(loops.get(id)); loops.delete(id); } },

    preview(tune) { ensure(); playTune(tune); },
    stopPreview() { /* tunes are short and finish on their own */ }
  };
})();
