# Multi-stage build for the NestJS API within the pnpm monorepo.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── Install dependencies (cached on lockfile) ─────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/sport-engine/package.json packages/sport-engine/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
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
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
