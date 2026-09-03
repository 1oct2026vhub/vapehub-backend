const { uploadFiletToS3, getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');
const { buildBlogAuthorArchiveUrl } = require('../../user/helper/blogAuthor.helper');
const { Author } = require('../../../../models');
const { Op } = require('sequelize');

const slugifyAuthorName = (firstName, lastName) => {
    const slug = `${firstName || ''} ${lastName || ''}`
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90);

    return slug || 'author';
};

const emptyToNull = (value) => {
    if (value == null) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
};

const normalizeOptionalUserId = (value) => {
    if (value == null || value === '') {
        return null;
    }
    const userId = parseInt(value, 10);
    if (Number.isNaN(userId)) {
        throw new Error('user_id must be a valid integer');
    }
    return userId;
};

const applyAuthorArchiveUrl = (payload, existing = {}) => {
    const nextSlug = Object.prototype.hasOwnProperty.call(payload, 'slug')
        ? payload.slug
        : existing.slug;
    const nextArchive = Object.prototype.hasOwnProperty.call(payload, 'archive_url')
        ? payload.archive_url
        : existing.archive_url;

    if ((nextArchive == null || nextArchive === '') && nextSlug) {
        payload.archive_url = buildBlogAuthorArchiveUrl(nextSlug);
    }
};

const ensureUniqueAuthorSlug = async (baseSlug, excludeId = null) => {
    let slug = baseSlug;
    let n = 2;
    while (true) {
        const existing = await Author.findOne({
            where: {
                slug,
                ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
            },
            paranoid: false
        });
        if (!existing) {
            return slug;
        }
        slug = `${baseSlug}-${n}`.slice(0, 100);
        n += 1;
    }
};

async function uploadAuthorAvatar(file) {
    if (!file) {
        return null;
    }

    const { originalname, mimetype, buffer } = file;
    const fileName = await getUniqueFileNameWithPrefix(originalname, 'blog-author');
    const uploaded = await uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `blog/authors/${fileName}`,
        Body: buffer,
        ContentType: mimetype
    });

    if (!uploaded?.Location) {
        throw new Error('Failed to upload author avatar');
    }

    return uploaded.Location;
}

module.exports = {
    slugifyAuthorName,
    emptyToNull,
    normalizeOptionalUserId,
    applyAuthorArchiveUrl,
    ensureUniqueAuthorSlug,
    uploadAuthorAvatar,
    buildBlogAuthorArchiveUrl
};
