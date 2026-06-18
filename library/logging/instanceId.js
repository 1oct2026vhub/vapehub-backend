const os = require('os');

let cachedInstanceId = null;

function getInstanceId() {
    if (cachedInstanceId) return cachedInstanceId;

    cachedInstanceId =
        process.env.LOG_INSTANCE_ID ||
        process.env.EC2_INSTANCE_ID ||
        os.hostname();

    return cachedInstanceId;
}

module.exports = { getInstanceId };
