'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('referral_methods', 'refer_type', {
      type: Sequelize.ENUM('referrer', 'referral'),
      allowNull: false,
      defaultValue: 'referrer'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('referral_methods', 'refer_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_referral_methods_refer_type;');
  }
}; 