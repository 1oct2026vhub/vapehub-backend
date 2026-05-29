/**
 * Strip HTML and truncate text for SEO meta descriptions.
 * @param {string|null|undefined} text
 * @param {number} [maxLength=160]
 * @returns {string|null}
 */
const toMetaDescription = (text, maxLength = 160) => {
    if (!text) return null;

    let cleanText = text.replace(/<[^>]*>/g, '');
    cleanText = cleanText.replace(/\n+/g, ' ');
    cleanText = cleanText.replace(/\s+/g, ' ').trim();

    if (cleanText.length > maxLength) {
        cleanText = cleanText.substring(0, maxLength).trim();
        const lastSpace = cleanText.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.8) {
            cleanText = cleanText.substring(0, lastSpace);
        }
        cleanText += '...';
    }

    return cleanText || null;
};

module.exports = { toMetaDescription };
