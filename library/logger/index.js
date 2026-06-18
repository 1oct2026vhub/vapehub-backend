const pino = require('pino');
const path = require('path');

const useConsole = process.env.CONSOLE_LOG === 'true';
const useS3 = process.env.S3_LOG_ENABLED !== 'false' && Boolean(process.env.AWS_S3_BUCKET);
const useLocalFile = process.env.LOCAL_LOG_FILE === 'true';

let logger;

if (useConsole) {
    logger = pino();
} else if (useS3) {
    logger = pino(pino.transport({
        target: path.join(__dirname, 'transport.s3.js'),
    }));
} else if (useLocalFile) {
    logger = pino(pino.transport({
        target: path.join(__dirname, 'transport.js'),
        options: { destination: path.join(__dirname, '../../logs') },
    }));
} else {
    logger = pino();
}

module.exports = logger;
