'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Using raw query to ensure MySQL properly sets the default value
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications MODIFY user_id INT NULL DEFAULT NULL;`
    );

    // Re-add the foreign key constraint
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications 
       ADD CONSTRAINT notifications_user_id_fkey 
       FOREIGN KEY (user_id) 
       REFERENCES users(id) 
       ON DELETE CASCADE 
       ON UPDATE CASCADE;`
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the foreign key constraint first
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications 
       DROP FOREIGN KEY notifications_user_id_fkey;`
    );

    // Revert the column modification
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications MODIFY user_id INT NULL;`
    );

    // Re-add the foreign key constraint without default value
    await queryInterface.sequelize.query(
      `ALTER TABLE notifications 
       ADD CONSTRAINT notifications_user_id_fkey 
       FOREIGN KEY (user_id) 
       REFERENCES users(id) 
       ON DELETE CASCADE 
       ON UPDATE CASCADE;`
    );
  }
}; 