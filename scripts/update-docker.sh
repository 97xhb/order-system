#!/bin/sh
# 更新已经部署好的系统，不会删除数据库数据卷。
#
# 用法（在项目目录内执行）：
#   sh scripts/update-docker.sh
#
# 会依次完成：拉取最新源码 → 重新构建镜像 → 滚动重启容器 → 输出状态。
# 数据库、加密 Key 和 .env.docker 都不会被覆盖。
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env.docker ]; then
  echo '未找到 .env.docker。首次部署请先执行：' >&2
  echo '  cp .env.docker.example .env.docker' >&2
  echo '然后填写里面的数据库密码、数据加密 Key 和管理员初始密码。' >&2
  exit 1
fi

if [ -d .git ] && command -v git >/dev/null 2>&1; then
  echo '==> 拉取最新源码'
  git pull --ff-only
else
  echo '==> 未检测到 git 仓库，跳过源码拉取（将直接用当前目录构建）'
fi

echo '==> 构建镜像'
docker compose --env-file .env.docker build --pull

echo '==> 重启容器'
docker compose --env-file .env.docker up -d

echo '==> 等待健康检查'
attempt=1
while [ "$attempt" -le 60 ]; do
  if docker compose --env-file .env.docker ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^web$'; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

docker compose --env-file .env.docker ps

echo
echo '更新完成。数据库迁移已在 API 容器启动时自动执行。'
