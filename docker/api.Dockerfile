FROM node:24-bookworm-slim AS base

ENV COREPACK_HOME=/pnpm \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /pnpm \
    && corepack enable \
    && corepack install --global pnpm@11.21.0

WORKDIR /app

FROM base AS dependencies

# 依赖源；访问官方源较慢时可设为 https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org/

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm config set registry "$NPM_REGISTRY" \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-timeout 600000 \
    && pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY apps/api apps/api
COPY packages packages

RUN pnpm --filter @order-system/api prisma:generate \
    && pnpm --filter @order-system/api build

FROM base AS runtime

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh

RUN mkdir -p /var/lib/order-system \
    && chown -R node:node /app /var/lib/order-system \
    && chmod -R a+rX /app \
    && chmod 755 /usr/local/bin/api-entrypoint.sh

USER node

ENTRYPOINT ["api-entrypoint.sh"]
