const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

/**
 * Disk-backed multer storage under the OS temp directory (avoids holding uploads in RAM).
 */
function createTempDiskStorage(subdir = 'uploads') {
    const dest = path.join(os.tmpdir(), 'vapehub', subdir);
    fs.mkdirSync(dest, { recursive: true });

    return multer.diskStorage({
        destination: dest,
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname) || '';
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
        },
    });
}

async function readUploadFile(file) {
    if (!file) {
        throw new Error('Upload file is missing');
    }
    if (file.buffer && file.buffer.length > 0) {
        return file.buffer;
    }
    if (file.path) {
        return fsPromises.readFile(file.path);
    }
    throw new Error('Upload file has no buffer or path');
}

function collectMulterFiles(files) {
    if (!files) {
        return [];
    }
    if (Array.isArray(files)) {
        return files;
    }
    const items = [];
    for (const value of Object.values(files)) {
        if (Array.isArray(value)) {
            items.push(...value);
        } else if (value) {
            items.push(value);
        }
    }
    return items;
}

async function cleanupMulterFiles(files) {
    const items = collectMulterFiles(files);
    await Promise.all(
        items
            .filter((file) => file?.path)
            .map((file) => fsPromises.unlink(file.path).catch(() => {}))
    );
}

module.exports = {
    createTempDiskStorage,
    readUploadFile,
    cleanupMulterFiles,
};
