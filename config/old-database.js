module.exports = {
  development: {
    username: process.env.OLD_DB_USERNAME || 'root',
    password: process.env.OLD_DB_PASSWORD || '',
    database: process.env.OLD_DB_NAME || 'vapehub_live',
    host: process.env.OLD_DB_HOST || 'localhost',
    port: process.env.OLD_DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4'
    },
    logging: false
  },
  local: {
    username: process.env.OLD_DB_USERNAME || 'root',
    password: process.env.OLD_DB_PASSWORD || '',
    database: process.env.OLD_DB_NAME || 'vapehub_live',
    host: process.env.OLD_DB_HOST || 'localhost',
    port: process.env.OLD_DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4'
    },
    logging: false
  },
  production: {
    username: process.env.OLD_DB_USERNAME,
    password: process.env.OLD_DB_PASSWORD,
    database: process.env.OLD_DB_NAME,
    host: process.env.OLD_DB_HOST,
    port: process.env.OLD_DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4'
    },
    logging: false
  }
};
