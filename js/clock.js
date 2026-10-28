/* Home screen: analog clock (drag the hands to set the time), digital time and date. */
const Clock = {
  hands: {},
  NS: 'http://www.w3.org/2000/svg',

  s(tag, attrs, parent) {
    const e = document.createElementNS(this.NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  },

  init() {
    const svg = App.$('analog');
    const defs = this.s('defs', {}, svg);
    const face = this.s('radialGradient', { id: 'face', cx: '50%', cy: '38%', r: '72%' }, defs);
    this.s('stop', { offset: '0%', class: 'st-face-a' }, face);
    this.s('stop', { offset: '100%', class: 'st-face-b' }, face);
    const bez = this.s('linearGradient', { id: 'bezel', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    this.s('stop', { offset: '0%', class: 'st-bez-a' }, bez);
    this.s('stop', { offset: '100%', class: 'st-bez-b' }, bez);
    const sh = this.s('filter', { id: 'shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    this.s('feDropShadow', { dx: '0', dy: '1.6', stdDeviation: '1.5', 'flood-color': '#000', 'flood-opacity': '.35' }, sh);

    this.s('circle', { r: 107, class: 'bezel' }, svg);
    this.s('circle', { r: 103, class: 'face' }, svg);
    this.s('circle', { r: 94, class: 'inner-ring' }, svg);

    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0, a = i * 6 * Math.PI / 180;
      const r1 = major ? 84 : 91, r2 = 97;
      this.s('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * r2, y2: -Math.cos(a) * r2, class: major ? 'tick-major' : 'tick-minor' }, svg);
    }
    [['12', 0, -70], ['3', 70, 0], ['6', 0, 70], ['9', -70, 0]].forEach(([t, x, y]) => {
      this.s('text', { x, y: y + 4.5, 'text-anchor': 'middle', class: 'numeral' }, svg).textContent = t;
    });
    this.s('text', { x: 0, y: -28, 'text-anchor': 'middle', class: 'brand-text' }, svg).textContent = 'SMART CLOCK';
    this.dateWin = this.s('text', { x: 0, y: 38, 'text-anchor': 'middle', class: 'date-text' }, svg);

    const g = this.s('g', { filter: 'url(#shadow)', 'pointer-events': 'none' }, svg);
    this.hands.h = this.s('line', { x1: 0, y1: 9, x2: 0, y2: -46, class: 'hand-h' }, g);
    this.hands.m = this.s('line', { x1: 0, y1: 11, x2: 0, y2: -71, class: 'hand-m' }, g);
    const sg = this.s('g', {}, g);
    this.s('line', { x1: 0, y1: 20, x2: 0, y2: -86, class: 'hand-s' }, sg);
    this.s('circle', { cx: 0, cy: 20, r: 2.2, class: 'hand-s-dot' }, sg);
    this.hands.s = sg;
    this.s('circle', { r: 4.2, class: 'cap' }, svg);
    this.s('circle', { r: 1.6, class: 'cap-dot' }, svg);

    this.bindDrag(svg);
    this.bindControls();

    const spin = () => { this.sweep(); requestAnimationFrame(spin); };
    spin();
  },

  /* Drag near the centre to move the hour hand, further out to move the minute hand. */
  bindDrag(svg) {
    let drag = null;
    const pt = e => {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 220 - 110, y = (e.clientY - r.top) / r.height * 220 - 110;
      return { r: Math.hypot(x, y), a: Math.atan2(x, -y) * 180 / Math.PI };
    };
    svg.addEventListener('pointerdown', e => {
      const p = pt(e);
      if (p.r > 104 || p.r < 6) return;
      drag = { hand: p.r <= 56 ? 'h' : 'm', last: p.a };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
      e.preventDefault();
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = pt(e);
      let d = p.a - drag.last;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      drag.last = p.a;
      App.setOffset(App.offset + (drag.hand === 'm' ? d / 6 * 60000 : d / 30 * 3600000));
      this.syncControls();
    });
    const end = () => { if (drag) { drag = null; svg.classList.remove('dragging'); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  },

  bindControls() {
    const fmt = App.$('fmt-btn'), panel = App.$('set-panel'), input = App.$('set-input');
    fmt.textContent = App.use24h ? '12-hour' : '24-hour';
    fmt.addEventListener('click', () => {
      App.use24h = !App.use24h;
      App.store.set('use24h', App.use24h);
      fmt.textContent = App.use24h ? '12-hour' : '24-hour';
      if (window.Alarms) Alarms.render();
      if (window.Wakeup) Wakeup.renderAll();
    });

    const open = () => {
      const d = App.now();
      input.value = App.pad(d.getHours()) + ':' + App.pad(d.getMinutes());
      panel.hidden = false;
      input.focus();
    };
    App.$('set-btn').addEventListener('click', () => { panel.hidden ? open() : (panel.hidden = true); });
    document.querySelector('.digital').addEventListener('click', open);

    const apply = () => {
      if (!input.value) return;
      const [h, m] = input.value.split(':').map(Number);
      const target = new Date(); target.setHours(h, m, 0, 0);
      App.setOffset(target.getTime() - Date.now());
      panel.hidden = true;
      this.syncControls();
      App.toast('Clock set to ' + App.fmtHM(App.pad(h) + ':' + App.pad(m)), 'good');
    };
    App.$('set-apply').addEventListener('click', apply);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') panel.hidden = true; });

    App.$('real-btn').addEventListener('click', () => {
      App.setOffset(0); panel.hidden = true; this.syncControls();
      App.toast('Back to real time', 'good');
    });
    this.syncControls();
  },

  syncControls() {
    const custom = Math.abs(App.offset) > 1000;
    App.$('real-btn').hidden = !custom;
    App.$('d-zone').textContent = custom ? 'Time set manually' : App.localZone.replace(/_/g, ' ') + ' · drag the hands to set the time';
  },

  sweep() {
    const d = App.now();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    this.hands.s.setAttribute('transform', 'rotate(' + s * 6 + ')');
    this.hands.m.setAttribute('transform', 'rotate(' + m * 6 + ')');
    this.hands.h.setAttribute('transform', 'rotate(' + h * 30 + ')');
  },

  tick(now) {
    const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !App.use24h }).formatToParts(now);
    const get = t => (parts.find(p => p.type === t) || {}).value || '';
    App.$('d-time').textContent = get('hour') + ':' + get('minute');
    App.$('d-sec').textContent = ':' + get('second');
    App.$('d-ampm').textContent = App.use24h ? '' : get('dayPeriod');
    App.$('d-date').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    this.dateWin.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric' }).format(now).toUpperCase();
    document.title = App.fmtClock(now, App.localZone, false) + ' · Smart Clock';
  }
};
App.register(Clock);
