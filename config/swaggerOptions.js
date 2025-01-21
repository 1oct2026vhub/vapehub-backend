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
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://vapehub.com',
        description: 'Production server',
      }]
  },
  apis: glob.sync(path.join(__dirname, '/../components/**/routes/*.route.js')),
};


const swaggerDocs = swaggerJsDoc(swaggerOptions);

module.exports = swaggerDocs;
