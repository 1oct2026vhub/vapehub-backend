'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'status', {
      type: Sequelize.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
      after: 'content'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('blogs', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_blogs_status;');
  }
};
