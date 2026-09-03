'use strict';

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM settings WHERE content_key = 'product_sticker_defaults' AND deleted_at IS NULL LIMIT 1`
    );
    if (existing.length > 0) return;

    const defaults = {
      new: {
        enabled: true,
        sticker_name: 'NEW',
        background_color: '#000000',
        duration_days: 30,
        respect_is_new_flag: true,
      },
      new_flavours: {
        enabled: true,
        sticker_name: 'NEW FLAVOURS',
        background_color: '#00A651',
        min_product_age_days: 30,
        duration_days: 28,
      },
    };

    await queryInterface.bulkInsert('settings', [{
      content_key: 'product_sticker_defaults',
      content: JSON.stringify(defaults),
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', {
      content_key: 'product_sticker_defaults',
    });
  },
};
