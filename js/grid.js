/* 棋盘模型：格子、路径、坐标换算 */
const Grid = {
  cols: CONFIG.board.cols,
  rows: CONFIG.board.rows,
  tile: 56, ox: 0, oy: 0,
  tiles: [],            // tiles[r][c] = {type, tower}
  pathPx: [],           // 路径拐点像素坐标
  segLen: [], totalLen: 0,

  init() { this.buildTiles(); },

  buildTiles() {
    const river = new Set(CONFIG.board.riverRows);
    // 路径格集来自每局随机的路线拐点（见 main.js rollRoute）
    const pathSet = new Set();
    for (let r = 0; r <= CONFIG.board.bridgeRow; r++) pathSet.add(CONFIG.pathCells[0][0] + ',' + r);   // 入口廊
    for (let c = 0; c < this.cols; c++) pathSet.add(c + ',' + CONFIG.board.bridgeRow);                   // 冥河横渡（踏石）
    for (let r = CONFIG.board.bridgeRow; r < this.rows; r++) pathSet.add(CONFIG.pathCells[2][0] + ',' + r); // 出口廊
    this.tiles = [];
    const landKeys = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        let type;
        if (pathSet.has(c + ',' + r)) type = 'path';
        else if (river.has(r)) type = 'river';
        else type = ((r * 7 + c * 13) % 5 === 0) ? 'white' : 'purple';
        const land = (type === 'white' || type === 'purple');
        row.push({ type, tower: null, locked: land });
        if (land) landKeys.push(c + ',' + r);
      }
      this.tiles.push(row);
    }
    // 随机开放开局地块：nearOpen 格贴近路径（车比雪夫距离 ≤2），其余全图随机
    const near = [], far = [];
    for (const key of landKeys) {
      const [c, r] = key.split(',').map(Number);
      let d = 99;
      for (const p of pathSet) {
        const [pc, pr] = p.split(',').map(Number);
        const dd = Math.max(Math.abs(pc - c), Math.abs(pr - r));
        if (dd < d) d = dd;
      }
      (d <= 2 ? near : far).push(key);
    }
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = RNG.int(i + 1);[a[i], a[j]] = [a[j], a[i]]; } };
    shuffle(near); shuffle(far);
    const openSet = new Set();
    for (let i = 0; i < CONFIG.field.nearOpen && i < near.length; i++) openSet.add(near[i]);
    for (let i = 0; openSet.size < CONFIG.field.startOpen && i < far.length; i++) openSet.add(far[i]);
    for (const key of openSet) {
      const [c, r] = key.split(',').map(Number);
      this.tiles[r][c].locked = false;
    }
  },

  /* 依据画布尺寸布局（逻辑坐标） */
  layout() {
    const W = CONFIG.logicalW, H = CONFIG.logicalH;
    const availW = W - 56;
    const availH = H - CONFIG.hudTopH - CONFIG.hudBottomH - 28;
    this.tile = Math.floor(Math.min(availW / this.cols, availH / this.rows));
    this.ox = Math.round((W - this.tile * this.cols) / 2);
    this.oy = Math.round(CONFIG.hudTopH + (availH - this.tile * this.rows) / 2);
    this.buildPath();
  },

  buildPath() {
    this.pathPx = CONFIG.pathCells.map(([c, r]) => this.center(c, r));
    this.segLen = []; this.totalLen = 0;
    for (let i = 0; i < this.pathPx.length - 1; i++) {
      const l = Math.hypot(this.pathPx[i + 1].x - this.pathPx[i].x, this.pathPx[i + 1].y - this.pathPx[i].y);
      this.segLen.push(l); this.totalLen += l;
    }
  },

  center(c, r) { return { x: this.ox + (c + 0.5) * this.tile, y: this.oy + (r + 0.5) * this.tile }; },

  cellAt(x, y) {
    const c = Math.floor((x - this.ox) / this.tile), r = Math.floor((y - this.oy) / this.tile);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return null;
    return { c, r };
  },

  /* 沿路径走 s 像素 → 位置与朝向 */
  posAt(s) {
    let rest = s;
    for (let i = 0; i < this.segLen.length; i++) {
      if (rest <= this.segLen[i]) {
        const a = this.pathPx[i], b = this.pathPx[i + 1];
        const t = rest / this.segLen[i];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      rest -= this.segLen[i];
    }
    const last = this.pathPx[this.pathPx.length - 1];
    return { x: last.x, y: last.y, angle: Math.PI / 2 };
  },

  inBounds(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; },

  placeable(c, r) {
    if (!this.inBounds(c, r)) return false;
    const t = this.tiles[r][c];
    return (t.type === 'purple' || t.type === 'white') && !t.tower && !t.locked;
  },

  /* 仍被锁定的地块（开垦候选） */
  lockedCells() {
    const out = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.tiles[r][c].locked) out.push({ c, r });
    return out;
  },
};
