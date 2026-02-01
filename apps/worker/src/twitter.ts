import { TwitterApi } from 'twitter-api-v2';
import { logger, createChildLogger } from '@gitxflow/logger';

/**
 * Custom error class for Twitter API errors
 */
export class TwitterError extends Error {
    constructor(
        public code: string,
        message: string,
        public retryable: boolean
    ) {
        super(message);
        this.name = 'TwitterError';
    }
}

interface PostTweetParams {
    accessToken: string;
    content: string;
    mediaUrls?: string[];
}

interface PostTweetResult {
    tweetId: string;
    tweetUrl: string;
}

/**
 * Post a tweet using Twitter API v2
 */
export async function postTweet(params: PostTweetParams): Promise<PostTweetResult> {
    const { accessToken, content, mediaUrls } = params;
    const log = createChildLogger({ service: 'twitter' });

    // Create Twitter client with user's access token
    const client = new TwitterApi(accessToken);

    try {
        let mediaIds: string[] = [];

        // Upload media if present
        if (mediaUrls && mediaUrls.length > 0) {
            log.debug({ mediaCount: mediaUrls.length }, 'Uploading media');
            mediaIds = await uploadMedia(client, mediaUrls);
        }

        // Post the tweet
        log.debug('Posting tweet');
        const tweet = await client.v2.tweet({
            text: content,
            ...(mediaIds.length > 0 && {
                media: { media_ids: mediaIds as any },
            }),
        });

        const tweetId = tweet.data.id;
        const tweetUrl = `https://twitter.com/i/status/${tweetId}`;

        log.info({ tweetId }, 'Tweet posted successfully');

        return { tweetId, tweetUrl };
    } catch (error: any) {
        log.error({ error: error.message, code: error.code }, 'Twitter API error');

        // Map Twitter API errors to our error types
        throw mapTwitterError(error);
    }
}

/**
 * Upload media files to Twitter
 */
async function uploadMedia(
    client: TwitterApi,
    mediaUrls: string[]
): Promise<string[]> {
    const log = createChildLogger({ service: 'twitter-media' });
    const mediaIds: string[] = [];

    // Twitter allows max 4 images per tweet
    const urlsToUpload = mediaUrls.slice(0, 4);

    for (const url of urlsToUpload) {
        try {
            // Download the image
            log.debug({ url }, 'Downloading media');
            const response = await fetch(url);

            if (!response.ok) {
                log.warn({ url, status: response.status }, 'Failed to download media');
                continue;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const mimeType = response.headers.get('content-type') || 'image/jpeg';

            // Upload to Twitter
            log.debug({ url, mimeType, size: buffer.length }, 'Uploading media to Twitter');
            const mediaId = await client.v1.uploadMedia(buffer, { mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' });

            mediaIds.push(mediaId);
            log.debug({ url, mediaId }, 'Media uploaded successfully');
        } catch (error) {
            log.warn({ url, error }, 'Failed to upload media, skipping');
            // Continue with other media - don't fail the whole tweet
        }
    }

    return mediaIds;
}

/**
 * Map Twitter API errors to our custom TwitterError
 */
function mapTwitterError(error: any): TwitterError {
    // Rate limit error
    if (error.code === 429 || error.rateLimit) {
        return new TwitterError(
            'RATE_LIMITED',
            'Twitter rate limit exceeded. Please try again later.',
            true // Retryable after backoff
        );
    }

    // Authentication errors
    if (error.code === 401) {
        return new TwitterError(
            'AUTH_INVALID',
            'Twitter authentication is invalid. User needs to reconnect.',
            false // Not retryable - user action required
        );
    }

    if (error.code === 403) {
        // Check for specific 403 reasons
        const message = error.message || error.data?.detail || '';

        if (message.includes('suspended')) {
            return new TwitterError(
                'ACCOUNT_SUSPENDED',
                'Twitter account is suspended.',
                false
            );
        }

        if (message.includes('duplicate')) {
            return new TwitterError(
                'DUPLICATE_TWEET',
                'This tweet appears to be a duplicate.',
                false
            );
        }

        return new TwitterError(
            'FORBIDDEN',
            `Tweet rejected by Twitter: ${message}`,
            false
        );
    }

    // Server errors (5xx) are retryable
    if (error.code >= 500 && error.code < 600) {
        return new TwitterError(
            'TWITTER_SERVER_ERROR',
            'Twitter is experiencing issues. Will retry.',
            true
        );
    }

    // Network/timeout errors
    if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND'
    ) {
        return new TwitterError(
            'NETWORK_ERROR',
            'Network error connecting to Twitter.',
            true
        );
    }

    // Unknown errors - not retryable by default
    return new TwitterError(
        'UNKNOWN_TWITTER_ERROR',
        error.message || 'An unknown Twitter error occurred.',
        false
    );
}

/**
 * Validate tweet content before posting
 */
export function validateTweetContent(content: string): { valid: boolean; error?: string } {
    // Twitter character limit
    if (content.length > 280) {
        return { valid: false, error: 'Tweet exceeds 280 character limit' };
    }

    if (content.trim().length === 0) {
        return { valid: false, error: 'Tweet content is empty' };
    }

    return { valid: true };
}
