/* Core: navigation, helpers, toasts, ringing overlay. */
const App = {
  modules: [],
  use24h: false,
  localZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  currentView: 'home',
  activeRings: new Set(),

  offset: 0,          // milliseconds the clock has been moved away from real time
  now() { return new Date(Date.now() + this.offset); },
  setOffset(ms) {
    this.offset = Math.round(ms);
    this.store.set('offsetMs', this.offset);
    this.updatePhase();
  },

  /* Theme follows the time shown on the clock. */
  phaseFor(h) {
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
  },
  updatePhase() {
    const d = this.now();
    document.body.dataset.phase = this.phaseFor(d.getHours() + d.getMinutes() / 60);
  },

  store: {
    get(k, d) { try { const v = localStorage.getItem('sc.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sc.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  },

  el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  },
  $(id) { return document.getElementById(id); },
  pad(n, w) { return String(n).padStart(w || 2, '0'); },

  fmtClock(date, zone, withSeconds) {
    const o = { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: !this.use24h };
    if (withSeconds) o.second = '2-digit';
    return new Intl.DateTimeFormat('en-US', o).format(date);
  },
  fmtHM(hhmm) {
    if (this.use24h) return hhmm;
    const [h, m] = hhmm.split(':').map(Number);
    return ((h % 12) || 12) + ':' + this.pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  },
  fmtDur(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return this.pad(h) + ':' + this.pad(m) + ':' + this.pad(s);
  },

  toast(msg, kind) {
    const t = this.el('div', { class: 'toast ' + (kind || ''), text: msg });
    this.$('toasts').append(t);
    setTimeout(() => t.classList.add('out'), 3000);
    setTimeout(() => t.remove(), 3600);
  },
  fail(e) { console.error(e); this.toast('Something went wrong: ' + (e.message || e), 'bad'); },

  ring(opts) {
    const id = 'r' + Math.random().toString(36).slice(2);
    const handle = { id, close() { App.activeRings.delete(handle); Sound.alarmStop(id); wrap.remove(); } };
    const card = this.el('div', { class: 'ring-card' },
      this.el('div', { class: 'ring-icon', text: opts.icon || '⏰' }),
      this.el('h2', { text: opts.title }),
      this.el('p', { text: opts.text || '' }),
      this.el('div', { class: 'row center' }, (opts.buttons || [{ label: 'Stop' }]).map(b =>
        this.el('button', { class: 'btn ' + (b.primary === false ? '' : 'primary'), text: b.label, onclick: () => { handle.close(); if (b.onClick) b.onClick(); } }))));
    const wrap = this.el('div', { class: 'ring-overlay' }, card);
    this.$('rings').append(wrap);
    Sound.alarmStart(id, opts.tune);
    this.activeRings.add(handle);
    return handle;
  },

  show(view) {
    if (!this.$('view-' + view)) return;
    this.currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('#dock button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.body.dataset.view = view;
    this.modules.forEach(m => m.onShow && m.onShow(view));
  },

  register(m) { this.modules.push(m); },

  async start() {
    this.use24h = this.store.get('use24h', false);
    this.offset = this.store.get('offsetMs', 0);
    this.updatePhase();
    setInterval(() => this.updatePhase(), 10000);
    document.body.dataset.view = 'home';
    document.querySelectorAll('#dock button').forEach(b => b.addEventListener('click', () => this.show(b.dataset.view)));

    const hint = this.$('sound-hint');
    const unlock = () => { Sound.unlock(); hint.hidden = true; ['pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, unlock, true)); };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, true));
    hint.hidden = false;

    for (const m of this.modules) { try { await m.init(); } catch (e) { this.fail(e); } }
    const loop = () => { const now = this.now(); this.modules.forEach(m => { try { m.tick && m.tick(now); } catch (e) { console.error(e); } }); };
    loop();
    setInterval(loop, 200);
  }
};
