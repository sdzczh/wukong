#!/bin/bash
# 无敌悟空 · 文字塔防 —— 部署到 43.99.15.109（80 端口）
# 用法：在本机项目根目录执行  bash scripts/deploy-80.sh
# 已配 SSH 免密（root@43.99.15.109），全程约 30 秒。
set -euo pipefail

HOST=root@43.99.15.109
SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "==> 1/4 上传游戏文件到 /opt/wukong-td"
tar czf - index.html css js assets 设计文档.md | $SSH "$HOST" '
  mkdir -p /opt/wukong-td &&
  tar xzf - -C /opt/wukong-td &&
  chmod -R a+rX /opt/wukong-td &&
  ls /opt/wukong-td
'

echo "==> 2/4 配置 systemd 服务（端口 80）"
$SSH "$HOST" 'PY3=$(command -v python3); cat > /etc/systemd/system/wukong-td.service <<EOF
[Unit]
Description=Wukong TD static site on 80
After=network.target

[Service]
ExecStart=/bin/sh -c "cd /opt/wukong-td && exec $PY3 -m http.server 80 --bind 0.0.0.0"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now wukong-td && sleep 1 && systemctl is-active wukong-td'

echo "==> 3/4 防火墙放行 80（如有 firewalld）"
$SSH "$HOST" '(firewall-cmd --state >/dev/null 2>&1 && firewall-cmd --permanent --add-port=80/tcp && firewall-cmd --reload && echo fw-opened) || echo no-firewalld-skip'

echo "==> 4/4 内网自测"
$SSH "$HOST" 'curl -s -o /dev/null -w "index:%{http_code} " http://127.0.0.1/ ; curl -s -o /dev/null -w "woff2:%{http_code}\n" http://127.0.0.1/assets/msz.subset.woff2'

echo
echo "完成。外网验收：curl -I http://43.99.15.109/"
