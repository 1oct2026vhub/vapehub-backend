const fs = require('fs/promises')
const path = require('path')
const logger = require('./library/logger')

const namer = (d) => {
    return (d.getFullYear()+'').padStart(5,'0')+'-'+(d.getMonth()+'').padStart(3,'0')+'-'+(d.getDate()+'').padStart(3,'0')
}

const main = async() => {
    const files = await fs.readDir(path.join(__dirname, 'logs'))
    const now = Date.now();
    for(let file of files) {
        const res = /^(?<yyyy>\d{4})-(?<MM>\d{2})-(?<dd>\d{2}))\.log$/.exec(file);
        if(!res) continue;
        const date = new Date(`${res.groups.yyyy}-${res.groups.MM}-${res.groups.dd}`);
        if(date.getTime()<now-24*3*3600000)
            await fs.rm(path.join(__dirname, 'logs', file));
    }
}

main().then(() => logger.info('Log rotation done')).catch(e => {
    logger.error(e, "Log rotation crashed");
})
