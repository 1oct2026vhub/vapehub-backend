'use strict';

/**
 * Seed SeoMeta entries for deals: entityType 'deals', entityId = deal.id, slug = 'product-deals/' + deal.slug.
 * Only inserts if a row with the same slug does not already exist (safe to re-run).
 * Run after migration 20260303180000-add-deals-to-seo-meta-entity-type.js.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.vapehub.co.uk';
const DEAL_SLUG_PREFIX = 'product-deals/';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const [deals] = await queryInterface.sequelize.query(
        `SELECT id, slug, name, description FROM deals WHERE slug IS NOT NULL AND slug != ''`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      if (!deals || deals.length === 0) {
        console.log('seed-seo-meta-deals: No deals found. Nothing to insert.');
        await transaction.commit();
        return;
      }

      const slugs = deals.map((d) => DEAL_SLUG_PREFIX + d.slug);
      const placeholders = slugs.map(() => '?').join(', ');
      const [existingRows] = await queryInterface.sequelize.query(
        `SELECT slug FROM seo_meta WHERE slug IN (${placeholders})`,
        { replacements: slugs, type: Sequelize.QueryTypes.SELECT, transaction }
      );

      const existingSlugs = new Set((existingRows || []).map((r) => r.slug));
      const toInsert = deals.filter((d) => !existingSlugs.has(DEAL_SLUG_PREFIX + d.slug));

      if (toInsert.length === 0) {
        console.log('seed-seo-meta-deals: All deal slugs already exist in seo_meta. Nothing to insert.');
        await transaction.commit();
        return;
      }

      const now = new Date();
      const rows = toInsert.map((d) => {
        const slug = DEAL_SLUG_PREFIX + d.slug;
        const title = (d.name && `${d.name} | Product Deals | VapeHub UK`) || `Deal | VapeHub UK`;
        const description = (d.description && String(d.description).replace(/<[^>]*>/g, ' ').trim().slice(0, 300)) || null;
        return {
          entityType: 'deals',
          entityId: d.id,
          title,
          description: description || `${d.name || 'Deal'} at VapeHub.`,
          description_text: null,
          focusKeyword: null,
          slug,
          canonicalUrl: `${FRONTEND_URL}/${slug}/`,
          ogImage: null,
          noIndex: false,
          updatedBy: null,
          createdAt: now,
          updatedAt: now
        };
      });

      await queryInterface.bulkInsert('seo_meta', rows, { transaction });
      console.log(`seed-seo-meta-deals: Inserted ${rows.length} deal(s) into seo_meta. Skipped ${existingSlugs.size} existing.`);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const [result] = await queryInterface.sequelize.query(
        `DELETE FROM seo_meta WHERE entityType = 'deals'`,
        { transaction }
      );
      const deleted = (result && result.affectedRows) ? result.affectedRows : 0;
      console.log(`seed-seo-meta-deals: Removed ${deleted} deal(s) from seo_meta.`);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
