'use strict';
const { Category } = require('../../models');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const categories = [
        {
          id: 1,
          name: 'Disposables',
          slug: 'disposables',
          logo_url: 'https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.primevapes.co.uk%2Fproducts%2Fspearmint-disposable-vape-by-pixl-6000&psig=AOvVaw3GkxnxS7JaPV76Izldn2Iw&ust=1738063689890000&source=images&cd=vfe&opi=89978449&ved=0CBQQjRxqFwoTCPDH8frllYsDFQAAAAAdAAAAABAE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Pod Kit',
          slug: 'pod-kit',
          logo_url: 'https://www.queencityvapes.ca/cdn/shop/files/geek-bar-pulse-x-rechargeable-disposable-vape-disposables-canada-459006.jpg?v=1722289959',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          name: 'Vape Kit', 
          slug: 'vape-kit',
          logo_url: 'https://eyzssdmhyfg.exactdn.com/wp-content/uploads/2024/06/geek-bar-pulse-x-grapefruit-refresher-canada.jpg?strip=all&lossy=1&ssl=1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 4,
          name: 'Nic Salts', 
          slug: 'nic-salts',
          logo_url: 'https://eyzssdmhyfg.exactdn.com/wp-content/uploads/2024/06/geek-bar-pulse-x-grapefruit-refresher-canada.jpg?strip=all&lossy=1&ssl=1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 5,
          name: 'E-Liquid', 
          slug: 'e-liquid',
          logo_url: 'https://eyzssdmhyfg.exactdn.com/wp-content/uploads/2024/06/geek-bar-pulse-x-grapefruit-refresher-canada.jpg?strip=all&lossy=1&ssl=1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 6,
          name: 'Shortfills', 
          slug: 'shortfills',
          logo_url: 'https://eyzssdmhyfg.exactdn.com/wp-content/uploads/2024/06/geek-bar-pulse-x-grapefruit-refresher-canada.jpg?strip=all&lossy=1&ssl=1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      await Category.bulkCreate(categories);
    } catch (err) {
      console.log(err)
    }

  },

  async down(queryInterface, Sequelize) {
    await Category.destroy({ truncate: true });
  }
};
