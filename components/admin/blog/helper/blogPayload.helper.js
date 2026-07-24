const { User, Product, Category } = require('../../../../models');

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

const INLINE_PRODUCT_CARD_ENTITY_TYPES = ['product', 'category'];
const INLINE_PRODUCT_CARD_LOCATION = 'mid_article';

const parseInlineProductCardField = async (field) => {
    if (field == null || field === '' || field === '{}' || field === 'null') {
        return null;
    }

    let inlineProductCard = field;
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed || trimmed === '{}' || trimmed === 'null') {
            return null;
        }
        inlineProductCard = JSON.parse(trimmed);
    }

    if (inlineProductCard == null) {
        return null;
    }

    if (typeof inlineProductCard !== 'object' || Array.isArray(inlineProductCard)) {
        throw new Error('inline_product_card must be a JSON object');
    }

    const entityType = inlineProductCard.entity_type != null
        ? String(inlineProductCard.entity_type).trim().toLowerCase()
        : '';
    const entityId = inlineProductCard.entity_id != null
        ? parseInt(inlineProductCard.entity_id, 10)
        : NaN;
    const blurb = inlineProductCard.blurb != null ? String(inlineProductCard.blurb).trim() : '';
    const title = inlineProductCard.title != null && String(inlineProductCard.title).trim() !== ''
        ? String(inlineProductCard.title).trim()
        : null;
    const ctaLabel = inlineProductCard.cta_label != null && String(inlineProductCard.cta_label).trim() !== ''
        ? String(inlineProductCard.cta_label).trim()
        : null;

    if (!INLINE_PRODUCT_CARD_ENTITY_TYPES.includes(entityType)) {
        throw new Error(`inline_product_card.entity_type must be one of: ${INLINE_PRODUCT_CARD_ENTITY_TYPES.join(', ')}`);
    }
    if (Number.isNaN(entityId) || entityId <= 0) {
        throw new Error('inline_product_card.entity_id must be a valid positive integer');
    }
    if (!blurb) {
        throw new Error('inline_product_card.blurb is required');
    }
    if (blurb.length > 500) {
        throw new Error('inline_product_card.blurb must be 500 characters or fewer');
    }
    if (title && title.length > 255) {
        throw new Error('inline_product_card.title must be 255 characters or fewer');
    }
    if (ctaLabel && ctaLabel.length > 80) {
        throw new Error('inline_product_card.cta_label must be 80 characters or fewer');
    }

    if (entityType === 'product') {
        const product = await Product.findOne({
            where: { id: entityId, status: 'published' },
            attributes: ['id']
        });
        if (!product) {
            throw new Error('inline_product_card.entity_id does not match a published product');
        }
    } else {
        const category = await Category.findByPk(entityId, { attributes: ['id'] });
        if (!category) {
            throw new Error('inline_product_card.entity_id does not match an existing category');
        }
    }

    return {
        entity_type: entityType,
        entity_id: entityId,
        blurb,
        ...(title ? { title } : {}),
        ...(ctaLabel ? { cta_label: ctaLabel } : {}),
        location: INLINE_PRODUCT_CARD_LOCATION
    };
};

const FIRST_PERSON_CALLOUT_DEFAULT_LABEL = 'FROM OUR WAREHOUSE';
const FIRST_PERSON_CALLOUT_LOCATION = 'inline_body';
const FIRST_PERSON_CALLOUT_MAX_ITEMS = 2;
const FIRST_PERSON_CALLOUT_BODY_MAX_CHARS = 2000;
const FIRST_PERSON_CALLOUT_HEADING_MAX_CHARS = 255;
const FIRST_PERSON_CALLOUT_LABEL_MAX_CHARS = 80;

