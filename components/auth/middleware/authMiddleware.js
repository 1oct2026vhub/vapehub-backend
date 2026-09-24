const passport = require('passport');
const { errorResponse } = require('../../../utils/responseUtils');

const authenticateJWT = (req, res, next) => {
    passport.authenticate('user-local', { session: false }, (err, user, info) => {
        if (err || !user) {
            return errorResponse(res, { message: 'Unauthorized: Invalid or missing token' }, 'Unauthorized', 401);
        }
        req.user = user; // Attach the authenticated user to the request object
        next();
    })(req, res, next);
};

const optionalAuthenticateJWT = (req, res, next) => {
    passport.authenticate('user-local', { session: false }, (err, user) => {
        if (!err && user) {
            req.user = user;
        }
        next();
    })(req, res, next);
};

module.exports = authenticateJWT;
module.exports.optionalAuthenticateJWT = optionalAuthenticateJWT;