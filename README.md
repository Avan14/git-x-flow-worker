# GitXFlow Worker Service

Production-grade Twitter scheduling worker service for GitXFlow. Handles scheduled posting, queue management, and reliable delivery of tweets using BullMQ + Redis.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitXFlow Worker Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐       │
│   │ Scheduler │ ───▶ │   Redis   │ ◀─── │  Worker   │       │
│   │  (Cron)   │      │  (Queue)  │      │(Processor)│       │
│   └───────────┘      └───────────┘      └───────────┘       │
│         │                                     │              │
│         │                                     │              │
│         ▼                                     ▼              │
│   ┌─────────────────────────────────────────────────┐       │
│   │              PostgreSQL (Shared)                 │       │
│   │   - ScheduledPost (job queue)                    │       │
│   │   - SocialConnection (OAuth tokens)              │       │
│   │   - RateLimitState (rate tracking)               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Redis (or Docker)
- PostgreSQL database

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd git-x-flow-worker

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Copy environment files
cp apps/worker/.env.example apps/worker/.env
cp apps/scheduler/.env.example apps/scheduler/.env

# Update .env files with your database and Redis connections
```

### Development

```bash
# Start Redis (using Docker)
docker compose up redis -d

# Run worker in dev mode
pnpm --filter worker dev

# Run scheduler in dev mode (in another terminal)
pnpm --filter scheduler dev
```

### Production

```bash
# Build all packages
pnpm build

# Start with Docker Compose
docker compose up -d

# Or run individually
pnpm start:worker
pnpm start:scheduler
```

## Project Structure

```
git-x-flow-worker/
├── apps/
│   ├── worker/          # Job processor service
│   │   ├── src/
│   │   │   ├── index.ts      # Entry point
│   │   │   ├── processor.ts  # Job processing logic
│   │   │   └── twitter.ts    # Twitter API client
│   │   └── Dockerfile
│   │
│   └── scheduler/       # Cron scheduler service
│       ├── src/
│       │   └── index.ts      # Cron jobs
│       └── Dockerfile
│
├── packages/
│   ├── database/        # Prisma client
│   ├── queue/           # BullMQ configuration
│   └── logger/          # Pino logger
│
├── docker-compose.yml
└── turbo.json
```

## Environment Variables

### Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | localhost | Redis host |
| `REDIS_PORT` | ❌ | 6379 | Redis port |
| `REDIS_PASSWORD` | ❌ | - | Redis password |
| `WORKER_CONCURRENCY` | ❌ | 5 | Concurrent jobs per worker |
| `LOG_LEVEL` | ❌ | info | Logging level |

### Scheduler

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | localhost | Redis host |
| `LOOK_AHEAD_MINUTES` | ❌ | 5 | Queue posts scheduled within X minutes |
| `STUCK_THRESHOLD_MINUTES` | ❌ | 10 | Reset jobs stuck for X minutes |

## How It Works

### Scheduler (Cron Jobs)

1. **Every minute**: Queries database for posts scheduled in the next 5 minutes, adds them to the BullMQ queue
2. **Every 5 minutes**: Checks for stuck jobs (processing > 10 min), resets them for retry
3. **Daily at midnight UTC**: Resets rate limit counters

### Worker (Job Processor)

1. Pulls jobs from BullMQ queue
2. Fetches user's Twitter OAuth token from database
3. Posts tweet via Twitter API v2
4. Updates database with success/failure status
5. Handles retries with exponential backoff

### Error Handling

| Error Type | Retryable | Action |
|------------|-----------|--------|
| Rate Limited (429) | ✅ | Retry with backoff |
| Network Error | ✅ | Retry with backoff |
| Auth Expired (401) | ❌ | Mark failed, user must reconnect |
| Duplicate Tweet | ❌ | Mark failed |
| Twitter Server Error (5xx) | ✅ | Retry with backoff |

## Monitoring

### Health Check

```bash
# Check Redis connection
redis-cli ping

# Check queue stats (using BullMQ CLI or Bull Board)
```

### Logs

Worker and scheduler output structured JSON logs in production:

```json
{"level":"info","service":"gitxflow-worker","jobId":"123","postId":"abc","msg":"Tweet posted successfully"}
```

## Scripts

```bash
pnpm dev           # Run all services in dev mode
pnpm build         # Build all packages
pnpm start:worker  # Start worker
pnpm start:scheduler # Start scheduler
pnpm db:generate   # Generate Prisma client
pnpm db:push       # Push schema to database
pnpm db:migrate    # Run migrations
```

## License

MIT
