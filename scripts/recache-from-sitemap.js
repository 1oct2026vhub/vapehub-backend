'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { collectSitemapEntries } = require('../components/seo/helper/sitemap.generator');
const { recacheUrls, buildPublicUrl } = require('../library/prerender');

async function main() {
    const entries = await collectSitemapEntries();
    const urls = entries.map((entry) => buildPublicUrl(entry.path));

    console.log(`Recaching ${urls.length} URLs from sitemap...`);
    await recacheUrls(urls);
    console.log('Done.');
}

main().catch((error) => {
    console.error('Recache failed:', error.message);
    process.exit(1);
});
