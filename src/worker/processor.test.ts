import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processTwitterPost } from './processor.js';
import { prisma } from '../lib/db.js';
import { postTweet } from './twitter.js';

// Mock dependencies
vi.mock('../lib/db.js', () => ({
    prisma: {
        scheduledPost: {
            update: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
        },
        socialConnection: {
            findFirst: vi.fn(),
        },
        generatedContent: {
            update: vi.fn(),
        },
        rateLimitState: {
            upsert: vi.fn(),
        },
    },
}));

vi.mock('./twitter.js', async () => {
    const actual = await vi.importActual('./twitter.js') as any;
    return {
        ...actual,
        postTweet: vi.fn(),
    };
});

describe('processTwitterPost', () => {
    const mockJob: any = {
        id: 'job-1',
        data: {
            scheduledPostId: 'post-1',
            userId: 'user-1',
            content: 'Test Tweet',
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully process a tweet', async () => {
        // Mock DB responses
        (prisma.socialConnection.findFirst as any).mockResolvedValue({
            accessToken: 'valid-token',
            isActive: true,
            expiresAt: new Date(Date.now() + 10000),
        });

        (postTweet as any).mockResolvedValue({
            tweetId: 'tweet-123',
            tweetUrl: 'https://twitter.com/status/123',
        });

        (prisma.scheduledPost.findUnique as any).mockResolvedValue({
            contentId: 'content-1',
        });

        const result = await processTwitterPost(mockJob);

        expect(result.success).toBe(true);
        expect(result.postId).toBe('tweet-123');

        // Verify DB updates
        expect(prisma.scheduledPost.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'post-1' },
            data: expect.objectContaining({ status: 'POSTED' }),
        }));
    });

    it('should fail if no social connection is found', async () => {
        (prisma.socialConnection.findFirst as any).mockResolvedValue(null);

        const result = await processTwitterPost(mockJob);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('NO_CONNECTION');

        expect(prisma.scheduledPost.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'post-1' },
            data: expect.objectContaining({ status: 'FAILED' }),
        }));
    });
});
