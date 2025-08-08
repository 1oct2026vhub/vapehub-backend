'use strict';
const { Brand } = require('../../models');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    const brands = [
      { name: 'AISU BY ZAP!', slug: 'aisu-by-zap', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'AROMA KING', slug: 'aroma-king', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'ASPIRE', slug: 'aspire', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'BAR JUICE', slug: 'bar-juice', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'CRYSTAL PRIME', slug: 'crystal-prime', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'CRYSTAL PRO MAX', slug: 'crystal-pro-max', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'DINNER LADY', slug: 'dinner-lady', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'DOOZY VAPE CO', slug: 'doozy-vape-co', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'DOUBLE DRIP', slug: 'double-drip', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'DR FROST', slug: 'dr-frost', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'ELF BAR', slug: 'elf-bar', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'ELUX', slug: 'elux', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'GEEK BAR', slug: 'geek-bar', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'GEEKVAPE', slug: 'geekvape', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'HAYATI', slug: 'hayati', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'ICEBERG', slug: 'iceberg', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'INNOKIN', slug: 'innokin', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'INSTAFLOW', slug: 'instaflow', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'IVG', slug: 'ivg', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'LOST MARY BY ELF BAR', slug: 'lost-mary-by-elf-bar', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'MOMO', slug: 'momo', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'NASTY JUICE', slug: 'nasty-juice', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'OXVA', slug: 'oxva', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'POD SALT', slug: 'pod-salt', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'PUKKA JUICE', slug: 'pukka-juice', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'PYNE POD', slug: 'pyne-pod', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'RandM', slug: 'randm', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'RIOT SQUAD', slug: 'riot-squad', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' },
      { name: 'SKE Crystal Bar', slug: 'ske-crystal-bar', logo_url: 'https://zapjuice.co.uk/cdn/shop/files/ZAP_Juice_logo_2023.png?v=1697714935&width=150' }
    ];

    await Brand.bulkCreate(brands);
    console.log('Brands seeded successfully');
  },

  async down(queryInterface, Sequelize) {
    return;
    await Brand.destroy({ truncate: true });
    console.log('Brands deleted successfully');
  }
};
