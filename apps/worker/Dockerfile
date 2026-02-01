# Build stage
FROM node:20-alpine AS builder

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/queue/package.json ./packages/queue/
COPY packages/logger/package.json ./packages/logger/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY tsconfig.json ./

# Generate Prisma client
RUN pnpm --filter @gitxflow/database prisma:generate

# Build all packages
RUN pnpm turbo build --filter=worker

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/packages/queue/dist ./packages/queue/dist
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/

ENV NODE_ENV=production

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
