/*
 * Frontend-only storage. Same methods the Java version used (list, add, update,
 * remove, get) but everything lives in the browser's localStorage, so the app
 * works by simply opening index.html.
 */
const Api = {
  mem: null,
  db() {
    if (this.mem) return this.mem;
    try { this.mem = JSON.parse(localStorage.getItem('sc.db')) || {}; } catch (e) { this.mem = {}; }
    return this.mem;
  },
  save() { try { localStorage.setItem('sc.db', JSON.stringify(this.mem)); } catch (e) { /* keep in memory */ } },
  col(c) { const d = this.db(); return d[c] || (d[c] = []); },
  id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  async list(c) { return JSON.parse(JSON.stringify(this.col(c))); },
  async add(c, o) { const x = { ...o, id: this.id() }; this.col(c).push(x); this.save(); return x; },
  async update(c, id, o) {
    const a = this.col(c), i = a.findIndex(x => x.id === id);
    if (i < 0) throw new Error('Not found');
    a[i] = { ...o, id }; this.save(); return a[i];
  },
  async remove(c, id) { const d = this.db(); d[c] = this.col(c).filter(x => x.id !== id); this.save(); return { deleted: id }; },

  /* Sleep-cycle planner: 90-minute cycles plus 15 minutes to fall asleep. */
  async get(url) {
    const u = new URL(url, 'http://x');
    const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fmt = n => { n = ((n % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
    const opt = (c, t, key) => {
      const mins = c * 90;
      return { cycles: c, [key]: fmt(t), sleepMinutes: mins, sleepLabel: Math.floor(mins / 60) + 'h' + (mins % 60 ? ' ' + (mins % 60) + 'm' : ''),
               quality: c >= 5 ? 'Best' : c === 4 ? 'Okay' : 'Short' };
    };
    if (u.pathname === '/api/sleep/bedtimes') {
      const wake = hm(u.searchParams.get('wake'));
      return [6, 5, 4, 3].map(c => opt(c, wake - c * 90 - 15, 'bedtime'));
    }
    if (u.pathname === '/api/sleep/waketimes') {
      const bed = hm(u.searchParams.get('bed'));
      return [3, 4, 5, 6].map(c => opt(c, bed + 15 + c * 90, 'wake'));
    }
    throw new Error('Unknown request');
  }
};
