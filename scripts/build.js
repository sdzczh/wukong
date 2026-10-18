#!/usr/bin/env node
/* 构建脚本：把 index.html 里的全部 <script> 按原顺序合并成单一 bundle，输出到 dist/。
   —— 目的：生产部署减少请求数（跨境拥塞下 40+ 个请求 ≈ 40+ 个串行 RTT；合并后冷加载仅 3 个请求：html/css/bundle）。
   本地开发不动源文件，仍直接打开 index.html（无构建步骤）。

   合并语义（为什么直接拼接是安全的）：
   1) 各文件顶层 const/function 在「单个 <script>」里同样声明于全局词法环境，跨文件可见性与分文件加载完全一致；
   2) 顶层声明查重（合并后重复 const/function 会造成整包语法错误）在构建期强制校验；
   3) 不预置全局 'use strict'：核心源文件本就一半有一半没有，保持各自现状即可——
      中段的 'use strict' 退化为空语句，无副作用；
   4) 每个文件前插入 /* ===== 路径 ===== *\/ 分隔注释，线上报错栈仍可定位到源文件。

   用法：node scripts/build.js [输出目录]   （默认 dist，目录会被清空重建） */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, process.argv[2] || 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* 1) 抽取 <script src>（按出现顺序）；校验缓存戳一致 */
const srcs = [...html.matchAll(/<script src="(js\/[^"?]+\.js)\?v=([0-9a-z]+)"><\/script>/g)].map(m => [m[1], m[2], m[0]]);
if (srcs.length < 10) { console.error('构建失败：<script> 标签抽取数量异常（' + srcs.length + '）'); process.exit(1); }
const stamps = new Set(srcs.map(s => s[1]));
if (stamps.size !== 1) { console.error('构建失败：缓存戳不一致 ' + [...stamps].join(', ')); process.exit(1); }
const stamp = srcs[0][1];

/* 2) 顶层声明查重：合并进同一脚本作用域后，重复的顶层 const/let/function 会让整包抛语法错误 */
const decl = new Map();
for (const [file] of srcs) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  for (const d of code.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (decl.has(d[1])) {
      console.error(`构建失败：顶层声明重复「${d[1]}」—— ${file} 与 ${decl.get(d[1])}`);
      process.exit(1);
    }
    decl.set(d[1], file);
  }
}

/* 3) 重建输出目录：index.html + css + assets + 合并后的 js/bundle.js */
fs.rmSync(outDir, { recursive: true, force: true });
for (const d of ['js', 'css']) fs.mkdirSync(path.join(outDir, d), { recursive: true });
fs.copyFileSync(path.join(root, 'css/style.css'), path.join(outDir, 'css/style.css'));
fs.cpSync(path.join(root, 'assets'), path.join(outDir, 'assets'), { recursive: true });

let total = 0;
const parts = [];
for (const [file] of srcs) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  total += code.length;
  parts.push(`/* ===== ${file} ===== */\n${code}`);
}
/* 文件间插 "\n;\n"：防上一文件末行注释吞掉下一文件首行（; 为无害空语句） */
const bundle = parts.join('\n;\n');
fs.writeFileSync(path.join(outDir, 'js/bundle.js'), bundle);

/* 4) 改写 index.html：整段 script 标签替换为单一 bundle 引用 */
const firstTag = srcs[0][2], lastTag = srcs[srcs.length - 1][2];
const i = html.indexOf(firstTag), j = html.lastIndexOf(lastTag);
if (i < 0 || j < 0 || j < i) { console.error('构建失败：script 标签定位异常'); process.exit(1); }
fs.writeFileSync(path.join(outDir, 'index.html'),
  html.slice(0, i) + `<script src="js/bundle.js?v=${stamp}"></script>` + html.slice(j + lastTag.length));

console.log(`构建完成 → ${path.relative(root, outDir)}`);
console.log(`  脚本 ${srcs.length} 个 → bundle.js（${(bundle.length / 1024).toFixed(0)}KB，源码合计 ${(total / 1024).toFixed(0)}KB）`);
console.log(`  缓存戳 ${stamp}｜输出：index.html / css / assets / js/bundle.js`);
