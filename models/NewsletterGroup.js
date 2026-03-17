'use strict';

module.exports = (sequelize, DataTypes) => {
  const NewsletterGroup = sequelize.define(
    'NewsletterGroup',
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: 'newsletter_groups',
      timestamps: true,
      paranoid: true,
    }
  );

  NewsletterGroup.associate = (models) => {
    NewsletterGroup.belongsToMany(models.User, {
      through: models.NewsletterGroupUser,
      foreignKey: 'group_id',
      otherKey: 'user_id',
      as: 'users',
    });
  };

  return NewsletterGroup;
};

