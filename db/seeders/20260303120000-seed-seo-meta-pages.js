'use strict';

/**
 * Seed SeoMeta entries for indexable "page" URLs that should appear in the sitemap.
 * Only inserts if a row with the same slug does not already exist (safe to re-run).
 *
 * Note: Homepage (/) is not added here; add it in the sitemap generator or create
 * a separate "home" page and have the sitemap emit "/" for that slug.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.vapehub.co.uk';

/** @type {Array<{ slug: string, title: string, description?: string }>} */
const INDEXABLE_PAGES = [
  { slug: 'brands', title: 'Brands | VapeHub UK', description: 'Shop by brand at VapeHub.' },
  { slug: 'contact', title: 'Contact Us | VapeHub UK', description: 'Get in touch with VapeHub.' },
  { slug: 'delivery-information', title: 'Delivery Information | VapeHub UK', description: 'Delivery options and information.' },
  { slug: 'product-reviews', title: 'Product Reviews | VapeHub UK', description: 'Customer and expert vape product reviews.' },
  { slug: 'product-deals', title: 'Product Deals | VapeHub UK', description: 'Current vape deals and offers.' },
  { slug: 'geek-zone', title: 'Geek Zone | VapeHub UK', description: 'Vape tech and enthusiast content.' },
  { slug: 'refillable-pod-kits', title: 'Refillable Pod Kits | VapeHub UK', description: 'Refillable pod vape kits.' },
  { slug: 'pod-kits', title: 'Pod Kits | VapeHub UK', description: 'Pod vape kits and systems.' },
  { slug: 'prefilled-pod-kits', title: 'Pre-filled Pod Kits | VapeHub UK', description: 'Pre-filled pod kits.' },
  { slug: 'nic-salts', title: 'Nic Salts | VapeHub UK', description: 'Nicotine salt e-liquids.' },
  { slug: 'loyalty-points', title: 'Loyalty Points | VapeHub UK', description: 'Earn and redeem loyalty points.' },
  { slug: 'nicotine-strips', title: 'Nicotine Strips | VapeHub UK', description: 'Nicotine strips and oral products.' },
  { slug: 'returns-policy', title: 'Returns Policy | VapeHub UK', description: 'Returns and refunds policy.' },
  { slug: 'e-liquids', title: 'E-Liquids | VapeHub UK', description: 'E-liquids and vape juice.' },
  { slug: 'terms-conditions', title: 'Terms & Conditions | VapeHub UK', description: 'Terms and conditions.' },
  { slug: 'my-account', title: 'My Account | VapeHub UK', description: 'Manage your VapeHub account.' },
  { slug: 'privacy-policy', title: 'Privacy Policy | VapeHub UK', description: 'Privacy policy.' },
  { slug: 'vape-kits', title: 'Vape Kits | VapeHub UK', description: 'Vape kits and devices.' },
  { slug: 'blogs', title: 'Blog | VapeHub UK', description: 'VapeHub blog and guides.' },
  { slug: 'shortfills', title: 'Shortfills | VapeHub UK', description: 'Shortfill e-liquids.' },
  { slug: 'nicotine-pouches', title: 'Nicotine Pouches | VapeHub UK', description: 'Nicotine pouches.' },
  { slug: 'big-puff-vape-kits', title: 'Big Puff Vape Kits | VapeHub UK', description: 'High-puff vape kits.' },
  { slug: 'refillable-pods', title: 'Refillable Pods | VapeHub UK', description: 'Refillable pods.' },
  { slug: 'prefilled-pods', title: 'Pre-filled Pods | VapeHub UK', description: 'Pre-filled pods.' },
  { slug: 'disposable-vapes', title: 'Disposable Vapes | VapeHub UK', description: 'Disposable vapes.' },
  { slug: 'clearance', title: 'Clearance | VapeHub UK', description: 'Clearance vape products.' },
  { slug: 'coils', title: 'Coils | VapeHub UK', description: 'Vape coils and replacements.' },
  { slug: '70-30', title: '70/30 E-Liquid | VapeHub UK', description: '70/30 shortfill e-liquids.' },
  { slug: 'vapehub-deals', title: 'VapeHub Deals | VapeHub UK', description: 'Latest VapeHub deals.' },
  // Deal subpages (product-deals/*) are seeded by 20260303180000-seed-seo-meta-deals.js with entityType 'deals' and entityId from deals table
  { slug: 'pod-kits/refillable-pod-kits', title: 'Refillable Pod Kits | Pod Kits | VapeHub UK', description: 'Refillable pod kits within pod kits.' },
  { slug: 'pod-kits/prefilled-pod-kits', title: 'Pre-filled Pod Kits | Pod Kits | VapeHub UK', description: 'Pre-filled pod kits within pod kits.' },
  { slug: 'pod-kits/pre-filled-pod-kits', title: 'Pre-filled Pod Kits | Pod Kits | VapeHub UK', description: 'Pre-filled pod kits within pod kits.' }
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const slugs = INDEXABLE_PAGES.map((p) => p.slug);
      const placeholders = slugs.map(() => '?').join(', ');
      const [existingRows] = await queryInterface.sequelize.query(
        `SELECT slug FROM seo_meta WHERE slug IN (${placeholders})`,
        {
          replacements: slugs,
          type: Sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const existingSlugs = new Set((existingRows || []).map((r) => r.slug));
      const toInsert = INDEXABLE_PAGES.filter((p) => !existingSlugs.has(p.slug));

      if (toInsert.length === 0) {
        console.log('seed-seo-meta-pages: All page slugs already exist in seo_meta. Nothing to insert.');
        await transaction.commit();
        return;
      }

      const now = new Date();
      const rows = toInsert.map((p) => ({
        entityType: 'page',
        entityId: null,
        title: p.title,
        description: p.description || null,
        description_text: null,
        focusKeyword: null,
        slug: p.slug,
        canonicalUrl: `${FRONTEND_URL}/${p.slug}/`,
        ogImage: null,
        noIndex: false,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      }));

      await queryInterface.bulkInsert('seo_meta', rows, { transaction });
      console.log(`seed-seo-meta-pages: Inserted ${rows.length} page(s) into seo_meta. Skipped ${existingSlugs.size} existing.`);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const slugs = INDEXABLE_PAGES.map((p) => p.slug);
      const placeholders = slugs.map(() => '?').join(', ');
      await queryInterface.sequelize.query(
        `DELETE FROM seo_meta WHERE entityType = 'page' AND entityId IS NULL AND slug IN (${placeholders})`,
        {
          replacements: slugs,
          transaction
        }
      );
      console.log(`seed-seo-meta-pages: Removed ${slugs.length} seeded page(s) from seo_meta.`);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
