/* Countdown timer and stopwatch. Both keep running if you reload the page. */
const Timer = {
  st: { state: 'idle', total: 300, endAt: 0, remaining: 300 },
  CIRC: 2 * Math.PI * 54,

  init() {
    const saved = App.store.get('timer', null);
    if (saved) this.st = saved;
    const ring = App.$('timer-ring');
    ring.style.strokeDasharray = this.CIRC;
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => this.setInputs(Number(b.dataset.preset))));
    App.$('t-start').addEventListener('click', () => this.toggle());
    App.$('t-reset').addEventListener('click', () => this.reset());
    this.setInputs(this.st.state === 'idle' ? this.st.total : this.st.total, true);
    this.paint();
  },

  inputsSeconds() {
    return (Number(App.$('t-h').value) || 0) * 3600 + (Number(App.$('t-m').value) || 0) * 60 + (Number(App.$('t-s').value) || 0);
  },
  setInputs(sec, silent) {
    App.$('t-h').value = Math.floor(sec / 3600);
    App.$('t-m').value = Math.floor((sec % 3600) / 60);
    App.$('t-s').value = sec % 60;
    if (this.st.state === 'idle' && !silent) { this.st.total = sec; this.st.remaining = sec; this.save(); this.paint(); }
  },
  save() { App.store.set('timer', this.st); },

  toggle() {
    if (this.st.state === 'running') {
      this.st.remaining = Math.max(0, Math.round((this.st.endAt - Date.now()) / 1000));
      this.st.state = 'paused';
    } else {
      if (this.st.state === 'idle') {
        const s = this.inputsSeconds();
        if (s <= 0) { App.toast('Set a time first', 'bad'); return; }
        this.st.total = s; this.st.remaining = s;
      }
      this.st.endAt = Date.now() + this.st.remaining * 1000;
      this.st.state = 'running';
    }
    this.save(); this.paint();
  },
  reset() {
    this.st = { state: 'idle', total: this.inputsSeconds() || 300, endAt: 0, remaining: this.inputsSeconds() || 300 };
    this.save(); this.paint();
  },
  start(seconds) {                    // used by voice control
    this.st = { state: 'running', total: seconds, endAt: Date.now() + seconds * 1000, remaining: seconds };
    this.setInputs(seconds, true);
    this.save(); this.paint();
  },
  pause() { if (this.st.state === 'running') this.toggle(); },

  leftMs() { return this.st.state === 'running' ? this.st.endAt - Date.now() : this.st.remaining * 1000; },

  paint() {
    const ms = this.leftMs();
    App.$('timer-display').textContent = App.fmtDur(ms);
    const frac = this.st.total ? Math.max(0, Math.min(1, ms / (this.st.total * 1000))) : 0;
    App.$('timer-ring').style.strokeDashoffset = this.CIRC * (1 - frac);
    App.$('t-start').textContent = this.st.state === 'running' ? 'Pause' : this.st.state === 'paused' ? 'Resume' : 'Start';
  },

  tick() {
    if (this.st.state === 'running') {
      if (Date.now() >= this.st.endAt) {
        this.st = { state: 'idle', total: this.st.total, endAt: 0, remaining: this.st.total };
        this.save();
        App.ring({ icon: '⏳', title: 'Timer finished', text: App.fmtDur(this.st.total * 1000) + ' is up.', buttons: [{ label: 'Stop' }] });
      }
      this.paint();
    }
  }
};
App.register(Timer);

const Stopwatch = {
  st: { running: false, startedAt: 0, acc: 0, laps: [] },

  init() {
    const saved = App.store.get('stopwatch', null);
    if (saved) this.st = saved;
    App.$('sw-start').addEventListener('click', () => this.toggle());
    App.$('sw-lap').addEventListener('click', () => this.lap());
    App.$('sw-reset').addEventListener('click', () => this.reset());
    this.paint(); this.renderLaps();
  },
  save() { App.store.set('stopwatch', this.st); },
  elapsed() { return this.st.acc + (this.st.running ? Date.now() - this.st.startedAt : 0); },
  start() { if (!this.st.running) this.toggle(); },
  stop() { if (this.st.running) this.toggle(); },
  toggle() {
    if (this.st.running) { this.st.acc += Date.now() - this.st.startedAt; this.st.running = false; }
    else { this.st.startedAt = Date.now(); this.st.running = true; }
    this.save(); this.paint();
  },
  lap() {
    if (!this.st.running) return;
    this.st.laps.unshift(this.elapsed());
    this.save(); this.renderLaps();
  },
  reset() { this.st = { running: false, startedAt: 0, acc: 0, laps: [] }; this.save(); this.paint(); this.renderLaps(); },
  fmt(ms) {
    const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000);
    return (h ? h + ':' : '') + App.pad(m) + ':' + App.pad(s) + '.' + App.pad(cs);
  },
  paint() {
    App.$('sw-display').textContent = this.fmt(this.elapsed());
    App.$('sw-start').textContent = this.st.running ? 'Stop' : (this.st.acc ? 'Resume' : 'Start');
    App.$('sw-lap').disabled = !this.st.running;
  },
  renderLaps() {
    const ol = App.$('sw-laps');
    ol.replaceChildren();
    const n = this.st.laps.length;
    this.st.laps.forEach((t, i) => {
      const prev = this.st.laps[i + 1] || 0;
      ol.append(App.el('li', {}, App.el('span', { text: 'Lap ' + (n - i) }), App.el('span', { class: 'muted', text: '+' + this.fmt(t - prev) }), App.el('span', { text: this.fmt(t) })));
    });
  },
  tick() { if (this.st.running || App.currentView === 'timer') this.paint(); }
};
App.register(Stopwatch);
