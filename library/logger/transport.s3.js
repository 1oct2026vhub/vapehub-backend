const build = require('pino-abstract-transport');
const { Transform } = require('stream');
const s3LogWriter = require('../logging/s3LogWriter');
const { getInstanceId } = require('../logging/instanceId');

const fileName = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}.log`;
};

module.exports = function () {
    let currentFile = fileName();
    const instanceId = getInstanceId();

    return build(function (source) {
        const writer = new Transform({
            autoDestroy: true,
            objectMode: true,
            transform(chunk, enc, cb) {
                if (fileName() !== currentFile) {
                    currentFile = fileName();
                }

                const enriched = {
                    ...chunk,
                    instanceId,
                };

                s3LogWriter.appendLog(currentFile, `${JSON.stringify(enriched)}\n`);
                cb();
            },
        });

        source.pipe(writer);
    });
};
