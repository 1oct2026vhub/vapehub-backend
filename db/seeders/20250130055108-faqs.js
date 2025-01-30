'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('FAQs', [
      {
        question: "What are disposable vape kits?",
        answer: "Disposable vape kits (also known as disposable vapes/disposable e-cigarettes/disposable vape pens) are complete vaping devices that are ready to use straight out of the box. They contain everything you need to start vaping, including a built-in battery, coil, and e-liquid chamber. They are pre-filled with e-liquid and are inhale activated, therefore completely hassle-free. The e-liquid can be nicotine free or it can contain nicotine salt. Nicotine strength can differ between different disposable vapes.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Are disposable vapes safe?",
        answer: "Yes, Disposables are a safe and easy way to enjoy vaping without having to worry about batteries, coils, or refilling tanks. At Vapehub, we only stock fully approved disposable devices that have been through rigorous safety testing, so you can be sure you’re getting a high-quality product.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "How long does a disposable vape device last?",
        answer: "Most disposable vapes typically last for around 600 puffs, but this will vary depending on the brand and model of Disposable you choose. Once your Disposable has run out of juice, simply dispose of it and start using a new one!",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Can I recharge my Disposable?",
        answer: "Yes & No. Some disposables are not designed to be recharged. Once your Disposable has run out of juice, simply dispose of it. Some disposables can be recharged.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Are disposable vapes legal?",
        answer: "Yes, Disposables are legal in the UK as long as they contain less than 20mg/ml of nicotine and have a maximum e-liquid capacity of 2ml. Disposable kits that contain more than 20mg/ml of nicotine are classed as tobacco products and are subject to different laws.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "What are the best brands that make disposable vapes?",
        answer: "At Vapehub, we stock all the leading brands such as Hayati, Elf Bar, IVG, etc. Browse our full range of Disposables today to find your perfect match.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Are disposable vape devices suitable for Mouth to Lung vaping?",
        answer: "Yes, Disposables are suitable for Mouth to Lung (MTL) vaping. Mouth to Lung vaping means taking a drag of e-liquid into your mouth and holding it briefly before inhaling, similar to smoking a cigarette. This style of vaping is often preferred by ex-smokers as it gives a familiar and satisfying throat hit.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Are vape disposables flavoursome?",
        answer: "Yes, they certainly are flavoursome! Disposable devices have a habit of being rich in flavour with each draw. Nearly all brands that offer disposable vapes offer a wide range of flavours to suit every taste. From fruity and refreshing to rich and indulgent, there’s a Disposable flavour for everyone.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "I am a newbie to vaping. Are disposables okay for me?",
        answer: "Yes, Disposables are a great way to start vaping! They are simple to use and require no assembly, so you can start vaping straight away. Disposables are also a great option for experienced vapers who are looking for a quick and convenient way to vape on the go.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Can I start using disposables once I quit smoking?",
        answer: "We recommend that you start using Disposables once you have successfully quit smoking. This is because Disposables provide a similar nicotine hit to cigarettes, which can help to ease any cravings you may have.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "Do vape disposable devices contain Nic Salt e-liquid?",
        answer: "Yes, disposable vapes usually contain Nic Salt e-liquid although you can get devices that are completely nicotine free! Nicotine Salt e-liquid is a type of nicotine that is absorbed into the body more quickly, giving you a satisfying nicotine hit.",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        question: "How much nicotine is in a vape disposable?",
        answer: "Disposables typically contain around 20mg/ml of nicotine, which is the equivalent of around 2% strength. This is enough to give you a satisfying nicotine hit, without being too overwhelming. Nicotine strengths can vary between brands and Disposables, so make sure to check the product description before you buy.",
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('FAQs', null, {});
  }
};
