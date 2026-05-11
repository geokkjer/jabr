FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

COPY . .
RUN pnpm build

FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3001

CMD ["node", "dist/server/index.js"]
