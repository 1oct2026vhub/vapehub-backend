const { User } = require('../../../../models');

const AUTHOR_ATTRIBUTES = [
    'id',
    'first_name',
    'last_name',
    'email',
    'profile_pic_url',
    'blog_author_role',
    'blog_author_bio',
    'blog_author_slug',
    'blog_author_archive_url',
    'blog_author_team_url'
];

const parseJsonOrCsvIds = (field, fieldName = 'field') => {
    if (field == null || field === '') {
        return [];
    }

    if (Array.isArray(field)) {
        return field.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    }

    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed) {
            return [];
        }

        if (trimmed.startsWith('[')) {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed)) {
                throw new Error(`${fieldName} must be a JSON array`);
            }
            return parsed.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
        }

        return trimmed.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !Number.isNaN(id));
    }

    throw new Error(`Invalid format for ${fieldName}`);
};

const parseSourcesField = (field) => {
    if (field == null || field === '') {
        return [];
    }

    let sources = field;
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed) {
            return [];
        }
        sources = JSON.parse(trimmed);
    }

    if (!Array.isArray(sources)) {
        throw new Error('sources must be a JSON array');
    }

    if (sources.length > 20) {
        throw new Error('sources cannot contain more than 20 items');
    }

    return sources.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`sources[${index}] must be an object`);
        }

        const label = item.label != null ? String(item.label).trim() : '';
        const href = item.href != null ? String(item.href).trim() : '';
        const description = item.description != null ? String(item.description).trim() : '';

        if (!label) {
            throw new Error(`sources[${index}].label is required`);
        }
        if (!href) {
            throw new Error(`sources[${index}].href is required`);
        }

        try {
            const url = new URL(href);
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error('invalid protocol');
            }
        } catch {
            throw new Error(`sources[${index}].href must be a valid URL with http or https`);
        }

        return {
            label,
            href,
            ...(description ? { description } : {})
        };
    });
};

const assertUniqueRelatedBlogIds = (ids) => {
    const uniqueIds = [...new Set(ids)];
    if (ids.length !== uniqueIds.length) {
        throw new Error('related_blog_ids cannot contain duplicate IDs');
    }
    return uniqueIds;
};

const parseRelatedBlogIdsField = (field, blogId = null) => {
    const ids = parseJsonOrCsvIds(field, 'related_blog_ids');
    const uniqueIds = assertUniqueRelatedBlogIds(ids);

    if (uniqueIds.length > 3) {
        throw new Error('related_blog_ids cannot contain more than 3 items');
    }

    if (blogId != null && uniqueIds.includes(Number(blogId))) {
        throw new Error('related_blog_ids cannot include the current blog post');
    }

    return uniqueIds;
};

const resolveAuthorId = async (requestedAuthorId, fallbackAuthorId) => {
    const authorId = requestedAuthorId != null && requestedAuthorId !== ''
        ? parseInt(requestedAuthorId, 10)
        : fallbackAuthorId;

    if (Number.isNaN(authorId)) {
        throw new Error('author_id must be a valid integer');
    }

    const author = await User.findByPk(authorId, { attributes: ['id'] });
    if (!author) {
        throw new Error('author_id does not match an existing user');
    }

    return authorId;
};

const attachRelatedBlogFields = (blogData, relatedPosts = []) => {
    const related_blog_ids = relatedPosts
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => relation.related_blog_id);

    const related_blogs = relatedPosts
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => {
            const relatedBlog = relation.relatedBlog;
            if (!relatedBlog) {
                return null;
            }

            const related = relatedBlog.toJSON ? relatedBlog.toJSON() : relatedBlog;
            return {
                id: related.id,
                title: related.title,
                slug: related.slug,
                image_url: related.image_url,
                alt_text: related.alt_text,
                status: related.status,
                published_at: related.status === 'draft' || related.status === 'archived'
                    ? null
                    : related.published_at
            };
        })
        .filter(Boolean);

    return {
        ...blogData,
        sources: blogData.sources ?? [],
        author_override: blogData.author_override ?? null,
        related_blog_ids,
        related_blogs,
        related_posts: related_blogs
    };
};

module.exports = {
    AUTHOR_ATTRIBUTES,
    parseJsonOrCsvIds,
    parseSourcesField,
    assertUniqueRelatedBlogIds,
    parseRelatedBlogIdsField,
    resolveAuthorId,
    attachRelatedBlogFields
};
