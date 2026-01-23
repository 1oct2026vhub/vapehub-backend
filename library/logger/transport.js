const build = require('pino-abstract-transport')
const fs = require('fs')
const path = require('path')
const { Transform } = require('stream')

// helper function to make file name from date
const fileName = () => {
    const d = new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1+'').padStart(2,'0')+'-'+(d.getDate()+'').padStart(2,'0')+'.log'
}
// helper function to check if a file is actual log file and should be deleted
// Supports multiple patterns:
// - YYYY-MM-DD.log (main logger)
// - shipstation_*_YYYY-MM-DD.log (ShipStation logs)
// - *_YYYY-MM-DD.log (utils logger files like error_YYYY-MM-DD.log, info_YYYY-MM-DD.log)
const shouldDeleteFile = name => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600000;
    
    // Pattern 1: YYYY-MM-DD.log (main logger)
    let res = /^(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(name);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    // Pattern 2: shipstation_*_YYYY-MM-DD.log (ShipStation logs)
    res = /^shipstation_\w+_(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(name);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    // Pattern 3: *_YYYY-MM-DD.log (utils logger files like error_YYYY-MM-DD.log, info_YYYY-MM-DD.log, verification_YYYY-MM-DD.log)
    res = /^\w+_(?<date>\d{4}-\d{2}-\d{2})\.log$/.exec(name);
    if (res) {
        const fileDate = new Date(res.groups.date).getTime();
        return fileDate < sevenDaysAgo;
    }
    
    return false;
};

// Helper function to get number of millis left in this day
const msLeft = () => {
    const d = new Date();
    const ms = d.getTime() - d.getTimezoneOffset()*60000;
    return 24*3600000 - (ms % (24*3600000));
}

// function to delete old log files in the dir
const deleteOld = (dir) => {
    fs.readdir(dir, (err, res) => {
        if(err) {
            console.error(err)
            return;
        }
        for(let i of res) {
            const uri = path.join(dir, i)
            if(shouldDeleteFile(i))
                fs.rm(uri, (err) => {
                    if(err) console.log('unable to delete log file', uri, err)
                    else console.log('deleted old log file', uri)
                })
        }
    })
}

// function to delete old log files from multiple directories
const deleteOldFromAllDirs = () => {
    const logsDir = path.join(__dirname, '../../logs');
    const publicLogsDir = path.join(__dirname, '../../public/logs');
    
    deleteOld(logsDir);
    
    // Check if public/logs directory exists before trying to delete from it
    if (fs.existsSync(publicLogsDir)) {
        deleteOld(publicLogsDir);
    }
}


// Main transports function which will be called by pino logger
module.exports = function (opts) {
    let destination = fs.createWriteStream(path.join(opts.destination, fileName()), {flags: 'a'})
    return build(function (source) {
        const stringifyer = new Transform({
            autoDestroy: true,
            objectMode: true,
            transform (chunk, enc, cb) {
                this.push(`${JSON.stringify(chunk)}\n`)
                cb()
            }
        })
        source.pipe(stringifyer)
        stringifyer.pipe(destination)

        const nextTime = () => {
            setTimeout(() => {
                stringifyer.unpipe();
                const newDest = fs.createWriteStream(path.join(opts.destination, fileName()), {flags: 'a'});
                stringifyer.pipe(newDest);
                destination.end();
                destination.on('close', () => {
                    destination = newDest;
                    nextTime();
                    deleteOldFromAllDirs()
                })
            }, msLeft())
        }

        nextTime();
        deleteOldFromAllDirs()
    }, {
        close (err, cb) {
            destination.end()
            destination.on('close', cb.bind(null, err))
        }
    })
}
