module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("coupons", "is_single_use", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("coupons", "is_single_use");
  }
};