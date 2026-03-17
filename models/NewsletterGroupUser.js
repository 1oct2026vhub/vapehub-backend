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
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'users',
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
    NewsletterGroupUser.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
    });
  };

  return NewsletterGroupUser;
};

