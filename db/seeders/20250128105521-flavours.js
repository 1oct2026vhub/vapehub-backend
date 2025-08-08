'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return;
    const flavors = [
      { name: 'Atomic Fireballs', description: 'A fiery, cinnamon-flavoured delight that packs a punch with every bite, leaving a warm and spicy sensation.' },
      { name: 'Banana Ice', description: 'Smooth banana flavour with an icy finish, offering a refreshing twist to the classic banana taste.' },
      { name: 'Blackcurrant Mango', description: 'A sweet and tangy fusion of blackcurrant and mango, creating a unique and vibrant flavour profile.' },
      { name: 'Blue Fusion', description: 'A vibrant blend of assorted blue fruits that delivers a burst of fruity goodness with each taste.' },
      { name: 'Blue Razz Cherry', description: 'Tangy blue raspberry complemented by sweet cherry, creating a perfect balance of tart and sweet.' },
      { name: 'Blue Razz Gummy Bear', description: 'The nostalgic taste of gummy bears mixed with blue raspberry, bringing back childhood memories with a fruity twist.' },
      { name: 'Blue Razz Lemonade', description: 'Refreshing blue raspberry lemonade with a summery vibe, perfect for hot days and cooling off.' },
      { name: 'Blue Sour Raspberry', description: 'A tart and tangy blue raspberry treat that will tantalize your taste buds with its sharp flavour.' },
      { name: 'Blueberry Banana', description: 'A smooth blend of ripe blueberries and creamy banana, offering a rich and satisfying flavour combination.' },
      { name: 'Blueberry Bubblegum', description: 'Classic bubblegum flavour with a blueberry twist, blending the familiar with a fruity surprise.' },
      { name: 'Blueberry Cherry Cranberry', description: 'A medley of blueberries, cherries, and cranberries, providing a complex and layered berry experience.' },
      { name: 'Blueberry and Mint', description: 'Fresh blueberries with a hint of mint, creating a refreshing and invigorating taste sensation.' },
      { name: 'Blueberry Kiwi', description: 'A perfect blend of sweet blueberries and tart kiwi, delivering a balanced and delightful flavour.' },
      { name: 'Blueberry Raspberry', description: 'Juicy blueberries paired with ripe raspberries, offering a double berry treat that is both sweet and tangy.' },
      { name: 'Bru Ice', description: 'A refreshing icy burst with a hint of berries, perfect for those who enjoy a cool and fruity experience.' },
      { name: 'Bubblegum Ice', description: 'Classic bubblegum flavour with a cool, icy touch, adding a refreshing twist to the traditional taste.' },
      { name: 'Bull Ice', description: 'A strong, invigorating flavour with an icy finish, designed to awaken your senses and provide a boost.' },
      { name: 'Cherry Cola', description: 'Beloved cherry-infused cola taste, combining the classic soda flavour with a fruity twist.' },
      { name: 'Cola Ice', description: 'Classic cola flavour with a refreshing icy twist, perfect for cooling down and enjoying a familiar taste.' },
      { name: 'Cola Lime', description: 'Zesty lime combined with classic cola taste, offering a citrusy twist to the traditional cola flavour.' },
      { name: 'Cream Tobacco', description: 'Rich, creamy tobacco flavour that provides a smooth and satisfying experience for those who enjoy a robust taste.' },
      { name: 'Fizzy Cherry', description: 'An effervescent cherry experience that tingles the taste buds with its sparkling and fruity flavour.' },
      { name: 'Fresh Menthol Mojito', description: 'Cool, minty mojito flavour that refreshes and invigorates, perfect for a taste of the tropics.' },
      { name: 'Fresh Mint', description: 'Pure and refreshing mint, offering a clean and crisp flavour that revitalizes the senses.' },
      { name: 'Gummy Bear', description: 'The nostalgic taste of classic gummy bears, bringing a sweet and chewy delight that takes you back to your childhood.' },
      { name: 'Hubba Bubba', description: 'The iconic bubblegum flavour that everyone knows and loves, offering a classic and timeless taste.' },
      { name: 'Juicy Peach', description: 'Sweet and juicy ripe peach flavour, capturing the essence of fresh peaches in every bite.' },
      { name: 'Lemon and Mint', description: 'A refreshing blend of tangy lemon and cool mint, delivering a balanced and invigorating flavour combination.' },
      { name: 'Lemon Lime', description: 'A zesty combination of lemon and lime, providing a citrusy burst that is both tart and refreshing.' },
      { name: 'Mad Blue', description: 'A wild mix of assorted blue fruits, offering a complex and vibrant flavour experience that is sure to delight.' },
      { name: 'Mango Peach Pineapple', description: 'A tropical blend of mango, peach, and pineapple, transporting you to a sunny beach with every taste.' },
      { name: 'Mr Blue', description: 'A mysterious and complex blue fruit blend, offering a unique and intriguing flavour profile that keeps you guessing.' },
      { name: 'Mr Pink', description: 'A vibrant, fruity mix with a hint of mystery, providing a playful and delightful taste experience.' },
      { name: 'Pineapple Ice', description: 'Sweet pineapple flavour with an icy finish, perfect for cooling down and enjoying a tropical treat.' },
      { name: 'Prime Strawberry Watermelon', description: 'Delightful blend of strawberry and watermelon, offering a refreshing and juicy flavour combination.' },
      { name: 'Red Apple Ice', description: 'Crisp red apple flavour with a refreshing icy touch, providing a cool and satisfying apple experience.' },
      { name: 'Riberry Lemonade', description: 'Unique blend of riberry and lemonade, offering a tangy and refreshing twist on classic lemonade.' },
      { name: 'Rocky Candy Orange', description: 'Nostalgic taste of orange rock candy, bringing back memories of childhood treats with a citrusy twist.' },
      { name: 'Sakura Grape', description: 'Delicate sakura paired with sweet grape, offering a unique and floral fruit flavour that is both elegant and delightful.' },
      { name: 'Strawberry Banana', description: 'Classic blend of sweet strawberries and creamy banana, providing a perfectly balanced and delicious flavour combination.' },
      { name: 'Strawberry Hubba Bubba', description: 'Iconic bubblegum flavour with a strawberry twist, offering a playful and fruity take on a classic.' },
      { name: 'Strawberry Jelly Beans', description: 'Sweet and fruity strawberry jelly beans flavour, capturing the essence of a favorite candy treat.' },
      { name: 'Strawberry Mojito', description: 'Refreshing strawberry mojito taste, blending the sweetness of strawberries with the cool minty flavour of a mojito.' },
      { name: 'Strawberry Raspberry Blueberry', description: 'Medley of strawberries, raspberries, and blueberries, offering a multi-berry delight that is both sweet and tangy.' },
      { name: 'Strawberry Raspberry Ice', description: 'Sweet strawberries and raspberries with a cool, icy finish, providing a refreshing and fruity flavour experience.' },
      { name: 'Triple Mango', description: 'Rich and juicy triple mango experience, offering an intense and delightful mango flavour.' },
      { name: 'Vimbull Ice', description: 'Invigorating flavour with an icy touch, providing a refreshing and energizing taste experience.' },
      { name: 'Watermelon Ice', description: 'Sweet and refreshing watermelon flavour with an icy finish, perfect for cooling down on a hot day.' },
      { name: 'Watermelon Lemon Burst', description: 'Tangy and refreshing mix of watermelon and lemon, offering a vibrant and citrusy flavour combination.' },
      { name: 'Watermelon Raspberry', description: 'Sweet and juicy blend of watermelon and raspberry, providing a delicious and refreshing fruit flavour.' }
    ];

    return queryInterface.bulkInsert('Flavors', flavors, {});
  },

  down: async (queryInterface, Sequelize) => {
    return;
    return queryInterface.bulkDelete('Flavors', null, {});
  }
};