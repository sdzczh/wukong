# 无敌悟空（文字塔防）

文字合成塔防游戏（H5）。地府题材：抽字召唤、相邻合成神将、镇守奈何桥，抵御幽魂进攻轮回殿；局外魂晶 + 天赋树永久成长。

> 当前状态：**开发中（M1 战斗原型）**。设计方案见 [设计文档.md](设计文档.md)（v0.2 已审定）。

## 玩法一句话

消耗蟠桃召唤汉字字块，把字块摆上棋盘；两个特定的字相邻即合成神话神将（嫦+娥→嫦娥），同名字相邻则升级；字塔与神塔自动攻击沿路径进军的幽魂，守住右侧轮回殿。每局结算魂晶，在主菜单「修炼」天赋树中永久强化。

## 运行方式

无构建步骤，直接用浏览器打开 `index.html` 即可；或任意静态服务器托管。

## 技术栈

原生 JavaScript + Canvas 2D（渲染）+ DOM Overlay（面板），无第三方依赖，可平滑移植微信小游戏。

## 目录

```
塔防_qoder/
├── index.html            # 画布 + HUD DOM 骨架
├── css/style.css
├── js/
│   ├── main.js           # 引导、主循环、输入、渲染
│   ├── config.js         # ★ 全部数值
│   ├── rng.js            # 随机与抽字池
│   ├── save.js           # 存档
│   ├── audio.js          # WebAudio 合成音效
│   ├── state.js          # 状态机 + 事件总线
│   ├── grid.js           # 棋盘 / 路径
│   ├── talent.js         # 天赋树（M4）
│   ├── battle/           # director / enemy / tower / general / projectile / skill
│   └── ui/               # hud / card / panels / fx
└── assets/               # 素材（M5：背景图、字体子集、图标）
```
