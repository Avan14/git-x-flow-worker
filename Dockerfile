# Multi-stage build for optimized image size
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9.15.0

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Generate Prisma Client
RUN pnpm prisma generate

# Build the application
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN pnpm build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy built application
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /app/prisma ./prisma

USER worker

# Expose health check port
EXPOSE 8000

# Default to worker, can be overridden
CMD ["node", "dist/worker/index.js"]
