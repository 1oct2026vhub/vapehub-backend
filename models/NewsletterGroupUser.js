'use strict';

module.exports = (sequelize, DataTypes) => {
  const NewsletterGroupUser = sequelize.define(
    'NewsletterGroupUser',
    {
      group_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'newsletter_groups',
          key: 'id',
        },
      },
      subscriber_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'mail_subscription',
          key: 'id',
        },
      },
    },
    {
      tableName: 'newsletter_group_users',
      timestamps: true,
    }
  );

  NewsletterGroupUser.associate = (models) => {
    NewsletterGroupUser.belongsTo(models.NewsletterGroup, {
      foreignKey: 'group_id',
      as: 'group',
    });
    NewsletterGroupUser.belongsTo(models.MailSubscription, {
      foreignKey: 'subscriber_id',
      as: 'subscriber',
    });
  };

  return NewsletterGroupUser;
};

