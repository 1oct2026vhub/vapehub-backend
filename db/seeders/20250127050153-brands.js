'use strict';
const { Brand } = require('../../models');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const brands = [
      { name: 'Brand 1', logo_url: 'https://www.photo.gallery/content/blog/image-size-quality-photo-gallery-websites/low-detail-2560px-70q.jpg'},
      { name: 'Brand 2', logo_url: 'https://etc.usf.edu/techease/wp-content/uploads/2017/12/daylily-flower-and-buds-sharp.jpg'},
      { name: 'Brand 3', logo_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQl3TuAf5py3K1BkwJrUQSpYG60Ds2a5gMRKg&s'},
    ];

    await Brand.bulkCreate(brands);
    console.log('Brands seeded successfully');
  },

  async down(queryInterface, Sequelize) {
    await Brand.destroy({ truncate: true });
    console.log('Brands deleted successfully');
  }
};
