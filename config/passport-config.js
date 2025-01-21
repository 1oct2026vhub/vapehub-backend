const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require("../models/User");
const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET, // Use the same secret used when signing the JWT
};



module.exports = function (passport) {
  // JWT Strategy Configuration
  passport.use("user-local",
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET,
      },
      async (payload, done) => {
        try {
          const user = await User.findById(payload.userId); // Find the user by ID in the JWT payload
          if (!user) return done(null, false); // User not found
          return done(null, user); // Authentication successful
        } catch (err) {
          return done(err, false); // Error occurred during user lookup
        }
      }
    )
  );

};
