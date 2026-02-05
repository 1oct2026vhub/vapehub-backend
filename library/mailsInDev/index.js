const path = require('path')
const uuid = require('uuid')
const fs = require('fs/promises')
const previewEmail = require('preview-email')

const hbs = require('handlebars')

const emailsDir = path.join(__dirname, '../../emails')
const indexFilePath = path.join(emailsDir, 'index')
const utilsLogger = require('../../utils/logger');

// Serialize index updates to avoid race conditions when multiple emails
// are rendered/saved concurrently (e.g. promotional sends in parallel).
let indexUpdateQueue = Promise.resolve();
const enqueueIndexUpdate = (work) => {
    const run = indexUpdateQueue.then(work, work);
    // Keep the queue alive even if a task fails.
    indexUpdateQueue = run.catch(() => {});
    return run;
};

/**
 * Function to render a new email, save it as file and add it to index file
 */
exports.newEmail = async(email) => {
    const fileId = uuid.v4();

    // Ensure emails directory exists
    try {
        await fs.access(emailsDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(emailsDir, { recursive: true });
        } else {
            throw error;
        }
    }

    await previewEmail(email, {
        hasDownloadOriginalButton: false,
        openSimulator: false,
        open: false,
        template: path.join(__dirname, 'emailTemplate.pug'),
        dir: emailsDir,
        id: fileId,
    })

    // Index updates must be atomic/serialized to prevent lost writes.
    return enqueueIndexUpdate(async () => {
        let oldIndexText;
        try {
            oldIndexText = await fs.readFile(indexFilePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.writeFile(indexFilePath, `${fileId} ${Date.now()} ${encodeURI(email.subject)} ${encodeURI(email.to)} n\n`);
                return;
            }
            throw error;
        }

        const oldIndex = oldIndexText.split('\n').filter(i => i);
        if (oldIndex.length >= 50) {
            const toDel = oldIndex.splice(49);
            try {
                for (let i of toDel) {
                    await fs.rm(path.join(emailsDir, i.substring(0, i.indexOf(' ')) + '.html'));
                }
            } catch (error) {
                utilsLogger.logError(`Error in newEmail: ${error}`);
            }
        }

        const updatedIndexContent = `${fileId} ${Date.now()} ${encodeURI(email.subject)} ${encodeURI(email.to)} n\n${oldIndex.reduce((a, i) => a + i + '\n', '')}`;
        await fs.writeFile(indexFilePath, updatedIndexContent);
    });
}

/**
 * Helper function to format time for displaying
 */
const showTime = (time) => {
    const now = Date.now();
    const diff = now - time;
    if(diff<60000)
        return 'Just Now'
    if(diff<3600000)
        return Math.round(diff/60000)+' min ago'
    if(diff<24*3600000)
        return Math.round(diff/3600000)+' hr ago'
    return Math.round(diff/24/3600000)+' d ago'
}

/**
 * Function to parse list of emails from index file
 */
const listEmails = async() => {
    try {
        const list = await fs.readFile(indexFilePath, 'utf8');
        return list
            .split('\n')
            .filter(line => line)
            .map(line => {
                const ar = line.split(' ');
                return {id: ar[0], time: showTime(parseInt(ar[1])), subject: decodeURI(ar[2]), to: decodeURI(ar[3]), open: ar[4]==='o'};
            });
    } catch (error) {
        if(error.code==='ENOENT') return []
        throw error;
    }
}

/**
 * Function to get path of rendered email file from id
 */
const readEmail = async(id) => {
    const indexText = await fs.readFile(indexFilePath, 'utf8')
    const lineIndex = indexText.indexOf(id+'');
    if(lineIndex<0)
        throw new Error("Not Found");
    const lineEndIndex = indexText.indexOf('\n', lineIndex+2)
    if(indexText[lineEndIndex-1]!=='o') {
        await fs.writeFile(indexFilePath, indexText.substring(0, lineEndIndex-1)+'o'+indexText.substring(lineEndIndex))
    }
    const fh = await fs.open(path.join(emailsDir, id+'.html'));;
    const rs = fh.createReadStream();
    return rs;
}

const router = require('express').Router();

/**
 * Route to get html view of email listing page
 */
router.get('/list', async(req, res) => {
    const emails = await listEmails()
    const hbsContent = await fs.readFile(path.join(__dirname, 'emailList.hbs'), 'utf8')
    const template = hbs.compile(hbsContent)
    res.set({
        'Content-Type': 'text/html',
        'Content-Security-Policy': "default-src 'self' data: https://jvolve.s3.ap-south-1.amazonaws.com;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src *;object-src 'none';script-src 'self' 'unsafe-inline';script-src-attr 'unsafe-inline';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"
    }).send(template({emails: emails}))
})

/**
 * Route to get email html from id
 */
router.get('/open/:id', async(req, res) => {
    const ret = await readEmail(req.params.id);
    if(ret) {
        res.set({
            'Content-Type': 'text/html',
            'Content-Security-Policy': "default-src 'self' data: https://jvolve.s3.ap-south-1.amazonaws.com;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src *;object-src 'none';script-src 'self' 'unsafe-inline';script-src-attr 'unsafe-inline';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests"
        });
        ret.pipe(res);
    } else
        res.helper.status(200).send();
})

exports.emailRouter = router;
