import 'dotenv/config';
import { CronJob } from 'cron';
import { prisma } from '../lib/db.js';
import { createTwitterQueue, DEFAULT_JOB_OPTIONS } from '../lib/queue.js';
import { logger, createChildLogger } from '../lib/logger.js';
import express from 'express';

// Health check server for Digital Ocean / Koyeb
const app = express();
const PORT = parseInt(process.env.PORT || '8000');

app.get('/health', (_req, res) => {
    res.status(200).send('OK');
});

app.get('/', (_req, res) => {
    res.status(200).json({ status: 'running', service: 'gitxflow-scheduler' });
});

const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Health check server running');
});

const queue = createTwitterQueue();

/**
 * Queue posts that are scheduled to be posted in the next X minutes
 */
async function queueUpcomingPosts(): Promise<void> {
    const log = createChildLogger({ task: 'queueUpcoming' });

    try {

        const now = new Date();
        const lookAheadMinutes = parseInt(process.env.LOOK_AHEAD_MINUTES || '5');
        const lookAhead = new Date(now.getTime() + lookAheadMinutes * 60000);

        // Find posts ready to be queued
        const posts = await prisma.scheduledPost.findMany({
            where: {
                status: 'PENDING',
                platform: 'twitter',
                scheduledFor: { lte: lookAhead },
            },
            include: {
                content: { select: { content: true } },
            },
            orderBy: [
                { priority: 'desc' }, // Higher priority first
                { scheduledFor: 'asc' }, // Earlier scheduled time first
            ],
            take: 100, // Process in batches
        });

        if (posts.length === 0) {
            log.debug('No posts to queue');
            return;
        }

        log.info({ count: posts.length }, 'Found posts to queue');

        for (const post of posts) {
            // Calculate delay until scheduled time
            const delay = Math.max(0, post.scheduledFor.getTime() - now.getTime());

            try {
                // Add job to queue with unique ID to prevent duplicates
                const job = await queue.add(
                    'post-tweet',
                    {
                        scheduledPostId: post.id,
                        userId: post.userId,
                        contentId: post.contentId,
                        platform: post.platform as 'twitter',
                        content: post.content.content,
                        priority: post.priority,
                    },
                    {
                        ...DEFAULT_JOB_OPTIONS,
                        delay,
                        jobId: `tweet-${post.id}`, // Prevents duplicate jobs
                        priority: 10 - post.priority, // BullMQ: lower = higher priority
                    }
                );

                // Update post status to QUEUED
                await prisma.scheduledPost.update({
                    where: { id: post.id },
                    data: {
                        status: 'QUEUED',
                        jobId: job.id,
                        queuedAt: new Date(),
                    },
                });

                log.debug(
                    { postId: post.id, jobId: job.id, delayMs: delay },
                    'Queued post'
                );
            } catch (error: any) {
                // Handle duplicate job error gracefully
                if (error.message?.includes('already exists')) {
                    log.debug({ postId: post.id }, 'Job already exists, skipping');
                } else {
                    log.error({ postId: post.id, error: error.message }, 'Failed to queue post');
                }
            }
        }

        log.info({ queued: posts.length }, 'Finished queueing posts');
    } catch (error) {
        log.error({ error }, 'Failed to queue upcoming posts');
    }
}

/**
 * Recover jobs that are stuck in PROCESSING state
 * This handles cases where a worker crashed mid-job
 */
async function recoverStuckJobs(): Promise<void> {
    const log = createChildLogger({ task: 'recovery' });

    try {
        const stuckThresholdMinutes = parseInt(process.env.STUCK_THRESHOLD_MINUTES || '10');
        const stuckThreshold = new Date(Date.now() - stuckThresholdMinutes * 60000);

        // Find jobs stuck in PROCESSING
        const stuck = await prisma.scheduledPost.findMany({
            where: {
                status: 'PROCESSING',
                startedAt: { lt: stuckThreshold },
            },
        });

        if (stuck.length === 0) {
            return;
        }

        log.warn({ count: stuck.length }, 'Found stuck jobs');

        for (const post of stuck) {
            // Check if job still exists in queue and is active
            let jobActive = false;
            if (post.jobId) {
                try {
                    const job = await queue.getJob(post.jobId);
                    const state = await job?.getState();
                    jobActive = state === 'active';
                } catch {
                    // Job not found or error - consider not active
                }
            }

            if (jobActive) {
                log.debug({ postId: post.id }, 'Job still active in queue, skipping');
                continue;
            }

            // Reset to PENDING for re-queuing
            await prisma.scheduledPost.update({
                where: { id: post.id },
                data: {
                    status: 'PENDING',
                    jobId: null,
                    queuedAt: null,
                    startedAt: null,
                    errorMessage: `Job timed out after ${stuckThresholdMinutes} minutes and was reset`,
                },
            });

            log.info({ postId: post.id }, 'Reset stuck job');
        }
    } catch (error) {
        log.error({ error }, 'Failed to recover stuck jobs');
    }
}

/**
 * Reset rate limit counters at the start of each day (Twitter 24h window)
 */
async function resetDailyRateLimits(): Promise<void> {
    const log = createChildLogger({ task: 'rateLimit' });

    try {
        await prisma.rateLimitState.upsert({
            where: { platform: 'twitter' },
            create: {
                platform: 'twitter',
                postsRemaining: 50, // Twitter free tier limit
                windowResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
            update: {
                postsRemaining: 50,
                windowResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });

        log.info('Reset daily rate limits');
    } catch (error) {
        log.error({ error }, 'Failed to reset rate limits');
    }
}

async function main() {
    logger.info('Starting scheduler service...');

    // Queue upcoming posts every minute
    const queueJob = new CronJob('* * * * *', queueUpcomingPosts, null, false, 'UTC');
    queueJob.start();
    logger.info('Started: Queue upcoming posts (every minute)');

    // Recover stuck jobs every 5 minutes
    const recoveryJob = new CronJob('*/5 * * * *', recoverStuckJobs, null, false, 'UTC');
    recoveryJob.start();
    logger.info('Started: Recover stuck jobs (every 5 minutes)');

    // Reset rate limits daily at midnight UTC
    const rateLimitJob = new CronJob('0 0 * * *', resetDailyRateLimits, null, false, 'UTC');
    rateLimitJob.start();
    logger.info('Started: Reset rate limits (daily at midnight UTC)');

    // Run immediately on startup to catch any missed posts
    logger.info('Running startup tasks...');
    await queueUpcomingPosts();
    await recoverStuckJobs();

    logger.info('Scheduler service started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Received shutdown signal');
        queueJob.stop();
        recoveryJob.stop();
        rateLimitJob.stop();

        await queue.close();
        server.close(); // Close HTTP server
        logger.info('Scheduler shut down gracefully');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
    logger.fatal({ error: error.message }, 'Failed to start scheduler');
    process.exit(1);
});
