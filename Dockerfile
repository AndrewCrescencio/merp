FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./

FROM base AS build
ARG CORS_ORIGIN
ENV CORS_ORIGIN=${CORS_ORIGIN}
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM base AS production
COPY --from=build /app/.output /app/.output
ENV NODE_ENV=production
# AUD-11 (hardening): não rodar como root — o processo de runtime tem permissão
# mínima; .output é somente leitura (lido), nada é escrito em /app.
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
