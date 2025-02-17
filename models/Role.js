"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: "updated_by", as: "updatedBy" });
      this.hasMany(models.User, { foreignKey: "roleId", as: "users" });
    }
  }

  Role.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      permission: {
        type: DataTypes.ENUM("full", "limited", "user"),
        allowNull: false,
        defaultValue: "user",
      },
      is_admin_panel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "Role",
      tableName: "roles",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true, // Enables soft delete
      indexes: [
        { unique: true, fields: ["role"] }, // Unique Index
        { fields: ["permission"] }, // Standard Index
        { fields: ["deleted"] }, // Index for soft deletes
        { fields: ["is_admin_panel"] }, // Index for admin panel filtering
      ],
    }
  );

  return Role;
};
