/* localStorage 存档 */
const Save = {
  KEY: 'wukong_tower_save_v1',
  data: null,
  defaults() {
    return {
      bestWave: 0, totalKills: 0, crystals: 0,
      sound: true,
      codex: {},                          // 神将图鉴点亮（M3）
      talents: { po: 0, zs: 0, cs: 0 },   // 三系已点层数（M4）
      wukongKills: 0,
    };
  },
  load() {
    try {
      this.data = Object.assign(this.defaults(), JSON.parse(localStorage.getItem(this.KEY)) || {});
    } catch (e) { this.data = this.defaults(); }
  },
  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
  },
};
