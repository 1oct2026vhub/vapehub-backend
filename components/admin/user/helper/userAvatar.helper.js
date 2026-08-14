const { uploadFiletToS3, getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');

/**
 * Upload a user avatar image to S3 and return the public URL.
 * @param {Express.Multer.File} file
 * @returns {Promise<string>}
 */
async function uploadUserAvatar(file) {
    if (!file) {
        return null;
    }

    const { originalname, mimetype, buffer } = file;
    const fileName = await getUniqueFileNameWithPrefix(originalname, 'user-avatar');
    const uploadedImage = await uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `users/avatars/${fileName}`,
        Body: buffer,
        ContentType: mimetype
    });

    if (!uploadedImage?.Location) {
        throw new Error('Failed to upload avatar image');
    }

    return uploadedImage.Location;
}

module.exports = {
    uploadUserAvatar
};
