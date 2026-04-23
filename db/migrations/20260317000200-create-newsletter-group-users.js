'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('newsletter_group_users', {
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'newsletter_groups',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      subscriber_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'mail_subscription',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addConstraint('newsletter_group_users', {
      fields: ['group_id', 'user_id'],
      type: 'unique',
      name: 'newsletter_group_users_group_user_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('newsletter_group_users');
  },
};

