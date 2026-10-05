FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN npm install -g pnpm@11.7.0

WORKDIR /app

FROM base AS builder
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @sos-sales/worker... build -- --no-dts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app /app

CMD ["node", "apps/worker/dist/index.js"]
