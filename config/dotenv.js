/**
 * To load .env file depending on the environment
 */
const { isDevelopmentEnv, isTestingEnv, isProductionEnv } = require('../config/common')


const loadEnvFile = async () => {
	const dotenv = require('dotenv')

	let envPath = '.env'

	if (isProductionEnv()) {
		envPath = '.env.production'
		dotenv.config({
			path: envPath,
		})
	} else if (isDevelopmentEnv()) {
		envPath = '.env'
		dotenv.config({
			path: envPath,
		})
	} else if (isTestingEnv()) {
		envPath = '.env.testing'
		dotenv.config({
			path: envPath,
		})
	}
}

module.exports = {
	loadEnvFile
}
