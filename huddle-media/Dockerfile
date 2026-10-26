FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
# mediasoup falls back to a native build when no prebuilt worker is available.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
CMD ["node","src/index.js"]
