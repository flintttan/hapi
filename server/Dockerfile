FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace files
COPY package.json bun.lock tsconfig.base.json ./
COPY cli ./cli
COPY shared ./shared
COPY server ./server
COPY web ./web
COPY website ./website
COPY docs ./docs

# Install dependencies
RUN bun install --frozen-lockfile

# Build web assets
WORKDIR /app/web
RUN bun run build

# Generate embedded web assets
WORKDIR /app/server
RUN bun run generate:embedded-web-assets

# Build server
RUN bun run build

FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Copy built server
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set environment
ENV NODE_ENV=production
ENV WEBAPP_PORT=3006
ENV HAPI_HOME=/data

# Create data directory
RUN mkdir -p /data

EXPOSE 3006

CMD ["bun", "run", "dist/index.js"]
