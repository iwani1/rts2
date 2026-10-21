# D-092/7A: production image. Build:  podman compose build app
# The builder stage runs the real Prisma generate (engine download) and
# `next build` with inert build-only env values; no real secret is baked.
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    APP_URL="http://localhost:3000" \
    AUTH_SECRET="build-only-secret-that-is-long-enough-32chars"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
