'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const MAPPINGS = [
      { sources: "/product/hayati-moxy-pro-pod-kit", url_to: "https://www.vapehub.co.uk/hayati-moxy-pro-pod-kit/", slug: "hayati-moxy-pro-pod-kit", oldUrlRaw: "https://www.vapehub.co.uk/product/hayati-moxy-pro-pod-kit/", redirectToRaw: "https://www.vapehub.co.uk/hayati-moxy-pro-pod-kit/" },
      { sources: "/product/hayati-moxy-elite-pod-kit", url_to: "https://www.vapehub.co.uk/hayati-moxy-elite-pod-kit/", slug: "hayati-moxy-elite-pod-kit", oldUrlRaw: "https://www.vapehub.co.uk/product/hayati-moxy-elite-pod-kit/", redirectToRaw: "https://www.vapehub.co.uk/hayati-moxy-elite-pod-kit/" },
      { sources: "/product/hayati-moxy-lite-pod-kit", url_to: "https://www.vapehub.co.uk/hayati-moxy-lite-pod-kit/", slug: "hayati-moxy-lite-pod-kit", oldUrlRaw: "https://www.vapehub.co.uk/product/hayati-moxy-lite-pod-kit/", redirectToRaw: "https://www.vapehub.co.uk/hayati-moxy-lite-pod-kit/" },
      { sources: "/product/hayati-pro-max-plus-pods", url_to: "https://www.vapehub.co.uk/hayati-pro-max-plus-pods/", slug: "hayati-pro-max-plus-pods", oldUrlRaw: "https://www.vapehub.co.uk/product/hayati-pro-max-plus-pods/", redirectToRaw: "https://www.vapehub.co.uk/hayati-pro-max-plus-pods/" },
      { sources: "/2022/12/09/vaping-vs-smoking", url_to: "https://www.vapehub.co.uk/vaping-vs-smoking/", slug: "vaping-vs-smoking", oldUrlRaw: "https://www.vapehub.co.uk/2022/12/09/vaping-vs-smoking/", redirectToRaw: "https://www.vapehub.co.uk/vaping-vs-smoking/" },
      { sources: "/sky-crystal-legend-4000", url_to: "https://www.vapehub.co.uk/sky-crystal-legend-4000-product-review/", slug: "sky-crystal-legend-4000", oldUrlRaw: "https://www.vapehub.co.uk/sky-crystal-legend-4000/", redirectToRaw: "https://www.vapehub.co.uk/sky-crystal-legend-4000-product-review/" },
      { sources: "/product/sky-crystal-legend-4000", url_to: "https://www.vapehub.co.uk/sky-crystal-legend-4000-product-review/", slug: "sky-crystal-legend-4000", oldUrlRaw: "https://www.vapehub.co.uk/product/sky-crystal-legend-4000/", redirectToRaw: "https://www.vapehub.co.uk/sky-crystal-legend-4000-product-review/" },
      { sources: "/product/lost-mary-bm3500", url_to: "https://www.vapehub.co.uk/lost-mary-bm3500-product-review/", slug: "lost-mary-bm3500", oldUrlRaw: "https://www.vapehub.co.uk/product/lost-mary-bm3500/", redirectToRaw: "https://www.vapehub.co.uk/lost-mary-bm3500-product-review/" },
      { sources: "/replacement-pods", url_to: "https://www.vapehub.co.uk/replacement-vape-pods/", slug: "replacement-pods", oldUrlRaw: "https://www.vapehub.co.uk/replacement-pods/", redirectToRaw: "https://www.vapehub.co.uk/replacement-vape-pods/" },
      { sources: "/product-category/nic-salts", url_to: "https://www.vapehub.co.uk/nic-salts/", slug: "nic-salts", oldUrlRaw: "https://www.vapehub.co.uk/product-category/nic-salts/", redirectToRaw: "https://www.vapehub.co.uk/nic-salts/" },
      { sources: "/product-category/vape-kits", url_to: "https://www.vapehub.co.uk/vape-kits/", slug: "vape-kits", oldUrlRaw: "https://www.vapehub.co.uk/product-category/vape-kits/", redirectToRaw: "https://www.vapehub.co.uk/vape-kits/" },
      { sources: "/product-category/tanks", url_to: "https://www.vapehub.co.uk/tanks/", slug: "tanks", oldUrlRaw: "https://www.vapehub.co.uk/product-category/tanks/", redirectToRaw: "https://www.vapehub.co.uk/tanks/" },
      { sources: "/product-category/e-liquids", url_to: "https://www.vapehub.co.uk/e-liquids/", slug: "e-liquids", oldUrlRaw: "https://www.vapehub.co.uk/product-category/e-liquids/", redirectToRaw: "https://www.vapehub.co.uk/e-liquids/" },
      { sources: "/product-category/disposable-vapes", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "disposable-vapes", oldUrlRaw: "https://www.vapehub.co.uk/product-category/disposable-vapes/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/product-tag/multibuy-5-for-10", url_to: "https://www.vapehub.co.uk/product-deals/buy-5-for-10/", slug: "multibuy-5-for-10", oldUrlRaw: "https://www.vapehub.co.uk/product-tag/multibuy-5-for-10/", redirectToRaw: "https://www.vapehub.co.uk/product-deals/buy-5-for-10/" },
      { sources: "/product-tag/disposables-5-for-18-50", url_to: "https://www.vapehub.co.uk/product-deals/", slug: "disposables-5-for-18-50", oldUrlRaw: "https://www.vapehub.co.uk/product-tag/disposables-5-for-18-50/", redirectToRaw: "https://www.vapehub.co.uk/product-deals/" },
      { sources: "/product-tag/disposables-10-for-25", url_to: "https://www.vapehub.co.uk/product-deals/", slug: "disposables-10-for-25", oldUrlRaw: "https://www.vapehub.co.uk/product-tag/disposables-10-for-25/", redirectToRaw: "https://www.vapehub.co.uk/product-deals/" },
      { sources: "/product-tag/nic-salts-4-for-10", url_to: "https://www.vapehub.co.uk/product-deals/buy-5-for-10/", slug: "nic-salts-4-for-10", oldUrlRaw: "https://www.vapehub.co.uk/product-tag/nic-salts-4-for-10/", redirectToRaw: "https://www.vapehub.co.uk/product-deals/buy-5-for-10/" },
      { sources: "/vaporesso-luxe-x-pod-vape-kit", url_to: "https://www.vapehub.co.uk/vaporesso-luxe-x2-pod-vape-kit/", slug: "vaporesso-luxe-x-pod-vape-kit", oldUrlRaw: "https://www.vapehub.co.uk/vaporesso-luxe-x-pod-vape-kit/", redirectToRaw: "https://www.vapehub.co.uk/vaporesso-luxe-x2-pod-vape-kit/" },
      { sources: "/product/elux-legend-3500", url_to: "https://www.vapehub.co.uk/elux-legend-3500-review/", slug: "elux-legend-3500", oldUrlRaw: "https://www.vapehub.co.uk/product/elux-legend-3500/", redirectToRaw: "https://www.vapehub.co.uk/elux-legend-3500-review/" },
      { sources: "/watermelon-ice-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "watermelon-ice-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/watermelon-ice-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/double-apple-explosion-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "double-apple-explosion-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/double-apple-explosion-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/pink-grapefruit-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "pink-grapefruit-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/pink-grapefruit-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/blue-fusion-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "blue-fusion-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/blue-fusion-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/red-apple-ice-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "red-apple-ice-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/red-apple-ice-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/lemon-lime-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "lemon-lime-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/lemon-lime-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/cherry-peach-lemonade-fizzle-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "cherry-peach-lemonade-fizzle-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/cherry-peach-lemonade-fizzle-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/pineapple-ice-amare-crystal-one-disposable-vape", url_to: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/", slug: "pineapple-ice-amare-crystal-one-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/pineapple-ice-amare-crystal-one-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/small-puff-prefilled-vape-kits/" },
      { sources: "/sour-blueberries-crystal-bar-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "sour-blueberries-crystal-bar-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/sour-blueberries-crystal-bar-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/product/ske-crystal-bar-sour-apple-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "ske-crystal-bar-sour-apple-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/product/ske-crystal-bar-sour-apple-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/watermelon-ice-crystal-bar-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "watermelon-ice-crystal-bar-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/watermelon-ice-crystal-bar-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/tiger-blood-crystal-bar-ske-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "tiger-blood-crystal-bar-ske-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/tiger-blood-crystal-bar-ske-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/strawberry-blast-crystal-bar-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "strawberry-blast-crystal-bar-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/strawberry-blast-crystal-bar-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/sour-apple-blueberry-crystal-bar-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "sour-apple-blueberry-crystal-bar-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/sour-apple-blueberry-crystal-bar-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/ske-crystal-super-max-4500", url_to: "https://www.vapehub.co.uk/brand/ske-crystal-bar/", slug: "ske-crystal-super-max-4500", oldUrlRaw: "https://www.vapehub.co.uk/ske-crystal-super-max-4500/", redirectToRaw: "https://www.vapehub.co.uk/brand/ske-crystal-bar/" },
      { sources: "/elux-firerose-ex4500-disposable-vape", url_to: "https://www.vapehub.co.uk/brand/firerose-5000/", slug: "elux-firerose-ex4500-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/elux-firerose-ex4500-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/brand/firerose-5000/" },
      { sources: "/product/elf-bar-600-strawberry-raspberry-cherry-ice-disposable-vape", url_to: "https://www.vapehub.co.uk/elf-bar-600-prefilled-pod-kit/", slug: "elf-bar-600-strawberry-raspberry-cherry-ice-disposable-vape", oldUrlRaw: "https://www.vapehub.co.uk/product/elf-bar-600-strawberry-raspberry-cherry-ice-disposable-vape/", redirectToRaw: "https://www.vapehub.co.uk/elf-bar-600-prefilled-pod-kit/" },
      { sources: "/smok-novo-x-pod-kit-25-watt", url_to: "https://www.vapehub.co.uk/brand/smok/", slug: "smok-novo-x-pod-kit-25-watt", oldUrlRaw: "https://www.vapehub.co.uk/smok-novo-x-pod-kit-25-watt/", redirectToRaw: "https://www.vapehub.co.uk/brand/smok/" },
      { sources: "/smok-novo-4-mini-pod-kit-20-watt", url_to: "https://www.vapehub.co.uk/brand/smok/", slug: "smok-novo-4-mini-pod-kit-20-watt", oldUrlRaw: "https://www.vapehub.co.uk/smok-novo-4-mini-pod-kit-20-watt/", redirectToRaw: "https://www.vapehub.co.uk/brand/smok/" }
      ];

      const existing = await queryInterface.sequelize.query(
        "SELECT sources, url_to FROM redirects WHERE deletedAt IS NULL",
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );
      const existingMap = new Map(existing.map((r) => [String(r.sources), String(r.url_to || '')]));

      const now = new Date();
      const inserts = [];
      const updates = [];

      for (const m of MAPPINGS) {
        if (!m.sources || !m.url_to) continue;
        const currentUrl = existingMap.get(m.sources);

        if (currentUrl != null) {
          if (currentUrl !== m.url_to) {
            updates.push({
              sources: m.sources,
              url_to: m.url_to,
              header_code: 301,
              status: 'active',
              entity_type: 'product',
              slug: m.slug,
              meta_data: JSON.stringify({
                imported_from: "vapehub_404_redirect_list_csv",
                old_url_raw: m.oldUrlRaw,
                redirect_to_raw: m.redirectToRaw,
              }),
              updatedAt: now,
            });
          }
          continue;
        }

        inserts.push({
          sources: m.sources,
          url_to: m.url_to,
          header_code: 301,
          status: 'active',
          entity_type: 'product',
          slug: m.slug,
          meta_data: JSON.stringify({
            imported_from: "vapehub_404_redirect_list_csv",
            old_url_raw: m.oldUrlRaw,
            redirect_to_raw: m.redirectToRaw,
          }),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }

      if (inserts.length) {
        await queryInterface.bulkInsert('redirects', inserts, { transaction });
      }

      for (const u of updates) {
        await queryInterface.bulkUpdate(
          'redirects',
          {
            url_to: u.url_to,
            header_code: u.header_code,
            status: u.status,
            entity_type: u.entity_type,
            slug: u.slug,
            meta_data: u.meta_data,
            updatedAt: u.updatedAt,
          },
          { sources: u.sources, deletedAt: null },
          { transaction }
        );
      }

      if (!inserts.length && !updates.length) {
        console.log('No changes needed (all 404 redirects already up-to-date).');
      } else {
        console.log(`Inserted ${inserts.length} and updated ${updates.length} 404 redirects.`);
      }

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `DELETE FROM redirects
        WHERE meta_data IS NOT NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(meta_data, '$.imported_from')) = "vapehub_404_redirect_list_csv"`,
      { type: Sequelize.QueryTypes.BULKDELETE }
    );
  },
};
