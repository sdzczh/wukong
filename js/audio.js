/* WebAudio 程序合成音效（零素材） */
const SFX = {
  ctx: null,
  bgm: null,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.startBgm();
  },

  /* 地府氛围底噪：A1+E2 低鸣 + 微失谐高八度，慢速呼吸 LFO，常驻循环 */
  startBgm() {
    if (!this.ctx || this.bgm) return;
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.41;
    const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110; o3.detune.value = 6;
    const g3 = c.createGain(); g3.gain.value = 0.3;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 0.018;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    o1.connect(g); o2.connect(g); o3.connect(g3); g3.connect(g);
    g.connect(lp); lp.connect(c.destination);
    o1.start(); o2.start(); o3.start(); lfo.start();
    this.bgm = { g };
    this.refreshBgm();
  },

  /* 跟随音效开关：开 → 低音量常驻，关 → 淡出 */
  refreshBgm() {
    if (!this.bgm || !this.ctx) return;
    const target = Save.data.sound ? 0.05 : 0.0001;
    this.bgm.g.gain.setTargetAtTime(target, this.ctx.currentTime, 1.0);
  },
  tone(freq, dur, type, vol, slide) {
    if (!Save.data.sound || !this.ctx) return;
    type = type || 'sine'; vol = vol || 0.12; slide = slide || 0;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol) {
    if (!Save.data.sound || !this.ctx) return;
    dur = dur || 0.08; vol = vol || 0.1;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.ctx.destination);
    src.start();
  },
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.tone(660, 0.06, 'square', 0.07); break;
      case 'place': this.tone(440, 0.08, 'triangle', 0.12, 120); break;
      case 'shoot': this.tone(540, 0.08, 'triangle', 0.08, -280); break;
      case 'hit':   this.noise(0.05, 0.07); break;
      case 'die':   this.tone(300, 0.14, 'sawtooth', 0.07, -180); break;
      case 'coin':  this.tone(880, 0.07, 'sine', 0.09);
                    setTimeout(() => this.tone(1318, 0.09, 'sine', 0.09), 60); break;
      case 'horn':  this.tone(392, 0.32, 'sawtooth', 0.10);
                    setTimeout(() => this.tone(523, 0.4, 'sawtooth', 0.10), 180); break;
      case 'leak':  this.tone(160, 0.28, 'square', 0.10, -60); break;
      case 'lose':  this.tone(220, 0.6, 'sawtooth', 0.12, -140); break;
      case 'win':   [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.11), i * 120)); break;
      case 'summon': this.tone(720, 0.08, 'sine', 0.10, 240);
                    setTimeout(() => this.tone(1080, 0.1, 'sine', 0.08), 70); break;
      case 'merge': [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.1, 'triangle', 0.10), i * 60)); break;
      case 'levelup': [523, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.11), i * 80)); break;
      case 'sell':  this.tone(880, 0.07, 'sine', 0.08);
                    setTimeout(() => this.tone(660, 0.09, 'sine', 0.07), 60); break;
      case 'skill': [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.tone(f, 0.1, 'triangle', 0.1), i * 50)); break;
      case 'waveclear': [659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.09), i * 90)); break;
      case 'god':   [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'sine', 0.10), i * 70)); break;
      case 'talent': this.tone(987, 0.08, 'sine', 0.09);
                    setTimeout(() => this.tone(1480, 0.12, 'sine', 0.09), 70); break;
      case 'danger': this.tone(196, 0.1, 'square', 0.07);
                    setTimeout(() => this.tone(196, 0.1, 'square', 0.06), 160); break;
      /* boss 波警报：三声下行汽笛 */
      case 'alarm': [880, 660, 440].forEach((f, i) =>
                      setTimeout(() => this.tone(f, 0.22, 'sawtooth', 0.10, -120), i * 190)); break;
    }
  },
};
