const AWS = require('aws-sdk');
require('../../config/awsConfig');

/**
 * @param {Array<{ campaignId: number, chunkId: number }>} items
 */
async function enqueuePromotionalChunks(items) {
    const queueUrl = process.env.EMAIL_CAMPAIGN_SQS_QUEUE_URL;
    if (!queueUrl) {
        throw new Error('EMAIL_CAMPAIGN_SQS_QUEUE_URL is not configured');
    }

    const sqs = new AWS.SQS();

    for (const { campaignId, chunkId } of items) {
        await sqs
            .sendMessage({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify({ v: 1, campaignId, chunkId })
            })
            .promise();
    }
}

module.exports = { enqueuePromotionalChunks };
