/* Smart wakeup planner. The sleep-cycle maths is done by the Java server. */
const Wakeup = {
  async init() {
    App.$('wake-go').addEventListener('click', () => this.findBedtimes());
    App.$('wake-time').addEventListener('change', () => this.findBedtimes());
    await this.renderAll();
  },
  onShow(view) { if (view === 'wakeup') this.renderNow(); },

  async renderAll() { await this.findBedtimes(); await this.renderNow(); },

  card(opt, kind, timeKey) {
    const t = opt[timeKey];
    const actions = kind === 'bed'
      ? [App.el('button', { class: 'chip', text: 'Remind me', onclick: () => Alarms.add(t, 'Time to sleep', []) })]
      : [App.el('button', { class: 'chip', text: 'Set alarm', onclick: () => Alarms.add(t, 'Wake up', []) })];
    return App.el('div', { class: 'opt ' + opt.quality.toLowerCase() },
      App.el('div', { class: 'opt-time', text: App.fmtHM(t) }),
      App.el('div', { class: 'muted small', text: opt.cycles + ' cycles · ' + opt.sleepLabel.trim() + ' sleep' }),
      App.el('div', { class: 'opt-q', text: opt.quality }),
      actions);
  },

  async findBedtimes() {
    const wake = App.$('wake-time').value;
    if (!wake) return;
    try {
      const opts = await Api.get('/api/sleep/bedtimes?wake=' + encodeURIComponent(wake));
      const box = App.$('bed-results'); box.replaceChildren(...opts.map(o => this.card(o, 'bed', 'bedtime')));
      const alarmBtn = App.el('button', { class: 'btn primary wide', text: 'Set wake-up alarm for ' + App.fmtHM(wake), onclick: () => Alarms.add(wake, 'Wake up', [1, 2, 3, 4, 5, 6, 0]) });
      box.append(alarmBtn);
    } catch (e) { App.fail(e); }
  },

  async renderNow() {
    const now = App.now();
    const hhmm = App.pad(now.getHours()) + ':' + App.pad(now.getMinutes());
    App.$('bed-now').textContent = App.fmtHM(hhmm);
    try {
      const opts = await Api.get('/api/sleep/waketimes?bed=' + encodeURIComponent(hhmm));
      App.$('wake-results').replaceChildren(...opts.map(o => this.card(o, 'wake', 'wake')));
    } catch (e) { /* ignore */ }
  },

  plan(hhmm) { App.$('wake-time').value = hhmm; App.show('wakeup'); this.findBedtimes(); }
};
App.register(Wakeup);
