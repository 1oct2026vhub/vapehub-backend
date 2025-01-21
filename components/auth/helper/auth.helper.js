const bcrypt = require('bcrypt');

module.exports.verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
}