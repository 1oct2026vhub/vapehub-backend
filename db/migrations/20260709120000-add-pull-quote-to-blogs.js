'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'pull_quote', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Optional per-article pull quote with external authoritative attribution'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('blogs', 'pull_quote');
  }
};
