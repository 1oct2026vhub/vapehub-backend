const { uploadFiletToS3, getUniqueFileNameWithPrefix } = require('../../../../library/s3/s3Helper');

const AUTHOR_OVERRIDE_FIELD_MAP = {
    author_first_name: 'first_name',
    author_last_name: 'last_name',
    author_role: 'role',
    author_bio: 'bio',
    author_archive_url: 'archive_url',
    author_team_url: 'team_url',
    author_avatar_url: 'avatar_url'
};

const isAuthorOverrideClear = (value) => {
    if (value === '' || value === '{}') {
        return true;
    }
    if (typeof value === 'string' && value.trim() === '{}') {
        return true;
    }
    return false;
};

const sanitizeAuthorOverride = (override) => {
    const next = { ...override };
    for (const key of Object.keys(next)) {
        if (next[key] == null || next[key] === '') {
            delete next[key];
        }
    }
    return Object.keys(next).length ? next : null;
};

/** Upload author avatar for this post only (not users.profile_pic_url). */
async function uploadBlogAuthorAvatar(file) {
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

function parseAuthorOverridePatch(body) {
    if (body.author_override !== undefined && isAuthorOverrideClear(body.author_override)) {
        return { action: 'clear' };
    }

    let patch = {};
    let hasInput = false;

    if (body.author_override !== undefined && !isAuthorOverrideClear(body.author_override)) {
        hasInput = true;
        const parsed = typeof body.author_override === 'string'
            ? JSON.parse(body.author_override)
            : body.author_override;

        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('author_override must be a JSON object');
        }

        patch = { ...parsed };
    }

    for (const [formKey, jsonKey] of Object.entries(AUTHOR_OVERRIDE_FIELD_MAP)) {
        if (body[formKey] !== undefined) {
            hasInput = true;
            const val = body[formKey];
            patch[jsonKey] = val === '' ? null : String(val).trim();
        }
    }

    if (!hasInput) {
        return { action: 'unchanged' };
    }

    return { action: 'patch', patch };
}

function mergeAuthorOverride(existing, patchResult, avatarUrl) {
    if (patchResult.action === 'unchanged' && !avatarUrl) {
        return undefined;
    }

    if (patchResult.action === 'clear' && !avatarUrl) {
        return null;
    }

    const base = patchResult.action === 'clear'
        ? {}
        : { ...(existing || {}), ...(patchResult.patch || {}) };

    if (avatarUrl) {
        base.avatar_url = avatarUrl;
    }

    return sanitizeAuthorOverride(base);
}

async function resolveAuthorOverrideForSave({ body, existing = null, avatarFile = null }) {
    const patchResult = parseAuthorOverridePatch(body);
    const avatarUrl = avatarFile ? await uploadBlogAuthorAvatar(avatarFile) : undefined;
    return mergeAuthorOverride(existing, patchResult, avatarUrl);
}

module.exports = {
    AUTHOR_OVERRIDE_FIELD_MAP,
    uploadBlogAuthorAvatar,
    parseAuthorOverridePatch,
    mergeAuthorOverride,
    resolveAuthorOverrideForSave
};
