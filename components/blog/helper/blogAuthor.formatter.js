const { buildBlogAuthorArchiveUrl } = require('../../admin/user/helper/blogAuthor.helper');

const AUTHOR_OVERRIDE_KEYS = [
    'first_name', 'last_name', 'role', 'bio',
    'avatar_url', 'archive_url', 'team_url'
];

const hasAuthorOverrideContent = (override) => (
    override
    && typeof override === 'object'
    && AUTHOR_OVERRIDE_KEYS.some((key) => {
        const val = override[key];
        return val != null && String(val).trim() !== '';
    })
);

const formatMergedAuthor = (author, authorOverride = null) => {
    if (!author && !hasAuthorOverrideContent(authorOverride)) {
        return null;
    }

    const authorData = author?.toJSON ? author.toJSON() : (author || {});
    const override = authorOverride && typeof authorOverride === 'object'
        ? authorOverride
        : null;

    const archiveUrl = override?.archive_url
        || authorData.blog_author_archive_url
        || buildBlogAuthorArchiveUrl(authorData.blog_author_slug)
        || '/blogs';

    return {
        id: authorData.id ?? null,
        first_name: override?.first_name ?? authorData.first_name ?? null,
        last_name: override?.last_name ?? authorData.last_name ?? null,
        email: authorData.email ?? null,
        avatar_url: override?.avatar_url ?? authorData.profile_pic_url ?? null,
        role: override?.role ?? authorData.blog_author_role ?? null,
        bio: override?.bio ?? authorData.blog_author_bio ?? null,
        archive_url: archiveUrl,
        team_url: override?.team_url ?? authorData.blog_author_team_url ?? '/blogs'
    };
};

module.exports = {
    AUTHOR_OVERRIDE_KEYS,
    hasAuthorOverrideContent,
    formatMergedAuthor
};
