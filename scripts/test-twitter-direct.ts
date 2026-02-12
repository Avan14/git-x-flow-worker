import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';
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
    console.log('--- Layer 1: Direct Twitter API Test (OAuth 1.0a) ---\n');

    // Check env vars
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;

    if (!apiKey || !apiSecret || apiKey === 'your_api_key_here') {
        console.error('❌ Set TWITTER_API_KEY and TWITTER_API_SECRET in your .env file first.');
        console.error('   Find them at: developer.x.com → App → Keys & Tokens → Consumer Keys');
        process.exit(1);
    }
    console.log('✅ TWITTER_API_KEY and TWITTER_API_SECRET loaded from .env\n');

    // Get user tokens
    console.log('Enter your OAuth 1.0a user tokens:');
    console.log('(Developer Portal → App → Keys & Tokens → Authentication Tokens)\n');

    const accessToken = await question('Access Token: ');
    if (!accessToken.trim()) { console.error('Required!'); process.exit(1); }

    const accessSecret = await question('Access Token Secret: ');
    if (!accessSecret.trim()) { console.error('Required!'); process.exit(1); }

    // Create client
    const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken.trim(),
        accessSecret: accessSecret.trim(),
    });

    const tweetText = `Test from GitXFlow ${new Date().toISOString()} 🚀`;

    console.log(`\n📝 Attempting to post: "${tweetText}"\n`);

    try {
        const tweet = await client.v2.tweet({ text: tweetText });

        console.log('✅ Tweet posted successfully!');
        console.log(`   Tweet ID: ${tweet.data.id}`);
        console.log(`   URL: https://x.com/i/status/${tweet.data.id}`);
    } catch (error: any) {
        console.error('❌ Failed to post tweet.\n');
        console.error(`Status: ${error.code}`);
        console.error(`Message: ${error.message}`);

        if (error.data) {
            console.error('\nTwitter API Response:');
            console.error(JSON.stringify(error.data, null, 2));
        }

        if (error.code === 401) {
            console.error('\n→ Token is invalid. Regenerate at Developer Portal.');
        } else if (error.code === 403) {
            console.error('\n→ 403 Forbidden. Check:');
            console.error('  1. App permissions are set to "Read and Write"');
            console.error('  2. Tokens were regenerated AFTER changing permissions');
            console.error('  3. Free tier: max 1 tweet per 15 min window');
        }
    } finally {
        readline.close();
    }
}

main();
