FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace files
COPY package.json bun.lock tsconfig.base.json ./
COPY cli ./cli
COPY shared ./shared
COPY hub ./hub
COPY web ./web
COPY website ./website
COPY docs ./docs

# Install dependencies
RUN bun install

# Build web assets
WORKDIR /app/web
RUN bun run build

# Generate embedded web assets
WORKDIR /app/hub
RUN bun run generate:embedded-web-assets

# Build hub
RUN bun run build

FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Copy built hub
COPY --from=builder /app/hub/dist ./dist
COPY --from=builder /app/hub/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist

# Set environment
ENV NODE_ENV=production
ENV HAPI_LISTEN_HOST=0.0.0.0
ENV HAPI_LISTEN_PORT=3006
ENV HAPI_HOME=/data

# Create data directory
RUN mkdir -p /data

EXPOSE 3006

CMD ["bun", "run", "dist/index.js"]
