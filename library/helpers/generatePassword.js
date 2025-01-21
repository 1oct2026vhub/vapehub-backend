    async function generatePassword() {
        const minLength = 8;
        const numbers = '0123456789';
        const upperCaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowerCaseLetters = 'abcdefghijklmnopqrstuvwxyz';
        const specialChars = '!@#$%^&*(),.?":{}|<>';
      
        // Ensure each required character type is present
        let password = '';
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += upperCaseLetters[Math.floor(Math.random() * upperCaseLetters.length)];
        password += lowerCaseLetters[Math.floor(Math.random() * lowerCaseLetters.length)];
        password += specialChars[Math.floor(Math.random() * specialChars.length)];
      
        // Add random characters until password reaches the minimum length
        const allChars = numbers + upperCaseLetters + lowerCaseLetters + specialChars;
        while (password.length < minLength) {
          password += allChars[Math.floor(Math.random() * allChars.length)];
        }
      
        // Shuffle the password to randomize character positions
        password = password.split('').sort(() => 0.5 - Math.random()).join('');
      
        return password;
      }   

module.exports = {
    generatePassword
};