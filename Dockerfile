FROM node:20-alpine AS build

WORKDIR /workspace/0g-provider-revenue-sync

COPY package.json package-lock.json ./
RUN npm ci

COPY frontend ./frontend
COPY src ./src
COPY vite.config.js ./
RUN npm run build:web

FROM node:20-alpine AS runtime

WORKDIR /workspace/0g-provider-revenue-sync

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY sql ./sql
COPY deployments ./deployments
COPY .env.example ./.env.example
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=build /workspace/0g-provider-revenue-sync/web ./web

RUN chmod +x docker-entrypoint.sh

EXPOSE 3200

CMD ["./docker-entrypoint.sh"]
