const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Connect = sequelize.define('Connect', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    send_us_a_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    call_us: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    social_media: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'Connects',
    underscored: true,
    paranoid: true
  });
  return Connect;
}; 