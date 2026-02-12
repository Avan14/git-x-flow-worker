import 'dotenv/config';
import { prisma } from '../src/lib/db.js';
import loadReadline from 'readline';

const readline = loadReadline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        readline.question(query, resolve);
    });
};

async function main() {
    console.log('--- GitXFlow Worker Manual Test Seeder ---\n');

    try {
        // 1. Get Twitter OAuth 1.0a Credentials
        console.log('To test the worker, we need your OAuth 1.0a User credentials.');
        console.log('');
        console.log('How to get them:');
        console.log('  1. Go to https://developer.x.com → Your App → Keys & Tokens');
        console.log('  2. Under "Authentication Tokens" → "Access Token and Secret"');
        console.log('  3. Generate tokens with Read and Write permissions');
        console.log('');
        console.log('Note: TWITTER_API_KEY and TWITTER_API_SECRET must be set in your .env file.');
        console.log('');

        const accessToken = await question('Enter Access Token: ');
        if (!accessToken.trim()) {
            console.error('Access token is required!');
            process.exit(1);
        }

        const accessSecret = await question('Enter Access Token Secret: ');
        if (!accessSecret.trim()) {
            console.error('Access token secret is required!');
            process.exit(1);
        }

        // Verify env vars
        if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
            console.error('\n❌ TWITTER_API_KEY and TWITTER_API_SECRET must be set in .env');
            process.exit(1);
        }
        console.log('✅ TWITTER_API_KEY and TWITTER_API_SECRET found in .env');

        const username = 'test-user-' + Date.now();
        const email = `test-${Date.now()}@example.com`;

        console.log('\nCreating test data...');

        // 2. Create User
        const user = await prisma.user.create({
            data: {
                username,
                email,
                name: 'Test User',
            },
        });
        console.log(`✅ Created User: ${user.id} (${user.username})`);

        // 3. Create Social Connection (OAuth 1.0a: accessSecret stored in refreshToken field)
        await prisma.socialConnection.create({
            data: {
                userId: user.id,
                platform: 'twitter',
                accessToken: accessToken.trim(),
                refreshToken: accessSecret.trim(), // OAuth 1.0a access token secret
                isActive: true,
                username: 'twitter_test_user',
            },
        });
        console.log('✅ Created SocialConnection (Twitter / OAuth 1.0a)');

        // 4. Create Prerequisite Data (Achievement & Content)
        const achievement = await prisma.achievement.create({
            data: {
                userId: user.id,
                type: 'pr_merged',
                title: 'Test Achievement',
                repoName: 'test-repo',
                repoOwner: 'test-owner',
                repoUrl: 'https://github.com/test/test-repo',
                occurredAt: new Date(),
                score: 10,
            },
        });

        const content = await prisma.generatedContent.create({
            data: {
                userId: user.id,
                achievementId: achievement.id,
                format: 'tweet',
                content: `Test tweet from GitXFlow Worker at ${new Date().toISOString()} 🚀 #testing`,
                status: 'scheduled',
            },
        });
        console.log('✅ Created Achievement & GeneratedContent');

        // 5. Create Scheduled Post (1 minute from now)
        const scheduledFor = new Date(Date.now() + 60 * 1000); // 1 minute later

        const post = await prisma.scheduledPost.create({
            data: {
                userId: user.id,
                contentId: content.id,
                platform: 'twitter',
                scheduledFor: scheduledFor,
                status: 'PENDING',
                priority: 1,
            },
        });

        console.log(`\n✅ Created ScheduledPost: ${post.id}`);
        console.log(`📅 Scheduled for: ${scheduledFor.toLocaleString()}`);
        console.log(`📝 Content: "${content.content}"`);

        console.log('\n--- Setup Complete! ---');
        console.log('To process this post:');
        console.log('1. Ensure Redis is running.');
        console.log('2. In one terminal, run the scheduler: npm run dev:scheduler');
        console.log('3. In another terminal, run the worker:    npm run dev:worker');
        console.log('\nThe scheduler should pick up the post in ~1 minute and queue it.');
        console.log('The worker will then process it and post to Twitter.');

    } catch (error) {
        console.error('Error seeding data:', error);
    } finally {
        await prisma.$disconnect();
        readline.close();
    }
}

main();
