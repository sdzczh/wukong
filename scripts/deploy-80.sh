#!/bin/bash
# 无敌悟空 · 文字塔防 —— 部署到 43.99.15.109（80 端口）
# 用法：在本机项目根目录执行  bash scripts/deploy-80.sh
# 已配 SSH 免密（root@43.99.15.109），全程约 30 秒。
# 80 端口由 Node 单进程同时提供：静态站 + 风云榜 + 异步 PVP + 云存档 API。
set -euo pipefail

HOST=root@43.99.15.109
SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "==> 1/4 上传游戏文件与 server.js 到 /opt/wukong-td"
tar czf - index.html css js assets 设计文档.md server.js | $SSH "$HOST" '
  mkdir -p /opt/wukong-td /opt/wukong-td-api &&
  tar xzf - -C /opt/wukong-td &&
  chmod -R a+rX /opt/wukong-td &&
  ls /opt/wukong-td
'

echo "==> 2/4 配置 systemd 服务（Node：静态站 + 榜单/镇守/云存档 API）"
$SSH "$HOST" 'NODE=$(command -v node); test -n "$NODE" || { echo "node 未安装" >&2; exit 1; }; cat > /etc/systemd/system/wukong-td.service <<EOF
[Unit]
Description=Wukong TD static site + leaderboard API on 80
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/wukong-td
ExecStart=$NODE /opt/wukong-td/server.js
Environment=PORT=80
Environment=WK_ROOT=/opt/wukong-td
Environment=WK_DATA=/opt/wukong-td-api
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable wukong-td >/dev/null && systemctl restart wukong-td && sleep 1 && systemctl is-active wukong-td'

echo "==> 3/4 防火墙放行 80（如有 firewalld）"
$SSH "$HOST" '(firewall-cmd --state >/dev/null 2>&1 && firewall-cmd --permanent --add-port=80/tcp && firewall-cmd --reload && echo fw-opened) || echo no-firewalld-skip'

echo "==> 4/4 内网自测：静态文件 + 榜单/镇守/云存档 API"
$SSH "$HOST" 'curl -s -o /dev/null -w "index:%{http_code} " http://127.0.0.1/ ; curl -s -o /dev/null -w "woff2:%{http_code} " http://127.0.0.1/assets/msz.subset.woff2; curl -s "http://127.0.0.1/api/board?kind=daily" | head -c 90; echo; curl -s "http://127.0.0.1/api/pvp/list?name=%E9%AA%8C%E6%94%B6" | head -c 90; echo; curl -s -o /dev/null -w "cloud:%{http_code}\n" "http://127.0.0.1/api/cloud?code=BAD"'

echo
echo "完成。外网验收：curl -I http://43.99.15.109/ ；curl http://43.99.15.109/api/pvp/list ；curl -o /dev/null -w '%{http_code}' 'http://43.99.15.109/api/cloud?code=BAD'"
