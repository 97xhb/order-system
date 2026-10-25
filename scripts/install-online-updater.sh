#!/bin/bash
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 运行此脚本" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="order-system-online-updater.service"
UNIT_PATH="/etc/systemd/system/$SERVICE_NAME"
RUNTIME_DIR="$(docker volume inspect order-system_runtime_data --format '{{.Mountpoint}}')"

cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Order System Host Online Updater
After=docker.service
Requires=docker.service

[Service]
Type=simple
Environment=PROJECT_DIR=$PROJECT_DIR
Environment=RUNTIME_DIR=$RUNTIME_DIR
ExecStart=/bin/bash $PROJECT_DIR/scripts/online-updater.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
