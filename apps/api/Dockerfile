# Multi-stage build for the NestJS API within the pnpm monorepo.
# Build context must be the repo root (see .dockerignore there).
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
# Manifests first so the pnpm install layer caches unless the lockfile changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/sport-engine/package.json packages/sport-engine/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
# Full source (node_modules et al. excluded via .dockerignore so the installed
# workspace links above survive this overlay).
COPY . .
RUN pnpm --filter @bleachers/types build \
  && pnpm --filter @bleachers/sport-engine build \
  && pnpm --filter @bleachers/api prisma:generate \
  && pnpm --filter @bleachers/api build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
