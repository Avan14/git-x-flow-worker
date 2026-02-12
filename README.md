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
pnpm prisma:generate

# Copy environment file
cp .env.example .env

# Update .env with your database and Redis connections
```

### Development

```bash
# Start Redis (using Docker)
docker compose up redis -d

# Run worker in dev mode
pnpm dev:worker

# Run scheduler in dev mode (in another terminal)
pnpm dev:scheduler
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
├── src/
│   ├── lib/               # Shared utilities
│   │   ├── database.ts    # Prisma client
│   │   ├── logger.ts      # Pino logger
│   │   ├── queue.ts       # BullMQ config
│   │   └── types.ts       # TypeScript types
│   │
│   ├── worker/            # Worker service
│   │   ├── index.ts       # Worker entry point
│   │   ├── processor.ts   # Job processing logic
│   │   └── twitter.ts     # Twitter API client
│   │
│   └── scheduler/         # Scheduler service
│       └── index.ts       # Cron jobs
│
├── prisma/
│   └── schema.prisma      # Database schema
│
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Environment Variables

### Worker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `REDIS_HOST` | ✅ | localhost | Redis host |
| `REDIS_PORT` | ❌ | 6379 | Redis port |
| `REDIS_PASSWORD` | ❌ | - | Redis password |
| `TWITTER_API_KEY` | ✅ | - | Twitter Consumer API Key (OAuth 1.0a) |
| `TWITTER_API_SECRET` | ✅ | - | Twitter Consumer API Secret (OAuth 1.0a) |
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
2. Fetches user's Twitter OAuth 1.0a tokens from database
3. Posts tweet via Twitter API v2 (using User Context)
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
pnpm dev:worker        # Run worker in dev mode
pnpm dev:scheduler     # Run scheduler in dev mode
pnpm build             # Build TypeScript
pnpm start:worker      # Start built worker
pnpm start:scheduler   # Start built scheduler
pnpm prisma:generate   # Generate Prisma client
pnpm prisma:push       # Push schema to database
pnpm prisma:migrate    # Run migrations
```

## License

MIT
