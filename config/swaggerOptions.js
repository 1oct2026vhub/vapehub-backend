// swaggerOptions.js
const swaggerJsDoc = require('swagger-jsdoc');
const path = require('path');
const glob = require('glob');


const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VapeHub API',
      version: '1.0.0',
      description: 'This is the API documentation for VapeHub Project',
      contact: {
        name: 'Mohamed Haseeb',
        email: 'mohamedhaseeb@ateamsoftsolutions.com',
      },
    },
    servers: [
      {
        url: process.env.HOST_URL,
        description: 'Development Server',
      },
      {
        url: 'http://localhost:5000',
        description: 'Local server',
      }]
  },
  apis: glob.sync(path.join(__dirname, '/../components/**/routes/*.route.js')),
};


const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = swaggerDocs;