const parseFirstPersonCalloutsField = (field) => {
    if (field == null || field === '' || field === '[]' || field === 'null') {
        return [];
    }

    let callouts = field;
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed || trimmed === '[]' || trimmed === 'null') {
            return [];
        }
        callouts = JSON.parse(trimmed);
    }

    if (!Array.isArray(callouts)) {
        throw new Error('first_person_callouts must be a JSON array');
    }

    if (callouts.length > FIRST_PERSON_CALLOUT_MAX_ITEMS) {
        throw new Error(`first_person_callouts cannot contain more than ${FIRST_PERSON_CALLOUT_MAX_ITEMS} items`);
    }

    const normalized = callouts.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`first_person_callouts[${index}] must be an object`);
        }

        const labelRaw = item.label != null ? String(item.label).trim() : '';
        const label = labelRaw || FIRST_PERSON_CALLOUT_DEFAULT_LABEL;
        const heading = item.heading != null ? String(item.heading).trim() : '';
        const body = item.body != null ? String(item.body).trim() : '';
        const insertAfterParagraph = item.insert_after_paragraph != null
            ? parseInt(item.insert_after_paragraph, 10)
            : NaN;

        if (label.length > FIRST_PERSON_CALLOUT_LABEL_MAX_CHARS) {
            throw new Error(`first_person_callouts[${index}].label must be ${FIRST_PERSON_CALLOUT_LABEL_MAX_CHARS} characters or fewer`);
        }
        if (!heading) {
            throw new Error(`first_person_callouts[${index}].heading is required`);
        }
        if (heading.length > FIRST_PERSON_CALLOUT_HEADING_MAX_CHARS) {
            throw new Error(`first_person_callouts[${index}].heading must be ${FIRST_PERSON_CALLOUT_HEADING_MAX_CHARS} characters or fewer`);
        }
        if (!body) {
            throw new Error(`first_person_callouts[${index}].body is required`);
        }
        if (body.length > FIRST_PERSON_CALLOUT_BODY_MAX_CHARS) {
            throw new Error(`first_person_callouts[${index}].body must be ${FIRST_PERSON_CALLOUT_BODY_MAX_CHARS} characters or fewer`);
        }
        if (Number.isNaN(insertAfterParagraph) || insertAfterParagraph < 1) {
            throw new Error(`first_person_callouts[${index}].insert_after_paragraph must be a positive integer`);
        }

        return {
            label,
            heading,
            body,
            insert_after_paragraph: insertAfterParagraph,
            location: FIRST_PERSON_CALLOUT_LOCATION
        };
    });

    const paragraphPositions = normalized.map((item) => item.insert_after_paragraph);
    if (new Set(paragraphPositions).size !== paragraphPositions.length) {
        throw new Error('first_person_callouts cannot share the same insert_after_paragraph value');
    }

    return normalized.sort((a, b) => a.insert_after_paragraph - b.insert_after_paragraph);
};

const formatFirstPersonCallouts = (callouts) => {
    if (!Array.isArray(callouts) || callouts.length === 0) {
        return [];
    }

    return callouts
        .map((item) => ({
            label: item.label || FIRST_PERSON_CALLOUT_DEFAULT_LABEL,
            heading: item.heading,
            body: item.body,
            insert_after_paragraph: item.insert_after_paragraph,
            location: item.location || FIRST_PERSON_CALLOUT_LOCATION
        }))
        .sort((a, b) => a.insert_after_paragraph - b.insert_after_paragraph);
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
        inline_product_card: blogData.inline_product_card ?? null,
        first_person_callouts: blogData.first_person_callouts ?? [],
        author_override: blogData.author_override ?? null,
        related_blog_ids,
        related_blogs
    };
};

module.exports = {
    AUTHOR_ATTRIBUTES,
    PULL_QUOTE_SOURCE_TYPES,
    PULL_QUOTE_LOCATION,
    INLINE_PRODUCT_CARD_ENTITY_TYPES,
    INLINE_PRODUCT_CARD_LOCATION,
    FIRST_PERSON_CALLOUT_DEFAULT_LABEL,
    FIRST_PERSON_CALLOUT_LOCATION,
    FIRST_PERSON_CALLOUT_MAX_ITEMS,
    parseJsonOrCsvIds,
    parseSourcesField,
    parsePullQuoteField,
    parseInlineProductCardField,
    parseFirstPersonCalloutsField,
    formatFirstPersonCallouts,
    parseRelatedBlogIdsField,
    resolveAuthorId,
    attachRelatedBlogFields
};
