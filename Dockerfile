# ── Base ──────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package*.json ./

# ── Development ───────────────────────────────────────────
FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["dumb-init", "npm", "run", "dev"]

# ── Builder (install prod deps only) ─────────────────────
FROM base AS builder
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force

# ── Production ────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && adduser -S khalto -u 1001
RUN apk add --no-cache dumb-init

# Copy only what's needed
COPY --from=builder --chown=khalto:nodejs /app/node_modules ./node_modules
COPY --chown=khalto:nodejs . .

USER khalto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["dumb-init", "node", "src/index.js"]
