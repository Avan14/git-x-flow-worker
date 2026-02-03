import 'dotenv/config';
import { createTwitterWorker, createQueueEvents, QUEUE_NAMES } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { processTwitterPost } from './processor.js';

async function main() {
    logger.info('Starting Twitter worker service...');

    // Create worker with concurrency from env or default 5
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5');
    const worker = createTwitterWorker(processTwitterPost, concurrency);

    // Create queue events for monitoring
    const queueEvents = createQueueEvents(QUEUE_NAMES.TWITTER_POST);

    // Log job events
    worker.on('completed', (job) => {
        logger.info(
            { jobId: job.id, postId: job.data.scheduledPostId },
            'Job completed successfully'
        );
    });

    worker.on('failed', (job, error) => {
        logger.error(
            { jobId: job?.id, postId: job?.data.scheduledPostId, error: error.message },
            'Job failed'
        );
    });

    worker.on('active', (job) => {
        logger.debug(
            { jobId: job.id, postId: job.data.scheduledPostId },
            'Job started processing'
        );
    });

    worker.on('error', (error) => {
        logger.error({ error: error.message }, 'Worker error');
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Received shutdown signal, closing worker...');

        try {
            // Close worker (waits for active jobs to complete)
            await worker.close();
            await queueEvents.close();

            logger.info('Worker shut down gracefully');
            process.exit(0);
        } catch (error) {
            logger.error({ error }, 'Error during shutdown');
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    logger.info(
        { concurrency, queue: QUEUE_NAMES.TWITTER_POST },
        'Worker service started and listening for jobs'
    );
}

main().catch((error) => {
    logger.fatal({ error: error.message }, 'Failed to start worker');
    process.exit(1);
});
