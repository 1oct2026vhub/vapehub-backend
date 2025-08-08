"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column already exists
    const tableInfo = await queryInterface.describeTable('mail_subscription');
    
    if (tableInfo.subscribed) {
      console.log('subscribed column already exists in mail_subscription, skipping');
      return;
    }
    
    console.log('Adding subscribed column to mail_subscription...');
    await queryInterface.addColumn("mail_subscription", "subscribed", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Flag to indicate if the user is currently subscribed"
    });

    // Add index for subscribed field (with existence check)
    try {
      await queryInterface.addIndex('mail_subscription', ['subscribed']);
      console.log('Added subscribed index to mail_subscription');
    } catch (error) {
      console.log('subscribed index might already exist:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index
    await queryInterface.removeIndex('mail_subscription', ['subscribed']);
    
    // Remove column
    await queryInterface.removeColumn("mail_subscription", "subscribed");
  }
}; 