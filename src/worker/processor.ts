import type { Job } from '../lib/queue.js';
import type { TwitterPostJobData, JobResult } from '../lib/types.js';
import { prisma } from '../lib/db.js';
import { logger, createChildLogger } from '../lib/logger.js';
import { postTweet, TwitterError } from './twitter.js';

/**
 * Process a Twitter post job
 * This is the main job processor that gets registered with the BullMQ worker
 */
export async function processTwitterPost(
    job: Job<TwitterPostJobData>
): Promise<JobResult> {
    const { scheduledPostId, userId, content, mediaUrls } = job.data;
    const log = createChildLogger({ jobId: job.id, postId: scheduledPostId });

    log.info('Processing Twitter post job');

    try {
        // 1. Mark job as processing
        await prisma.scheduledPost.update({
            where: { id: scheduledPostId },
            data: {
                status: 'PROCESSING',
                startedAt: new Date(),
                attempts: { increment: 1 },
                lastAttemptAt: new Date(),
            },
        });

        // 2. Get user's Twitter credentials
        const socialConnection = await prisma.socialConnection.findFirst({
            where: {
                userId,
                platform: 'twitter',
                isActive: true,
            },
        });

        if (!socialConnection) {
            throw new TwitterError(
                'NO_CONNECTION',
                'No active Twitter connection found. User needs to reconnect Twitter.',
                false // Not retryable - user action required
            );
        }

        // 3. Check for required OAuth 1.0a credentials
        if (!socialConnection.refreshToken) {
            throw new TwitterError(
                'MISSING_ACCESS_SECRET',
                'OAuth 1.0a Access Token Secret is missing. User needs to reconnect Twitter.',
                false
            );
        }

        // 4. Check if token is expired
        if (socialConnection.expiresAt && socialConnection.expiresAt < new Date()) {
            throw new TwitterError(
                'TOKEN_EXPIRED',
                'Twitter access token has expired. User needs to reconnect.',
                false // Not retryable - user action required
            );
        }

        // 5. Post tweet
        log.debug('Posting tweet to Twitter API');
        const result = await postTweet({
            accessToken: socialConnection.accessToken,
            accessSecret: socialConnection.refreshToken,
            content,
            mediaUrls,
        });

        // 5. Update database with success
        await prisma.scheduledPost.update({
            where: { id: scheduledPostId },
            data: {
                status: 'POSTED',
                platformPostId: result.tweetId,
                platformUrl: result.tweetUrl,
                completedAt: new Date(),
                errorMessage: null,
                errorCode: null,
            },
        });

        // 6. Update GeneratedContent status
        const post = await prisma.scheduledPost.findUnique({
            where: { id: scheduledPostId },
            select: { contentId: true },
        });

        if (post?.contentId) {
            await prisma.generatedContent.update({
                where: { id: post.contentId },
                data: {
                    status: 'posted',
                    postedAt: new Date(),
                    platformPostId: result.tweetId,
                    platformUrl: result.tweetUrl,
                },
            });
        }

        // 7. Update rate limit tracking
        await updateRateLimitState();

        log.info({ tweetId: result.tweetId, tweetUrl: result.tweetUrl }, 'Tweet posted successfully');

        return {
            success: true,
            postId: result.tweetId,
            postUrl: result.tweetUrl,
        };
    } catch (error) {
        log.error({ error }, 'Failed to process job');

        const errorInfo = categorizeError(error);

        // Update database with error info
        await prisma.scheduledPost.update({
            where: { id: scheduledPostId },
            data: {
                status: errorInfo.retryable && job.attemptsMade < (job.opts.attempts || 3)
                    ? 'QUEUED' // Will be retried
                    : 'FAILED',
                errorMessage: errorInfo.message,
                errorCode: errorInfo.code,
            },
        });

        // If retryable, throw to trigger BullMQ's retry mechanism
        if (errorInfo.retryable) {
            throw error;
        }

        // Non-retryable errors - return failure result (job won't retry)
        return {
            success: false,
            error: errorInfo,
        };
    }
}

/**
 * Categorize error for proper handling and logging
 */
function categorizeError(error: unknown): {
    code: string;
    message: string;
    retryable: boolean;
} {
    if (error instanceof TwitterError) {
        return {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
        };
    }

    // Network errors are typically retryable
    if (error instanceof Error) {
        if (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND')
        ) {
            return {
                code: 'NETWORK_ERROR',
                message: error.message,
                retryable: true,
            };
        }
    }

    return {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
    };
}

/**
 * Update rate limit state after successful post
 */
async function updateRateLimitState(): Promise<void> {
    try {
        await prisma.rateLimitState.upsert({
            where: { platform: 'twitter' },
            create: {
                platform: 'twitter',
                postsRemaining: 49, // Started with 50, used 1
                lastPostAt: new Date(),
            },
            update: {
                postsRemaining: { decrement: 1 },
                lastPostAt: new Date(),
                consecutiveFailures: 0, // Reset on success
            },
        });
    } catch (error) {
        // Don't fail the job if rate limit tracking fails
        logger.warn({ error }, 'Failed to update rate limit state');
    }
}
