const moment = require('moment-timezone');
const s3 = require('../../config/awsConfig');

const RETENTION_DAYS = Number(process.env.S3_LOG_RETENTION_DAYS || 7);
const PREFIX = (process.env.S3_LOG_PREFIX || 'logs/app').replace(/\/$/, '');

async function cleanupOldS3Logs() {
    if (!process.env.AWS_S3_BUCKET) {
        return { deleted: 0, errors: 0, total: 0 };
    }

    const cutoffDate = moment().subtract(RETENTION_DAYS, 'days').toDate();
    let continuationToken;
    const filesToDelete = [];

    do {
        const listed = await s3.listObjectsV2({
            Bucket: process.env.AWS_S3_BUCKET,
            Prefix: `${PREFIX}/`,
            ContinuationToken: continuationToken,
        }).promise();

        for (const object of listed.Contents || []) {
            if (object.LastModified < cutoffDate) {
                filesToDelete.push({ Key: object.Key });
            }
        }

        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    if (!filesToDelete.length) {
        return { deleted: 0, errors: 0, total: 0 };
    }

    let deleted = 0;
    let errors = 0;
    const batchSize = 1000;

    for (let i = 0; i < filesToDelete.length; i += batchSize) {
        const batch = filesToDelete.slice(i, i + batchSize);
        try {
            await s3.deleteObjects({
                Bucket: process.env.AWS_S3_BUCKET,
                Delete: { Objects: batch, Quiet: true },
            }).promise();
            deleted += batch.length;
        } catch (error) {
            errors += batch.length;
            console.error('S3 log cleanup batch failed:', error.message);
        }
    }

    return { deleted, errors, total: filesToDelete.length };
}

module.exports = { cleanupOldS3Logs };
