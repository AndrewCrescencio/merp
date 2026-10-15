# syntax=docker/dockerfile:1.7

# ---- Base ----
FROM node:24-alpine AS base

WORKDIR /app

# package-lock.json entra junto: `npm ci` é determinístico a partir dele (o
# npm embutido na node:24-alpine lê lockfileVersion 3 sem problema).
COPY package.json package-lock.json* ./

# ---- Build ----
FROM base AS build

ARG CORS_ORIGIN
ENV CORS_ORIGIN=${CORS_ORIGIN}

RUN npm ci

COPY . .

RUN npm run build

# ---- Production ----
FROM node:24-alpine AS production

RUN addgroup -g 1001 -S appgroup \
 && adduser -S -D -H -u 1001 -G appgroup appuser

WORKDIR /app

COPY --from=build --chown=appuser:appgroup /app/.output /app/.output

ENV NODE_ENV=production
ENV PORT=3000

# AUD-11 (hardening): nunca root — uid/gid fixos (1001, appuser) e .output de
# propriedade do próprio usuário; o conteúdo é só lido, nada é escrito em /app.
# UID/GID numéricos: o kernel não depende de /etc/passwd na hora de validar.
USER 1001:1001

EXPOSE 3000

# /api/health/live é público e sempre responde 200 sem depender de DB
# (server/api/health/live.get.ts); `/` redireciona para /auth e deixaria o
# container sempre "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", ".output/server/index.mjs"]
