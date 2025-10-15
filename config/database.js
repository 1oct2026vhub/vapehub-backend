require('dotenv').config();

module.exports = {
  "local": {
    "username": process.env.DB_USERNAME,
    "password": process.env.DB_PASSWORD,
    "database": process.env.DB_NAME,
    "host": process.env.DB_HOST,
    "port": process.env.DB_PORT,
    "dialect": "mysql",
    "logging": false,
    "pool": {
          "max": 30,        // Maximum 30 connections
          "min": 5,         // Keep 5 connections ready
          "acquire": 60000, // 60 seconds to get connection
          "idle": 10000,    // Close idle connections after 10s
          "evict": 1000     // Check for idle connections every 1s
        }
  },
  "development": {
    "username": process.env.DB_USERNAME,
    "password": process.env.DB_PASSWORD,
    "database": process.env.DB_NAME,
    "host": process.env.DB_HOST,
    "port": process.env.DB_PORT,
    "dialect": "mysql",
    "logging": false,
    "pool": {
      "max": 30,        // Fewer connections for development
      "min": 5,         // Keep 5 connections ready
      "acquire": 30000, // 30 seconds to get connection
      "idle": 10000,    // Close idle connections after 10s
      "evict": 1000     // Check for idle connections every 1s
    }
  },
  "test": {
    "username": process.env.DB_USERNAME,
    "password": process.env.DB_PASSWORD,
    "database": process.env.DB_NAME,
    "host": process.env.DB_HOST,
    "port": process.env.DB_PORT,
    "dialect": "mysql",
    "logging": false,
    "pool": {
          "max": 30,        // Maximum 30 connections
          "min": 5,         // Keep 5 connections ready
          "acquire": 30000, // 30 seconds to get connection
          "idle": 10000,    // Close idle connections after 10s
          "evict": 1000     // Check for idle connections every 1s
        }
  },
  "production": {
    "username": process.env.DB_USERNAME,
    "password": process.env.DB_PASSWORD,
    "database": process.env.DB_NAME,
    "host": process.env.DB_HOST,
    "port": process.env.DB_PORT,
    "dialect": "mysql",
    "logging": false,
    "pool": {
          "max": 30,        // Maximum 30 connections
          "min": 5,         // Keep 5 connections ready
          "acquire": 60000, // 60 seconds to get connection
          "idle": 10000,    // Close idle connections after 10s
          "evict": 1000     // Check for idle connections every 1s
        }
  }
}