const { uploadFiletToS3, getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');

/** Matches inline images pasted by rich-text editors (jpeg/png/webp). */
const DATA_IMAGE_BASE64_REGEX = /data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)/gi;

const MIME_BY_SUBTYPE = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

const EXT_BY_SUBTYPE = {
    jpeg: 'jpeg',
    jpg: 'jpeg',
    png: 'png',
    webp: 'webp',
};

/**
 * Replaces data:image/...;base64,... URIs with S3 URLs so stored HTML stays smaller
 * and later saves avoid huge multipart payloads. No admin UI changes required.
 */
async function replaceInlineBase64ImagesWithS3Urls(content) {
    if (!content || typeof content !== 'string' || !content.includes('data:image')) {
        return content;
    }

    const matches = [...content.matchAll(DATA_IMAGE_BASE64_REGEX)];
    if (matches.length === 0) {
        return content;
    }

    let result = content;
    for (const match of matches) {
        const dataUri = match[0];
        const subtype = match[1].toLowerCase();
        const base64Payload = match[2].replace(/\s/g, '');
        const buffer = Buffer.from(base64Payload, 'base64');
        if (!buffer.length) {
            continue;
        }

        const ext = EXT_BY_SUBTYPE[subtype] || 'jpeg';
        const mimetype = MIME_BY_SUBTYPE[subtype] || 'image/jpeg';
        const fileName = await getUniqueFileNameWithPrefix(`inline.${ext}`, 'blog');
        const uploaded = await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `blog/${fileName}`,
            Body: buffer,
            ContentType: mimetype,
        });

        if (!uploaded?.Location) {
            throw new Error('Failed to upload inline image from blog content');
        }

        result = result.replace(dataUri, uploaded.Location);
    }

    return result;
}

module.exports = {
    replaceInlineBase64ImagesWithS3Urls,
};
