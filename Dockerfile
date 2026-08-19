# syntax=docker/dockerfile:1
# Один контейнер: собранный PWA раздаётся Fastify вместе с API.
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @tutu-plan-b/web build

FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV WEB_DIST_DIR=/app/apps/web/dist

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json

RUN pnpm install --frozen-lockfile --prod

COPY packages/domain packages/domain
COPY packages/test-fixtures packages/test-fixtures
COPY apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 3001
CMD ["pnpm", "--filter", "@tutu-plan-b/api", "start"]
