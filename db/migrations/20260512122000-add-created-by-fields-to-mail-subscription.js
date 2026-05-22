'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('mail_subscription');

    if (!tableDescription.created_by_type) {
      await queryInterface.addColumn('mail_subscription', 'created_by_type', {
        type: Sequelize.ENUM('customer', 'admin'),
        allowNull: false,
        defaultValue: 'customer',
        comment: 'Indicates whether the subscription was created by a customer flow or an admin'
      });
    }

    if (!tableDescription.created_by_admin_id) {
      await queryInterface.addColumn('mail_subscription', 'created_by_admin_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable('mail_subscription');

    if (tableDescription.created_by_admin_id) {
      await queryInterface.removeColumn('mail_subscription', 'created_by_admin_id');
    }

    if (tableDescription.created_by_type) {
      await queryInterface.removeColumn('mail_subscription', 'created_by_type');
    }
  }
};
