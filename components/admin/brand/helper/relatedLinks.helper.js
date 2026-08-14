const { BrandRelatedLink } = require('../../../../models');

const URL_PATTERN = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
const SLUG_OR_PATH_PATTERN = /^(\/)?[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const formatRelatedLink = (row) => {
    const data = row.toJSON ? row.toJSON() : row;
    return {
        text: data.text,
        url: data.url,
        sort_order: data.sort_order
    };
};

const findRelatedLinksByBrandId = async (brandId, transaction = null) => {
    const links = await BrandRelatedLink.findAll({
        where: { brand_id: brandId },
        order: [['sort_order', 'ASC']],
        transaction
    });

    return links.map(formatRelatedLink);
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

const validateUrl = (url) => {
    if (URL_PATTERN.test(url) || SLUG_OR_PATH_PATTERN.test(url)) {
        return;
    }
    throw new Error('URL must be a valid URL, slug, or path (e.g. /disposable-vapes)');
};

const parseRelatedLinks = (field) => {
    const items = parseJsonArrayField(field, 'related_links');

    const normalized = items.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`related_links[${index}] must be an object`);
        }

        const text = item.text != null ? String(item.text).trim() : '';
        const url = item.url != null ? String(item.url).trim() : '';

        if (!text) {
            throw new Error(`related_links[${index}].text is required`);
        }
        if (!url) {
            throw new Error(`related_links[${index}].url is required`);
        }

        validateUrl(url);

        return { text, url };
    });

    return normalized;
};

const replaceRelatedLinks = async (brandId, relatedLinks, transaction) => {
    await BrandRelatedLink.destroy({
        where: { brand_id: brandId },
        transaction
    });

    if (!relatedLinks.length) {
        return;
    }

    await BrandRelatedLink.bulkCreate(
        relatedLinks.map((link, index) => ({
            brand_id: brandId,
            text: link.text,
            url: link.url,
            sort_order: index
        })),
        { transaction }
    );
};

module.exports = {
    findRelatedLinksByBrandId,
    parseRelatedLinks,
    replaceRelatedLinks,
    formatRelatedLink
};
