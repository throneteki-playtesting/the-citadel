FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY common/package*.json ./common/
COPY server/package*.json ./server/

WORKDIR /app/common
RUN npm install --omit=dev

WORKDIR /app/server
RUN npm install --omit=dev

WORKDIR /app
COPY common/ ./common/
COPY server/ ./server/

EXPOSE 8080

WORKDIR /app/server
CMD ["node", "--import", "tsx", "./src/app.ts"]