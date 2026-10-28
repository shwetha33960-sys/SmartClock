/* Routine clock: chains of timed steps. When a step ends an alarm rings and waits for "Next step". */
const Routines = {
  items: [],
  run: null,       // { routine, idx, endAt, paused, remaining, waiting, ring }
  editing: null,   // { id|null, name, sound, steps:[{name,minutes}] }

  async init() {
    App.$('routine-new').addEventListener('click', () => this.edit({ id: null, name: '', sound: 'Radar', steps: [{ name: '', minutes: 10 }] }));
    await this.load();
    if (!this.items.length && !App.store.get('routinesSeeded', false)) {
      App.store.set('routinesSeeded', true);
      const seed = [
        ['Morning routine', [['Wake up and stretch', 5], ['Freshen up', 15], ['Breakfast', 20], ['Get ready to leave', 10]]],
        ['Study session', [['Focus', 25], ['Short break', 5], ['Focus', 25], ['Long break', 15]]],
        ['Wind down', [['Tidy up and plan tomorrow', 10], ['Screens off, read', 20], ['Lights out', 5]]]
      ];
      for (const [name, steps] of seed) await Api.add('routines', { name, sound: 'Radar', steps: steps.map(([n, m]) => ({ name: n, minutes: m })) });
      await this.load();
    }
    this.renderRunner();
  },

  async load() { this.items = await Api.list('routines'); this.renderList(); },
  total(r) { return r.steps.reduce((s, x) => s + Number(x.minutes || 0), 0); },

  renderList() {
    const ul = App.$('routine-list');
    ul.replaceChildren();
    this.items.forEach(r => {
      ul.append(App.el('li', { class: 'item' },
        App.el('div', { class: 'item-main' },
          App.el('div', { class: 'item-title', text: r.name }),
          App.el('div', { class: 'muted', text: r.steps.length + ' steps · ' + this.total(r) + ' min · ' + r.steps.map(s => s.name).join(' → ') })),
        App.el('button', { class: 'btn primary', text: 'Start', onclick: () => this.start(r) }),
        App.el('button', { class: 'btn', text: 'Edit', onclick: () => this.edit(JSON.parse(JSON.stringify(r))) }),
        App.el('button', { class: 'icon-btn', title: 'Delete', text: '×', onclick: async () => {
          try { await Api.remove('routines', r.id); await this.load(); } catch (e) { App.fail(e); }
        } })));
    });
    if (!this.items.length) ul.append(App.el('li', { class: 'empty', text: 'No routines yet. Create one.' }));
  },

  /* ---- editor ---- */
  edit(r) { if (!r.sound) r.sound = 'Radar'; this.editing = r; this.renderEditor(); },
  renderEditor() {
    const box = App.$('routine-editor');
    const r = this.editing;
    if (!r) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(
      App.el('label', {}, 'Routine name ', App.el('input', { type: 'text', value: r.name, maxlength: 40, placeholder: 'Evening workout', oninput: e => { r.name = e.target.value; } })),
      App.el('div', { class: 'steps-edit' }, r.steps.map((s, i) =>
        App.el('div', { class: 'row step-row' },
          App.el('span', { class: 'muted', text: (i + 1) + '.' }),
          App.el('input', { type: 'text', class: 'grow', value: s.name, placeholder: 'Step name', maxlength: 40, oninput: e => { s.name = e.target.value; } }),
          App.el('input', { type: 'number', min: 1, max: 600, value: s.minutes, class: 'num', oninput: e => { s.minutes = Number(e.target.value); } }),
          App.el('span', { class: 'muted', text: 'min' }),
          App.el('button', { class: 'icon-btn', title: 'Remove step', text: '×', onclick: () => { r.steps.splice(i, 1); this.renderEditor(); } })))),
      App.el('div', { class: 'row' },
        App.el('label', { class: 'check-label' }, 'Alarm sound at the end of each step ',
          App.el('select', { onchange: e => { r.sound = e.target.value; Sound.preview(r.sound); } },
            Sound.tunes.map(t => App.el('option', { value: t, selected: t === r.sound, text: t })))),
        App.el('button', { class: 'chip', text: '+ Add step', onclick: () => { r.steps.push({ name: '', minutes: 10 }); this.renderEditor(); } })),
      App.el('div', { class: 'row' },
        App.el('button', { class: 'btn primary', text: 'Save routine', onclick: () => this.saveEditing() }),
        App.el('button', { class: 'btn', text: 'Cancel', onclick: () => { this.editing = null; this.renderEditor(); } })));
  },
  async saveEditing() {
    const r = this.editing;
    r.name = r.name.trim() || 'My routine';
    r.steps = r.steps.filter(s => Number(s.minutes) > 0).map(s => ({ name: (s.name || '').trim() || 'Step', minutes: Number(s.minutes) }));
    if (!r.steps.length) { App.toast('Add at least one step with minutes', 'bad'); return; }
    const data = { name: r.name, sound: r.sound || 'Radar', steps: r.steps };
    try {
      if (r.id) await Api.update('routines', r.id, data); else await Api.add('routines', data);
      this.editing = null; this.renderEditor(); await this.load();
      App.toast('Routine saved', 'good');
    } catch (e) { App.fail(e); }
  },

  /* ---- running ---- */
  start(r) {
    this.closeRing();
    this.run = { routine: r, idx: 0, endAt: Date.now() + r.steps[0].minutes * 60000, paused: false, remaining: 0, waiting: false, ring: null };
    Sound.chime();
    this.renderRunner();
    App.show('routines');
  },
  startByName(name) {
    const n = name.toLowerCase().trim();
    const r = this.items.find(x => x.name.toLowerCase().includes(n));
    if (!r) return null;
    this.start(r);
    return r;
  },
  stepMs() { const run = this.run; return run.waiting ? 0 : run.paused ? run.remaining : run.endAt - Date.now(); },
  closeRing() { if (this.run && this.run.ring) { this.run.ring.close(); this.run.ring = null; } },

  /* The step's time is up: ring the alarm and wait for the person to press "Next step". */
  finishStep() {
    const run = this.run, r = run.routine, last = run.idx >= r.steps.length - 1;
    run.waiting = true;
    const step = r.steps[run.idx], nxt = r.steps[run.idx + 1];
    run.ring = last
      ? App.ring({ icon: '✅', title: r.name + ' complete', text: 'Last step "' + step.name + '" is done. All ' + r.steps.length + ' steps finished.', tune: r.sound || 'Radar',
          buttons: [{ label: 'Finish', onClick: () => { this.run.ring = null; this.stop(); Sound.fanfare(); } }] })
      : App.ring({ icon: '⏰', title: step.name + ' is done', text: 'Up next: ' + nxt.name + ' (' + nxt.minutes + ' min)', tune: r.sound || 'Radar',
          buttons: [{ label: 'Next step', onClick: () => { this.run.ring = null; this.next(); } },
                    { label: 'Stop routine', primary: false, onClick: () => { this.run.ring = null; this.stop(); } }] });
    this.renderRunner();
  },

  /* Start the next step (also used by the Next step button on the page). */
  next() {
    const run = this.run; if (!run) return;
    this.closeRing();
    if (run.idx >= run.routine.steps.length - 1) { this.stop(); Sound.fanfare(); return; }
    run.idx++;
    run.waiting = false; run.paused = false;
    run.endAt = Date.now() + run.routine.steps[run.idx].minutes * 60000;
    Sound.chime();
    App.toast('Started: ' + run.routine.steps[run.idx].name, 'good');
    this.renderRunner();
  },
  togglePause() {
    const run = this.run; if (!run || run.waiting) return;
    if (run.paused) { run.endAt = Date.now() + run.remaining; run.paused = false; }
    else { run.remaining = run.endAt - Date.now(); run.paused = true; }
    this.renderRunner();
  },
  stop() { this.closeRing(); this.run = null; this.renderRunner(); },

  renderRunner() {
    const box = App.$('routine-runner');
    const strip = App.$('now-strip');
    if (!this.run) { box.hidden = true; strip.hidden = true; return; }
    const { routine, idx, waiting, paused } = this.run;
    const last = idx >= routine.steps.length - 1;
    box.hidden = false;
    box.replaceChildren(
      App.el('div', { class: 'muted', text: routine.name + ' · step ' + (idx + 1) + ' of ' + routine.steps.length }),
      App.el('div', { class: 'runner-step', text: routine.steps[idx].name }),
      App.el('div', { id: 'runner-time', class: 'runner-time', text: '--:--' }),
      waiting ? App.el('div', { class: 'runner-done', text: last ? 'All done' : 'Step complete. Press Next step when you are ready.' }) : null,
      App.el('div', { class: 'progress' }, App.el('div', { id: 'runner-bar', class: 'progress-bar' })),
      App.el('div', { class: 'steps-track' }, routine.steps.map((s, i) =>
        App.el('span', { class: 'pill ' + (i < idx || (i === idx && waiting) ? 'done' : i === idx ? 'now' : ''), text: s.name }))),
      App.el('div', { class: 'row center' },
        waiting ? null : App.el('button', { class: 'btn', text: paused ? 'Resume' : 'Pause', onclick: () => this.togglePause() }),
        App.el('button', { class: 'btn' + (waiting ? ' primary' : ''), text: last ? 'Finish' : 'Next step', onclick: () => this.next() }),
        App.el('button', { class: 'btn', text: 'Stop routine', onclick: () => this.stop() })));
  },

  tick() {
    const run = this.run;
    if (!run) return;
    if (!run.waiting && !run.paused && run.endAt - Date.now() <= 0) { this.finishStep(); return; }
    const ms = this.stepMs();
    const step = run.routine.steps[run.idx];
    const t = App.$('runner-time'), bar = App.$('runner-bar'), strip = App.$('now-strip');
    if (t) t.textContent = App.fmtDur(ms);
    if (bar) bar.style.width = (run.waiting ? 100 : 100 - Math.max(0, ms) / (step.minutes * 60000) * 100) + '%';
    strip.hidden = false;
    strip.textContent = run.waiting ? '⏰ ' + step.name + ' done' : '🔄 ' + step.name + ' · ' + App.fmtDur(ms).replace(/^00:/, '');
  }
};
App.register(Routines);
