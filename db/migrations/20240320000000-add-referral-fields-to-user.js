'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add referred_by column
    await queryInterface.addColumn('users', 'referred_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add referral_points column
    await queryInterface.addColumn('users', 'referral_points', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove referral_points column
    await queryInterface.removeColumn('users', 'referral_points');

    // Remove referred_by column
    await queryInterface.removeColumn('users', 'referred_by');
  }
}; 