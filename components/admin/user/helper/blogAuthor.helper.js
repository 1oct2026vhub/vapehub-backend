const buildBlogAuthorArchiveUrl = (slug) => {
    const normalizedSlug = slug != null ? String(slug).trim() : '';
    if (!normalizedSlug) {
        return null;
    }

    return `/blogs?author=${normalizedSlug}`;
};

/**
 * Auto-fill archive URL from slug when archive URL is empty.
 * @param {object} updatePayload
 * @param {object} existingUser
 */
const applyBlogAuthorArchiveUrl = (updatePayload, existingUser) => {
    const nextSlug = Object.prototype.hasOwnProperty.call(updatePayload, 'blog_author_slug')
        ? updatePayload.blog_author_slug
        : existingUser.blog_author_slug;

    const nextArchive = Object.prototype.hasOwnProperty.call(updatePayload, 'blog_author_archive_url')
        ? updatePayload.blog_author_archive_url
        : existingUser.blog_author_archive_url;

    if ((nextArchive == null || nextArchive === '') && nextSlug) {
        updatePayload.blog_author_archive_url = buildBlogAuthorArchiveUrl(nextSlug);
    }
};

module.exports = {
    buildBlogAuthorArchiveUrl,
    applyBlogAuthorArchiveUrl
};
