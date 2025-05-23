'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Using raw query to modify the column type to BOOLEAN
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications MODIFY is_admin BOOLEAN NULL DEFAULT FALSE;`
    );

    // Add index for better query performance
    await queryInterface.addIndex('notifications', ['is_admin'], {
      name: 'notifications_is_admin_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the index first
    await queryInterface.removeIndex('notifications', 'notifications_is_admin_idx');

    // Revert the column type
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications MODIFY is_admin TINYINT(1) NULL DEFAULT 0;`
    );
  }
}; 