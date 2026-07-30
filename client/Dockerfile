FROM node:22 AS builder

WORKDIR /app

ARG VITE_SERVER_HOST
ARG VITE_NODE_ENV
ARG VITE_VERBOSE
ARG VITE_BUG_REPORT_URL
ARG VITE_SENTRY_DSN
ARG VITE_DISCORD_SERVER_INVITE_URL
ENV VITE_SERVER_HOST=$VITE_SERVER_HOST
ENV VITE_NODE_ENV=$VITE_NODE_ENV
ENV VITE_VERBOSE=$VITE_VERBOSE
ENV VITE_BUG_REPORT_URL=$VITE_BUG_REPORT_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_DISCORD_SERVER_INVITE_URL=$VITE_DISCORD_SERVER_INVITE_URL

# Context should be repository root
COPY common/package*.json ./common/
COPY client/package*.json ./client/

WORKDIR /app/common
RUN npm install

WORKDIR /app/client
RUN npm install

WORKDIR /app
COPY common/ ./common/
COPY client/ ./client/

# Include server types, but only for reference
COPY server/src/types.ts ./server/src/types.ts
RUN sed -i '1i // @ts-nocheck' ./server/src/types.ts

WORKDIR /app/client
RUN npm run build

# Production stage
FROM nginx:stable-alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]