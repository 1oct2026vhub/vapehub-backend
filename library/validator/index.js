const email = email => email?.length && /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/.test(email);
const passwordWithErrors = (pass) => {
    if(!pass || typeof pass !== 'string') throw new Error("Valid password is required")
    if(pass.length<8) throw new Error("Should have atleast 8 characters")
    if(!/[a-z]+/.test(pass)) throw new Error("Atleast one lowercase alphabet is required")
    if(!/[A-Z]+/.test(pass)) throw new Error("Atleast one uppercase alphabet is required")
    if (!/\d+/.test(pass)) throw new Error("Atleast one number is required");
    if(!/[^\w]/.test(pass)) throw new Error("Atleast one symbol is required")
}
const password = pass => {
    return pass && pass.length > 7 
    && /[a-z]+/.test(pass)       // Atleast one lowercase letter
    && /[A-Z]+/.test(pass)       // Atleast one uppercase letter
    && /\d+/.test(pass)          // Atleast one digit
    && /[^\w]+/.test(pass);      // Atleast one special character
}

const name = n => {
  if (!n || n.length === 0) return false;
  
  const regex = /^[a-zA-Z\xC0-\uFFFF]+([ \-'"]?[a-zA-Z\xC0-\uFFFF]+){0,2}[.]?\s*$/;
  return regex.test(n);
};

const validatePhoneNumber = (phoneNumber) => {
  return true;
};


module.exports = { email, password, passwordWithErrors, name, validatePhoneNumber }
