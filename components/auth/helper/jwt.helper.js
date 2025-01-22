const jwt = require('jsonwebtoken');

module.exports.generateAuthJwtToken = (payload) => {
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION });
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRATION });
    return { accessToken, refreshToken };
}

module.exports.verifyAuthJwtToken = (token, secret) => {
    try {
        const decodedData = jwt.verify(token, secret);
        return decodedData;
    } catch (err) {
        // Handle errors based on error name
        if (err.name === "TokenExpiredError") {
            throw {
                message: "Refresh token has expired",
                statusCode: 401,
                errors: {
                    refreshToken: "Refresh token has expired",
                }
            };
        } else {
            throw {
                message: "Invalid refresh token",
                statusCode: 400,
                errors: {
                    refreshToken: "Invalid refresh token",
                }
            };
        }
    }
}
