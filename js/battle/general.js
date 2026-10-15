/* 神将：带经验/等级的传说单位（继承 Tower 的攻击行为） */
class General extends Tower {
  constructor(key, col, row) {
    super(key, col, row);
    this.exp = 0;
  }

  /* 击杀经验：满 10 升级，最高 maxLevel */
  gainExp(n) {
    if (this.level >= this.maxLevel) return;
    this.exp += n;
    while (this.exp >= 10 && this.level < this.maxLevel) {
      this.exp -= 10;
      this.level++;
      FX.ring(this.x, this.y, Grid.tile * 0.9, CONFIG.rarityColors[this.def.rarity] || '#e8933c');
      FX.float('Lv' + this.level, this.x, this.y - Grid.tile * 0.7, '#ffd867', 17);
      SFX.play('levelup');
      Bus.emit('generalLevelUp', this);
    }
  }
}
