'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'author_override', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Optional per-post author display override (does not mutate users)'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('blogs', 'author_override');
  }
};
