const { buildBlogAuthorArchiveUrl } = require('../../admin/user/helper/blogAuthor.helper');

const formatAuthor = (author) => {
    if (!author) {
        return null;
    }

    const authorData = author.toJSON ? author.toJSON() : author;
    const linkedUser = authorData.user || null;

    return {
        id: authorData.id ?? null,
        first_name: authorData.first_name ?? null,
        last_name: authorData.last_name ?? null,
        email: linkedUser?.email ?? null,
        avatar_url: authorData.avatar_url ?? null,
        role: authorData.role ?? null,
        bio: authorData.bio ?? null,
        archive_url: authorData.archive_url
            || buildBlogAuthorArchiveUrl(authorData.slug)
            || '/blogs',
        team_url: authorData.team_url ?? '/blogs'
    };
};

module.exports = {
    formatAuthor
};
