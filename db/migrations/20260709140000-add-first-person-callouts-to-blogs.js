'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('blogs', 'first_person_callouts', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Optional per-article first-person warehouse/team callouts (max 2, inline in body)'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('blogs', 'first_person_callouts');
  }
};
