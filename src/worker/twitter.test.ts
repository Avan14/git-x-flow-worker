import { describe, it, expect } from 'vitest';
import { validateTweetContent, TwitterError } from './twitter.js';

describe('Twitter Logic', () => {
    describe('validateTweetContent', () => {
        it('should return valid for correct content', () => {
            const result = validateTweetContent('Hello World!');
            expect(result.valid).toBe(true);
        });

        it('should return invalid for empty content', () => {
            const result = validateTweetContent('   ');
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Tweet content is empty');
        });

        it('should return invalid for content exceeding 280 characters', () => {
            const longContent = 'a'.repeat(281);
            const result = validateTweetContent(longContent);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Tweet exceeds 280 character limit');
        });
    });

    describe('TwitterError Class', () => {
        it('should create an error with correct properties', () => {
            const error = new TwitterError('TEST_CODE', 'Test message', true);
            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.retryable).toBe(true);
            expect(error.name).toBe('TwitterError');
        });
    });
});
