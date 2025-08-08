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

    // Add indexes for referral fields
    await queryInterface.addIndex('users', ['referred_by']);
    await queryInterface.addIndex('users', ['referral_points']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex('users', ['referred_by']);
    await queryInterface.removeIndex('users', ['referral_points']);

    // Remove columns
    await queryInterface.removeColumn('users', 'referral_points');
    await queryInterface.removeColumn('users', 'referred_by');
  }
}; 