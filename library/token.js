const jwt = require('jsonwebtoken')

// adapter for using token signer as promise
const makeToken = (data, options) => new Promise((resolve, reject) => {
  jwt.sign(
    data,
    process.env.JWT_SECRET_KEY,
    options,
    // { expiresIn: parseInt(process.env.TOKEN_VALIDITY_SECONDS || '1800') },
    (error, token) => {
      if(error) reject(error)
      else resolve(token)
    }
  )
})

// adapter for using token parser as promise
const parseToken = (token) => new Promise((resolve, reject) => {
  jwt.verify(token, process.env.JWT_SECRET_KEY, (error, data) => {
    if(error) reject(error)
    else resolve(data)
  })
})

module.exports = {
  parseToken, makeToken
}
