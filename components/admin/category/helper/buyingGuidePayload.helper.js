const MAX_HIGHLIGHTS = 3;
const MAX_RELATED_BLOGS = 3;

const parseBooleanField = (value, fieldName = 'is_enabled') => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new Error(`${fieldName} must be a boolean`);
};

const parseJsonArrayField = (field, fieldName) => {
    if (field == null || field === '') {
        return [];
    }

    if (Array.isArray(field)) {
        return field;
    }

    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed) {
            return [];
        }
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error(`${fieldName} must be a JSON array`);
        }
        return parsed;
    }

    throw new Error(`${fieldName} must be a JSON array`);
};

const parseIntegerArrayField = (field, fieldName) => {
    const values = parseJsonArrayField(field, fieldName);
    return values
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
};

const normalizeHighlights = (highlights = []) => {
    const normalized = highlights
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }
            const text = item.text != null ? String(item.text).trim() : '';
            return text ? { text } : null;
        })
        .filter(Boolean);

    if (normalized.length > MAX_HIGHLIGHTS) {
        throw new Error('Maximum 3 highlights allowed');
    }

    return normalized;
};

const normalizeTabs = (tabs = []) => {
    if (!Array.isArray(tabs)) {
        throw new Error('tabs must be a JSON array');
    }

    return tabs.map((tab, index) => {
        if (!tab || typeof tab !== 'object') {
            throw new Error(`tabs[${index}] must be an object`);
        }

        const tab_title = tab.tab_title != null ? String(tab.tab_title).trim() : '';
        const section_heading = tab.section_heading != null ? String(tab.section_heading).trim() : '';
        const section_body = tab.section_body != null ? String(tab.section_body) : '';
        const order = tab.order != null && tab.order !== ''
            ? parseInt(tab.order, 10)
            : index;

        return {
            tab_title,
            section_heading,
            section_body,
            order: Number.isNaN(order) ? index : order
        };
    });
};

const assertUniqueRelatedBlogIds = (ids) => {
    const uniqueIds = [...new Set(ids)];
    if (ids.length !== uniqueIds.length) {
        throw new Error('Duplicate related blog IDs are not allowed');
    }
    return uniqueIds;
};

const normalizeRelatedBlogIds = (field) => {
    const ids = parseIntegerArrayField(field, 'related_blog_ids');
    const uniqueIds = assertUniqueRelatedBlogIds(ids);

    if (uniqueIds.length > MAX_RELATED_BLOGS) {
        throw new Error('Maximum 3 related blogs allowed');
    }

    return uniqueIds;
};

const parseBannerImageField = (value) => {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || value === 'null' || value === '') {
        return null;
    }
    return String(value).trim();
};

const parseBuyingGuideBody = (body = {}) => {
    if (body.is_enabled === undefined || body.is_enabled === null || body.is_enabled === '') {
        throw new Error('is_enabled is required');
    }

    const is_enabled = parseBooleanField(body.is_enabled);
    const payload = { is_enabled };

    if (!is_enabled) {
        return payload;
    }

    payload.guide_label = body.guide_label != null ? String(body.guide_label).trim() : '';
    payload.title = body.title != null ? String(body.title).trim() : '';
    payload.intro_content = body.intro_content != null ? String(body.intro_content) : '';
    payload.banner_alt = body.banner_alt != null ? String(body.banner_alt).trim() : '';
    payload.highlights = normalizeHighlights(
        body.highlights !== undefined ? parseJsonArrayField(body.highlights, 'highlights') : []
    );
    payload.tabs = normalizeTabs(
        body.tabs !== undefined ? parseJsonArrayField(body.tabs, 'tabs') : []
    );
    payload.related_blog_ids = normalizeRelatedBlogIds(
        body.related_blog_ids !== undefined ? body.related_blog_ids : []
    );

    const bannerImage = parseBannerImageField(body.banner_image);
    if (bannerImage !== undefined) {
        payload.banner_image = bannerImage;
    }

    return payload;
};

const validateEnabledBuyingGuide = (payload) => {
    if (!payload.guide_label) {
        throw new Error('Guide label is required');
    }
    if (!payload.title) {
        throw new Error('Title is required');
    }
    if (!payload.tabs || payload.tabs.length === 0) {
        throw new Error('At least one tab is required');
    }

    const orders = payload.tabs.map((tab) => tab.order);
    if (orders.length !== new Set(orders).size) {
        throw new Error('Tab order values must be unique');
    }

    payload.tabs.forEach((tab) => {
        if (!tab.tab_title) {
            throw new Error('Tab title is required');
        }
        if (!tab.section_heading) {
            throw new Error('Section heading is required');
        }
        if (!tab.section_body || !tab.section_body.trim()) {
            throw new Error('Section body is required');
        }
    });
};

const validateBuyingGuidePayload = (payload) => {
    if (payload.is_enabled) {
        validateEnabledBuyingGuide(payload);
        if (payload.related_blog_ids) {
            normalizeRelatedBlogIds(payload.related_blog_ids);
        }
    }
};

const extractS3KeyFromUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return null;
    }
    if (url.includes('.amazonaws.com/')) {
        return url.split('.amazonaws.com/')[1];
    }
    if (url.includes('.cloudfront.net/')) {
        return url.split('.cloudfront.net/')[1];
    }
    return null;
};

module.exports = {
    MAX_HIGHLIGHTS,
    MAX_RELATED_BLOGS,
    parseBuyingGuideBody,
    validateBuyingGuidePayload,
    parseBooleanField,
    parseJsonArrayField,
    parseIntegerArrayField,
    normalizeHighlights,
    normalizeTabs,
    normalizeRelatedBlogIds,
    parseBannerImageField,
    extractS3KeyFromUrl
};
