/* Alarms: iOS-style list, edit mode with multi-select delete, and an editor sheet with a time wheel. */
const Alarms = {
  items: [],
  fired: {},
  editMode: false,
  selected: new Set(),
  DAY_NAMES: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  DAY_FULL: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ITEM_H: 40,

  async init() {
    App.$('al-add').addEventListener('click', () => this.openSheet(null));
    App.$('al-edit').addEventListener('click', () => this.setEditMode(!this.editMode));
    App.$('al-selall').addEventListener('click', () => {
      if (this.selected.size === this.items.length) this.selected.clear();
      else this.items.forEach(a => this.selected.add(a.id));
      this.render();
    });
    App.$('al-del').addEventListener('click', () => this.deleteSelected());
    await this.load();
  },

  async load() { this.items = await Api.list('alarms'); this.render(); },

  /* used by the wakeup planner */
  async add(time, label, days) {
    try {
      await Api.add('alarms', { time, label: label || 'Alarm', days: days || [], enabled: true, sound: 'Radar', snooze: true });
      await this.load();
      App.toast('Alarm set for ' + App.fmtHM(time), 'good');
    } catch (e) { App.fail(e); }
  },

  daysText(days) {
    if (!days || !days.length) return 'Never';
    if (days.length === 7) return 'Every day';
    if (days.join() === '1,2,3,4,5') return 'Weekdays';
    if (days.join() === '0,6') return 'Weekends';
    return days.map(d => this.DAY_FULL[d]).join(', ');
  },

  /* ---------- list ---------- */
  setEditMode(on) {
    this.editMode = on;
    this.selected.clear();
    App.$('al-edit').textContent = on ? 'Done' : 'Edit';
    this.render();
  },

  render() {
    const ul = App.$('alarm-list');
    ul.replaceChildren();
    const sorted = this.items.slice().sort((a, b) => a.time.localeCompare(b.time));
    sorted.forEach(a => {
      const [h, m] = a.time.split(':').map(Number);
      const big = App.use24h ? App.pad(h) + ':' + App.pad(m) : ((h % 12) || 12) + ':' + App.pad(m);
      const ap = App.use24h ? '' : (h < 12 ? 'AM' : 'PM');
      const sel = this.selected.has(a.id);
      const left = App.el('button', { class: 'al-main', onclick: () => this.editMode ? this.toggleSel(a.id) : this.openSheet(a) },
        this.editMode ? App.el('span', { class: 'sel-dot' + (sel ? ' on' : ''), 'aria-hidden': 'true' }, sel ? '✓' : '') : null,
        App.el('span', { class: 'al-time' }, big, ap ? App.el('span', { class: 'al-ap', text: ap }) : null),
        App.el('span', { class: 'al-sub', text: (a.label || 'Alarm') + (a.days && a.days.length ? ', ' + this.daysText(a.days) : '') }));
      const right = this.editMode
        ? App.el('span', { class: 'chev', text: '›' })
        : App.el('label', { class: 'switch', title: 'On / off' },
            App.el('input', { type: 'checkbox', checked: !!a.enabled, onchange: async e => {
              try { await Api.update('alarms', a.id, { ...a, enabled: e.target.checked }); await this.load(); } catch (err) { App.fail(err); }
            } }), App.el('span', { class: 'slider' }));
      ul.append(App.el('li', { class: 'item al-item' + (a.enabled || this.editMode ? '' : ' off') }, left, right));
    });
    if (!sorted.length) ul.append(App.el('li', { class: 'empty', text: 'No alarms. Tap + to add one.' }));

    const bar = App.$('al-bar'), n = this.selected.size;
    bar.hidden = !(this.editMode && n > 0);
    App.$('al-del').textContent = 'Delete (' + n + ')';
    App.$('al-selall').textContent = n === this.items.length ? 'Deselect all' : 'Select all';
    App.$('al-edit').hidden = !this.items.length && !this.editMode;
    this.updateNext();
  },

  toggleSel(id) { this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id); this.render(); },

  async deleteSelected() {
    const ids = [...this.selected];
    if (!ids.length) return;
    try {
      for (const id of ids) await Api.remove('alarms', id);
      App.toast(ids.length + (ids.length > 1 ? ' alarms deleted' : ' alarm deleted'));
      this.selected.clear();
      await this.load();
      if (!this.items.length) this.setEditMode(false);
    } catch (e) { App.fail(e); }
  },

  /* ---------- editor sheet ---------- */
  openSheet(alarm) {
    this.closeSheet();
    const now = App.now();
    const st = alarm
      ? { id: alarm.id, time: alarm.time, label: alarm.label || 'Alarm', days: (alarm.days || []).slice(), sound: alarm.sound || 'Radar', snooze: alarm.snooze !== false, enabled: alarm.enabled !== false }
      : { id: null, time: App.pad(now.getHours()) + ':' + App.pad(now.getMinutes()), label: 'Alarm', days: [], sound: 'Radar', snooze: true, enabled: true };
    this.st = st;
    this.wheels = null;

    const overlay = App.el('div', { class: 'sheet-overlay', onmousedown: e => { if (e.target === overlay) this.closeSheet(); } });
    const sheet = App.el('div', { class: 'sheet', role: 'dialog', 'aria-label': alarm ? 'Edit alarm' : 'Add alarm' });
    overlay.append(sheet);
    document.body.append(overlay);
    this.overlay = overlay; this.sheet = sheet;
    this.keyHandler = e => { if (e.key === 'Escape') { this.sub ? this.closeSub() : this.closeSheet(); } };
    document.addEventListener('keydown', this.keyHandler);
    this.sub = null;
    this.renderSheet(true);
  },

  closeSheet() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; document.removeEventListener('keydown', this.keyHandler); }
  },

  renderSheet(first) {
    const st = this.st, sheet = this.sheet;
    // keep the wheel position if we re-render after changing a row
    if (this.wheels) st.time = this.readWheels();
    sheet.replaceChildren(...[
      App.el('div', { class: 'sheet-bar' },
        App.el('button', { class: 'text-btn', text: 'Cancel', onclick: () => this.closeSheet() }),
        App.el('strong', { text: st.id ? 'Edit Alarm' : 'Add Alarm' }),
        App.el('button', { class: 'text-btn strong', text: 'Save', onclick: () => this.save() })),
      this.buildWheels(),
      App.el('div', { class: 'sheet-rows' },
        // Repeat
        App.el('button', { class: 'srow', onclick: () => { st.repeatOpen = !st.repeatOpen; this.renderSheet(); } },
          App.el('span', { text: 'Repeat' }), App.el('span', { class: 'sval', text: this.daysText(st.days) + ' ›' })),
        st.repeatOpen ? App.el('div', { class: 'srow days-row' }, App.el('div', { class: 'days' }, this.DAY_NAMES.map((n, i) =>
          App.el('button', { type: 'button', class: 'day' + (st.days.includes(i) ? ' on' : ''), title: this.DAY_FULL[i], text: n, onclick: () => {
            st.days = st.days.includes(i) ? st.days.filter(x => x !== i) : [...st.days, i].sort();
            this.renderSheet();
          } })))) : null,
        // Label
        App.el('label', { class: 'srow' },
          App.el('span', { text: 'Label' }),
          App.el('input', { type: 'text', class: 'label-input', value: st.label, maxlength: 40, placeholder: 'Alarm', oninput: e => { st.label = e.target.value; } })),
        // Sound
        App.el('button', { class: 'srow', onclick: () => this.openSub() },
          App.el('span', { text: 'Sound' }), App.el('span', { class: 'sval', text: st.sound + ' ›' })),
        // Snooze
        App.el('div', { class: 'srow' },
          App.el('span', { text: 'Snooze' }),
          App.el('label', { class: 'switch' },
            App.el('input', { type: 'checkbox', checked: st.snooze, onchange: e => { st.snooze = e.target.checked; } }), App.el('span', { class: 'slider' })))),
      st.id ? App.el('button', { class: 'btn danger wide', text: 'Delete Alarm', onclick: async () => {
        try { await Api.remove('alarms', st.id); this.closeSheet(); await this.load(); App.toast('Alarm deleted'); } catch (e) { App.fail(e); }
      } }) : null].filter(Boolean));
    this.positionWheels();
  },

  /* ---------- time wheels ---------- */
  buildWheels() {
    const [h, m] = this.st.time.split(':').map(Number);
    const is24 = App.use24h;
    const hours = is24 ? Array.from({ length: 24 }, (_, i) => App.pad(i)) : Array.from({ length: 12 }, (_, i) => String(i + 1));
    const mins = Array.from({ length: 60 }, (_, i) => App.pad(i));
    const hourIdx = is24 ? h : ((h % 12) || 12) - 1;
    this.wheels = {
      h: this.makeWheel(hours, hourIdx, true),
      m: this.makeWheel(mins, m, true),
      ap: is24 ? null : this.makeWheel(['AM', 'PM'], h < 12 ? 0 : 1, false)
    };
    return App.el('div', { class: 'wheel-box' },
      App.el('div', { class: 'wheel-band' }),
      this.wheels.h.el, this.wheels.m.el, this.wheels.ap ? this.wheels.ap.el : null);
  },

  makeWheel(values, startIdx, loop) {
    const H = this.ITEM_H, reps = loop ? 9 : 1, len = values.length, mid = loop ? Math.floor(reps / 2) : 0;
    const el = App.el('div', { class: 'wheel', tabindex: '0', role: 'listbox' });
    const list = App.el('div', { class: 'wheel-list' });
    for (let r = 0; r < reps; r++) values.forEach((v, i) => list.append(App.el('div', { class: 'wheel-item', 'data-i': r * len + i, text: v })));
    el.append(list);
    const w = { el, values, loop, len, mid, startIdx, last: -1, timer: null };
    const mark = () => {
      const c = Math.round(el.scrollTop / H);
      if (c === w.last) return;
      const items = list.children;
      [w.last - 2, w.last - 1, w.last, w.last + 1, w.last + 2].forEach(i => { if (items[i]) items[i].className = 'wheel-item'; });
      w.last = c;
      [c - 2, c - 1, c, c + 1, c + 2].forEach(i => { if (items[i]) items[i].className = 'wheel-item ' + (i === c ? 'sel' : Math.abs(i - c) === 1 ? 'near' : ''); });
    };
    el.addEventListener('scroll', () => {
      mark();
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {          // recentre so the wheel loops forever
        if (!loop) return;
        const c = Math.round(el.scrollTop / H), idx = ((c % len) + len) % len;
        if (c < len * 2 || c >= len * (reps - 2)) el.scrollTop = (mid * len + idx) * H;
      }, 160);
    });
    list.addEventListener('click', e => {
      const it = e.target.closest('.wheel-item'); if (!it) return;
      el.scrollTo({ top: Number(it.dataset.i) * H, behavior: 'smooth' });
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        el.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * H, behavior: 'smooth' });
      }
    });
    w.mark = mark;
    return w;
  },

  positionWheels() {
    const H = this.ITEM_H;
    requestAnimationFrame(() => {
      if (!this.wheels) return;
      Object.values(this.wheels).filter(Boolean).forEach(w => { w.el.scrollTop = (w.mid * w.len + w.startIdx) * H; w.last = -1; w.mark(); });
    });
  },

  readWheels() {
    const H = this.ITEM_H, idx = w => ((Math.round(w.el.scrollTop / H) % w.len) + w.len) % w.len;
    const w = this.wheels;
    let h = idx(w.h), m = idx(w.m);
    if (w.ap) h = (h + 1) % 12 + (idx(w.ap) === 1 ? 12 : 0);   // 12-hour index 0..11 means 1..12 o'clock
    return App.pad(h) + ':' + App.pad(m);
  },

  /* ---------- sound picker ---------- */
  openSub() {
    if (this.wheels) { this.st.time = this.readWheels(); this.wheels = null; }
    this.sub = 'sound';
    const st = this.st;
    this.sheet.replaceChildren(
      App.el('div', { class: 'sheet-bar' },
        App.el('button', { class: 'text-btn', text: '‹ Back', onclick: () => this.closeSub() }),
        App.el('strong', { text: 'Sound' }), App.el('span')),
      App.el('div', { class: 'sheet-rows tone-list' },
        App.el('div', { class: 'muted small pad', text: 'Ringtones (tap to preview)' }),
        Sound.tunes.map(t => App.el('button', { class: 'srow', onclick: () => { st.sound = t; Sound.preview(t); this.openSub(); } },
          App.el('span', { text: t }), App.el('span', { class: 'sval', text: st.sound === t ? '✓' : '' })))));
  },
  closeSub() { this.sub = null; this.renderSheet(); },

  async save() {
    const st = this.st;
    st.time = this.readWheels();
    const data = { time: st.time, label: (st.label || '').trim() || 'Alarm', days: st.days, enabled: true, sound: st.sound, snooze: st.snooze };
    try {
      if (st.id) await Api.update('alarms', st.id, data); else await Api.add('alarms', data);
      this.closeSheet();
      await this.load();
      App.toast('Alarm set for ' + App.fmtHM(st.time), 'good');
    } catch (e) { App.fail(e); }
  },

  /* ---------- next alarm + ringing ---------- */
  nextOccurrence(a, now) {
    const [h, m] = a.time.split(':').map(Number);
    for (let add = 0; add < 8; add++) {
      const d = new Date(now); d.setDate(d.getDate() + add); d.setHours(h, m, 0, 0);
      if (d <= now) continue;
      if (!a.days || !a.days.length || a.days.includes(d.getDay())) return d;
    }
    return null;
  },
  updateNext() {
    const now = App.now();
    let best = null, bestA = null;
    this.items.filter(a => a.enabled).forEach(a => {
      const n = this.nextOccurrence(a, now);
      if (n && (!best || n < best)) { best = n; bestA = a; }
    });
    const mins = best ? Math.round((best - now) / 60000) : 0;
    const txt = mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min';
    App.$('next-alarm').textContent = best ? 'Next alarm in ' + txt + ' (' + App.fmtHM(bestA.time) + ')' : 'No alarms are switched on.';
  },

  tick(now) {
    const key = now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() + ' ' + App.pad(now.getHours()) + ':' + App.pad(now.getMinutes());
    const hhmm = App.pad(now.getHours()) + ':' + App.pad(now.getMinutes());
    this.items.forEach(a => {
      if (!a.enabled || a.time !== hhmm) return;
      if (a.days && a.days.length && !a.days.includes(now.getDay())) return;
      if (this.fired[a.id] === key) return;
      this.fired[a.id] = key;
      this.ring(a);
    });
    if (!this._n || now - this._n > 15000 || Math.abs(now - this._n) > 60000) { this._n = now; this.updateNext(); }
  },

  ring(a, isSnooze) {
    const buttons = [];
    if (a.snooze !== false) buttons.push({ label: 'Snooze 5 min', primary: false, onClick: () => this.snooze(a) });
    buttons.push({ label: 'Stop' });
    App.ring({ icon: '⏰', title: a.label || 'Alarm', text: App.fmtHM(a.time), tune: a.sound || 'Radar', buttons });
    if (!isSnooze && (!a.days || !a.days.length)) {
      Api.update('alarms', a.id, { ...a, enabled: false }).then(() => this.load()).catch(() => {});
    }
  },
  snooze(a) {
    App.toast('Snoozed for 5 minutes');
    setTimeout(() => this.ring(a, true), 5 * 60 * 1000);
  }
};
App.register(Alarms);
