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

const PULL_QUOTE_SOURCE_TYPES = ['UKVIA', 'MHRA', 'OHID', 'peer_reviewed'];
const PULL_QUOTE_LOCATION = 'mid_body_after_h2';
const INTERNAL_ATTRIBUTION_PATTERN = /\b(vape\s*hub|geek\s*zone|editorial\s*team|product\s*team)\b/i;
const INTERNAL_SOURCE_HOST_PATTERN = /vapehub/i;

const parsePullQuoteField = (field) => {
    if (field == null || field === '' || field === '{}' || field === 'null') {
        return null;
    }

    let pullQuote = field;
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed || trimmed === '{}' || trimmed === 'null') {
            return null;
        }
        pullQuote = JSON.parse(trimmed);
    }

    if (pullQuote == null) {
        return null;
    }

    if (typeof pullQuote !== 'object' || Array.isArray(pullQuote)) {
        throw new Error('pull_quote must be a JSON object');
    }

    const body = pullQuote.body != null ? String(pullQuote.body).trim() : '';
    const attribution = pullQuote.attribution != null ? String(pullQuote.attribution).trim() : '';
    const sourceUrl = pullQuote.source_url != null ? String(pullQuote.source_url).trim() : '';
    const sourceType = pullQuote.source_type != null ? String(pullQuote.source_type).trim() : '';

    if (!body) {
        throw new Error('pull_quote.body is required');
    }
    if (body.length > 1000) {
        throw new Error('pull_quote.body must be 1000 characters or fewer');
    }
    if (!attribution) {
        throw new Error('pull_quote.attribution is required');
    }
    if (attribution.length > 255) {
        throw new Error('pull_quote.attribution must be 255 characters or fewer');
    }
    if (INTERNAL_ATTRIBUTION_PATTERN.test(attribution)) {
        throw new Error('pull_quote.attribution must reference an authoritative external source, not internal staff or brand');
    }
    if (!sourceUrl) {
        throw new Error('pull_quote.source_url is required');
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(sourceUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('invalid protocol');
        }
    } catch {
        throw new Error('pull_quote.source_url must be a valid URL with http or https');
    }

    if (INTERNAL_SOURCE_HOST_PATTERN.test(parsedUrl.hostname)) {
        throw new Error('pull_quote.source_url must point to an external authoritative source');
    }

    if (!sourceType || !PULL_QUOTE_SOURCE_TYPES.includes(sourceType)) {
        throw new Error(`pull_quote.source_type must be one of: ${PULL_QUOTE_SOURCE_TYPES.join(', ')}`);
    }

    return {
        body,
        attribution,
        source_url: sourceUrl,
        source_type: sourceType,
        location: PULL_QUOTE_LOCATION
    };
};

const parseRelatedBlogIdsField = (field, blogId = null) => {
    const ids = parseJsonOrCsvIds(field, 'related_blog_ids');
    const uniqueIds = [...new Set(ids)];

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
        pull_quote: blogData.pull_quote ?? null,
        author_override: blogData.author_override ?? null,
        related_blog_ids,
        related_blogs
    };
};

module.exports = {
    AUTHOR_ATTRIBUTES,
    PULL_QUOTE_SOURCE_TYPES,
    PULL_QUOTE_LOCATION,
    parseJsonOrCsvIds,
    parseSourcesField,
    parsePullQuoteField,
    parseRelatedBlogIdsField,
    resolveAuthorId,
    attachRelatedBlogFields
};
