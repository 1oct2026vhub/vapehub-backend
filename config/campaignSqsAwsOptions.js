const AWS = require('aws-sdk');

/**
 * Constructor options for promotional-email SQS clients only (`sqsEnqueue`, worker).
 * Does not alter global AWS.config — other services keep using backend/config/awsConfig.js.
 *
 * Env:
 *   AWS_SQS_USE_EC2_INSTANCE_ROLE=true  EC2 hosts: use IMDS credentials for SQS only
 *                                         (ignore AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).
 *                                         Omit elsewhere (ECS task role uses default chain on client).
 *
 *   EMAIL_CAMPAIGN_AWS_REGION           optional queue API region when it differs from AWS_REGION
 *
 * When AWS_SQS_USE_EC2_INSTANCE_ROLE is unset/false: returns at most `{ region }` so the SQS client
 * uses the same credential source as global config (typically env keys applied in awsConfig).
 */
function getSqsClientConfig() {
    const region =
        process.env.EMAIL_CAMPAIGN_AWS_REGION ||
        process.env.AWS_REGION ||
        undefined;

    const config = {};
    if (region) {
        config.region = region;
    }

    if (process.env.AWS_SQS_USE_EC2_INSTANCE_ROLE === 'true') {
        if (!region) {
            throw new Error(
                'AWS_SQS_USE_EC2_INSTANCE_ROLE requires AWS_REGION or EMAIL_CAMPAIGN_AWS_REGION to be set'
            );
        }
        config.credentials = new AWS.EC2MetadataCredentials({
            maxRetries: 5,
            timeout: 10000
        });
    }

    return config;
}

module.exports = { getSqsClientConfig };
