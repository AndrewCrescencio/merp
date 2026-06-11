FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev
EXPOSE 3000
ENV NODE_ENV=development
CMD ["pnpm", "dev"]

FROM base AS build
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN pnpm build

FROM base AS prod
COPY --from=build /app/.output /app/.output
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", ".output/server/index.mjs"]
