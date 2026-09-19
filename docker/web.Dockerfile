FROM node:24-bookworm-slim AS base

ENV COREPACK_HOME=/pnpm \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN mkdir -p /pnpm \
    && corepack enable \
    && corepack install --global pnpm@11.21.0

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages packages

RUN pnpm --filter @order-system/web build

FROM caddy:2-alpine AS runtime

EXPOSE 8190

COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv
