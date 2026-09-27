# syntax=docker/dockerfile:1
# Образы api и worker. Цель runtime — http (APP_ROLE=api), цель worker — потребители очередей:
# им дополнительно нужны git (клонирование репозиториев) и LibreOffice + poppler (превью слайдов).
# Контекст сборки — корень монорепы: docker build -f infra/prod/api.Dockerfile --target runtime .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---- зависимости: слой кешируется, пока не меняются манифесты и lockfile
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY apps/api/package.json apps/api/
COPY apps/ml/package.json apps/ml/
COPY apps/cli/package.json apps/cli/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pm/api..."

# ---- сборка api и его workspace-зависимостей (shared, ml)
# этот же stage используется в compose для prisma migrate deploy
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/ml apps/ml
COPY apps/api apps/api
RUN pnpm --filter "@pm/api..." build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @pm/api deploy --prod /out

# ---- рантайм: только dist и prod-зависимости
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health | grep -q '"status":"ok"' || exit 1
CMD ["node", "dist/main.js"]

# ---- worker: то же приложение + git, LibreOffice Impress, poppler и шрифты с кириллицей для превью
FROM runtime AS worker
USER root
RUN apk add --no-cache git libreoffice-impress poppler-utils ttf-dejavu font-liberation
USER node
ENV APP_ROLE=worker
HEALTHCHECK NONE
