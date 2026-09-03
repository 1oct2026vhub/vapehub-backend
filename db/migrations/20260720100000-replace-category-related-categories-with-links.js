'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('category_related_categories', null, {});

    await queryInterface.removeConstraint(
      'category_related_categories',
      'crc_category_id_related_category_id_unique'
    ).catch(() => {});

    await queryInterface.removeIndex(
      'category_related_categories',
      ['related_category_id']
    ).catch(() => {});

    await queryInterface.removeColumn('category_related_categories', 'related_category_id');

    await queryInterface.addColumn('category_related_categories', 'text', {
      type: Sequelize.STRING(255),
      allowNull: false
    });

    await queryInterface.addColumn('category_related_categories', 'url', {
      type: Sequelize.STRING(500),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('category_related_categories', null, {});

    await queryInterface.removeColumn('category_related_categories', 'text');
    await queryInterface.removeColumn('category_related_categories', 'url');

    await queryInterface.addColumn('category_related_categories', 'related_category_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'categories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addConstraint('category_related_categories', {
      fields: ['category_id', 'related_category_id'],
      type: 'unique',
      name: 'crc_category_id_related_category_id_unique'
    });

    await queryInterface.addIndex('category_related_categories', ['related_category_id']);
  }
};
