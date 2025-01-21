const pino = require('pino')

if(process.env.CONSOLE_LOG!=='true') {

	const path = require('path')

	const transport = pino.transport({
		target: path.join(__dirname, 'transport.js'),
		options: { destination: path.join(__dirname, '../../logs') }
	})

	module.exports = pino(transport)
} else {
	module.exports = pino()
}
