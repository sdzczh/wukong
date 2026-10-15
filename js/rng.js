/* 随机数：mulberry32 + 加权抽取 */
const RNG = (() => {
  let s = (Date.now() >>> 0) || 1;
  function seed(v) { s = (v >>> 0) || 1; }
  function next() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function int(n) { return Math.floor(next() * n); }
  /* pairs: [[key, weight], ...] */
  function pickWeighted(pairs) {
    let total = 0;
    for (const p of pairs) total += p[1];
    let r = next() * total;
    for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }
  return { seed, next, int, pickWeighted };
})();
