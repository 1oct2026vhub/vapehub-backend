/**
 * To check if we're in development environment
 */
 const isDevelopmentEnv = () => {
	const env = process.env.NODE_ENV
	return !env || env == 'development' || env == 'dev'
}

/**
 * To check if we're in testing environment
 */
 const isTestingEnv = () => {
	const env = process.env.NODE_ENV
	return env == 'testing' || env == 'test'
}

/**
 * To check if we're in production environment
 */
 const isProductionEnv = () => {
	const env = process.env.NODE_ENV
	return env == 'production' || env == 'prod'
}

module.exports = {
	isDevelopmentEnv,
	isTestingEnv,
	isProductionEnv
}