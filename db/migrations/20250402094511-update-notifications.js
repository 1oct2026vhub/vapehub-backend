'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Rename column userId to user_id
    await queryInterface.renameColumn('Notifications', 'userId', 'user_id');

    // Add foreign key constraint
    await queryInterface.addConstraint('Notifications', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'fk_notifications_user',
      references: {
        table: 'users',
        field: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert column name change
    await queryInterface.renameColumn('Notifications', 'user_id', 'userId');

    // Remove foreign key constraint
    await queryInterface.removeConstraint('Notifications', 'fk_notifications_user');
  }
};
