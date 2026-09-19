#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

if [ -f .env.docker ]; then
  printf '%s' '.env.docker 已存在。输入 OVERWRITE 覆盖，其他输入退出: '
  read -r overwrite
  if [ "$overwrite" != 'OVERWRITE' ]; then
    echo '已保留现有配置。'
    exit 0
  fi
fi

default_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
if [ -n "$default_ip" ]; then
  default_origin="http://${default_ip}:8191"
else
  default_origin='http://NAS_IP:8191'
fi

printf '系统访问地址 [%s]: ' "$default_origin"
read -r web_origin
web_origin="${web_origin:-$default_origin}"

origin_host="$(printf '%s' "$web_origin" | sed -E 's#^[A-Za-z]+://##; s#/.*$##; s#:[0-9]+$##')"
if [ -n "$origin_host" ]; then
  default_hosts="${origin_host},localhost"
else
  default_hosts='localhost'
fi

printf '域名白名单，多个用英文逗号分隔 [%s]: ' "$default_hosts"
read -r allowed_hosts
allowed_hosts="${allowed_hosts:-$default_hosts}"

postgres_password="$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')"
encryption_key="$(od -An -N 32 -tx1 /dev/urandom | tr -d ' \n')"

# The administrator chooses the initial password.  It is read without echoing
# so the setup script never prints the password to the terminal or to logs.
read_secret() {
  secret_prompt="$1"
  printf '%s' "$secret_prompt" >&2
  stty_state=''
  if [ -t 0 ] && [ -t 1 ]; then
    stty_state="$(stty -g 2>/dev/null || true)"
    stty -echo 2>/dev/null || true
  fi
  IFS= read -r secret_value
  if [ -n "$stty_state" ]; then
    stty "$stty_state" 2>/dev/null || true
  fi
  printf '\n' >&2
  REPLY="$secret_value"
}

while :; do
  read_secret '请输入管理员初始密码（至少 6 位）： '
  admin_password="$REPLY"
  if [ "${#admin_password}" -lt 6 ]; then
    echo '管理员初始密码至少需要 6 个字符，请重新输入。' >&2
    continue
  fi

  read_secret '请再次输入管理员初始密码： '
  admin_password_confirmation="$REPLY"
  if [ "$admin_password" != "$admin_password_confirmation" ]; then
    echo '两次输入的管理员初始密码不一致，请重新输入。' >&2
    continue
  fi
  break
done

# Compose env files support single-quoted values.  Escape a quote so a
# user-chosen password can contain punctuation without corrupting the file.
escape_env_single_quotes() {
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
}

admin_password_env="$(escape_env_single_quotes "$admin_password")"

case "$web_origin" in
  https://*) cookie_secure='true' ;;
  *) cookie_secure='false' ;;
esac

cat > .env.docker <<EOF
COMPOSE_PROJECT_NAME=order-system
WEB_BIND_ADDRESS=0.0.0.0
WEB_HOST_PORT=8191
WEB_ORIGIN=${web_origin}
INITIAL_ALLOWED_HOSTS=${allowed_hosts}

POSTGRES_DB=order_system
POSTGRES_USER=order_app
POSTGRES_PASSWORD=${postgres_password}

API_PORT=3000
TRUST_PROXY=172.30.0.0/24
DATA_ENCRYPTION_KEY=${encryption_key}

ADMIN_USERNAME=admin
ADMIN_DISPLAY_NAME=管理员
ADMIN_INITIAL_PASSWORD='${admin_password_env}'
ADMIN_SESSION_TTL_DAYS=30
ADMIN_SESSION_COOKIE=order_admin_session
ADMIN_ENTRY_TTL_DAYS=30
ADMIN_ENTRY_COOKIE=order_admin_entry
ADMIN_COOKIE_SECURE=${cookie_secure}

EXTERNAL_SESSION_TTL_DAYS=365
EXTERNAL_SESSION_COOKIE=order_external_session
EXTERNAL_COOKIE_SECURE=${cookie_secure}
LOCAL_RUNTIME_STATE_PATH=/var/lib/order-system/runtime-control.json
EOF

chmod 600 .env.docker

echo
echo '飞牛 Docker 环境配置已生成：'
echo "访问地址：${web_origin}"
echo '管理员账号：admin'
echo '管理员初始密码：已按你的输入写入 .env.docker（终端不显示密码）'
echo
echo '请立即把 .env.docker 和你设置的初始密码保存到安全位置。'
echo '下一步执行：'
echo 'docker compose --env-file .env.docker up -d --build'
