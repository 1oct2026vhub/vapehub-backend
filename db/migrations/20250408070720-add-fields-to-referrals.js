'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('referrals', 'referred_user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('referrals', 'referral_value_type', {
      type: Sequelize.ENUM('percentage', 'fixed'),
      allowNull: true,
      defaultValue: 'percentage'
    });

    await queryInterface.addColumn('referrals', 'referral_value', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('referrals', 'referred_user_id');
    await queryInterface.removeColumn('referrals', 'referral_value_type');
    await queryInterface.removeColumn('referrals', 'referral_value');
  }
}; 