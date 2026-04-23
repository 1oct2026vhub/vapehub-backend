'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      'newsletter_group_users',
      'newsletter_group_users_group_user_unique'
    );

    await queryInterface.addColumn('newsletter_group_users', 'subscriber_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: {
        model: 'mail_subscription',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    const memberships = await queryInterface.sequelize.query(
      'SELECT group_id, user_id FROM newsletter_group_users',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const membership of memberships) {
      const subscription = await queryInterface.sequelize.query(
        'SELECT id FROM mail_subscription WHERE user_id = :userId ORDER BY id ASC LIMIT 1',
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: { userId: membership.user_id },
        }
      );

      if (!subscription.length) {
        throw new Error(
          `Cannot migrate newsletter group membership for user_id=${membership.user_id}: no mail_subscription row found`
        );
      }

      await queryInterface.bulkUpdate(
        'newsletter_group_users',
        { subscriber_id: subscription[0].id },
        { group_id: membership.group_id, user_id: membership.user_id }
      );
    }

    await queryInterface.changeColumn('newsletter_group_users', 'subscriber_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'mail_subscription',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.removeColumn('newsletter_group_users', 'user_id');

    await queryInterface.addConstraint('newsletter_group_users', {
      fields: ['group_id', 'subscriber_id'],
      type: 'unique',
      name: 'newsletter_group_users_group_subscriber_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      'newsletter_group_users',
      'newsletter_group_users_group_subscriber_unique'
    );

    await queryInterface.addColumn('newsletter_group_users', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    const memberships = await queryInterface.sequelize.query(
      'SELECT group_id, subscriber_id FROM newsletter_group_users',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const membership of memberships) {
      const subscription = await queryInterface.sequelize.query(
        'SELECT user_id FROM mail_subscription WHERE id = :subscriberId LIMIT 1',
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: { subscriberId: membership.subscriber_id },
        }
      );

      if (!subscription.length || !subscription[0].user_id) {
        throw new Error(
          `Cannot rollback newsletter group membership for subscriber_id=${membership.subscriber_id}: no linked user_id found`
        );
      }

      await queryInterface.bulkUpdate(
        'newsletter_group_users',
        { user_id: subscription[0].user_id },
        { group_id: membership.group_id, subscriber_id: membership.subscriber_id }
      );
    }

    await queryInterface.changeColumn('newsletter_group_users', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.removeColumn('newsletter_group_users', 'subscriber_id');

    await queryInterface.addConstraint('newsletter_group_users', {
      fields: ['group_id', 'user_id'],
      type: 'unique',
      name: 'newsletter_group_users_group_user_unique',
    });
  },
};
