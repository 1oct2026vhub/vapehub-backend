const {
  uploadFiletToS3,
  getUniqueFileNameWithPrefix,
  extractS3KeyFromUrl,
  deleteFile
} = require('../../../../library/s3/s3Helper');

const parseOptionalBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return defaultValue;
};

const parseOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeOptionalUrl = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || String(value).trim() === '') {
    return null;
  }
  return String(value).trim();
};

const uploadBadgeIcon = async (file) => {
  const fileName = await getUniqueFileNameWithPrefix(file.originalname, 'footer-badges');
  const uploadedImage = await uploadFiletToS3({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `footer-badges/${fileName}`,
    Body: file.buffer,
    ContentType: file.mimetype
  });
  if (!uploadedImage?.Location) {
    throw new Error('File upload failed');
  }
  return uploadedImage.Location;
};

const deleteBadgeIcon = async (iconUrl) => {
  if (!iconUrl) {
    return;
  }
  const key = extractS3KeyFromUrl(iconUrl);
  if (!key) {
    return;
  }
  await deleteFile(key).catch(() => {});
};

module.exports = {
  parseOptionalBoolean,
  parseOptionalInt,
  normalizeOptionalUrl,
  uploadBadgeIcon,
  deleteBadgeIcon
};
