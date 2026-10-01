# ── Build stage: compile the SPA and the server ────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

# Dependency layer first so it caches independently of source changes.
# Build scripts are limited to the allowlist in pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Production dependencies: no devDependencies, no toolchain ──────────────
FROM node:24-alpine AS prod-deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Compiled server (dist/server) and built SPA (dist/), nothing else.
# package.json is required because the compiled output is ESM ("type": "module").
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./package.json

# Volumes are initialised from these directories, so they inherit node ownership
# and the unprivileged user can write the SQLite database and migrate books in.
RUN mkdir -p /app/data /app/books && chown -R node:node /app/data /app/books

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.JABR_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
