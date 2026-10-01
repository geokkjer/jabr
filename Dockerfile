# ── Build stage: SPA, bundled server, and the native-module closure ────────
FROM node:24-alpine AS build

WORKDIR /app

RUN corepack enable

# Dependency layer first so it caches independently of source changes.
# Build scripts are limited to the allowlist in pnpm-workspace.yaml.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# esbuild inlines every pure-JS dependency into dist/server/index.js, so the
# runtime image only needs the native better-sqlite3 module and the two tiny
# helpers it requires at load time. Copy them with -L so the pnpm symlinks in
# node_modules are resolved into real files.
RUN mkdir -p /runtime/node_modules \
 && cp -RL node_modules/better-sqlite3 /runtime/node_modules/ \
 && cp -RL node_modules/.pnpm/bindings@*/node_modules/bindings /runtime/node_modules/ \
 && cp -RL node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path /runtime/node_modules/

# Build-time-only payload: SQLite C sources, TS sources, object files.
RUN rm -rf /runtime/node_modules/better-sqlite3/deps \
           /runtime/node_modules/better-sqlite3/src \
           /runtime/node_modules/better-sqlite3/build/Release/obj.target

# Fail the build here rather than at first request if the native module
# cannot load from the assembled closure.
RUN cd /runtime \
 && node -e "const D=require('better-sqlite3');const db=new D(':memory:');db.exec('create table t(x)');db.prepare('insert into t values (1)').run();console.log('better-sqlite3 native module OK')"

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Bundled server + built SPA, the native module closure, and nothing else.
# package.json is required because the server bundle is ESM ("type": "module").
COPY --from=build /app/dist ./dist
COPY --from=build /runtime/node_modules ./node_modules
COPY package.json ./package.json

# Volumes are initialised from these directories, so they inherit node ownership
# and the unprivileged user can write the SQLite database and migrate books in.
RUN mkdir -p /app/data /app/books && chown -R node:node /app/data /app/books

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.JABR_PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
