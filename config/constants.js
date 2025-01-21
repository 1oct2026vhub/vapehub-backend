module.exports = {
    emailTypes: {
        REGISTER: 'REGISTER',
        FORGOT_PASSWORD: 'FORGOT_PASSWORD',
    },
    emailTypeData: {
        REGISTER: {
            folderName: 'register',
            subject: 'Please validate your email | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        FORGOT_PASSWORD: {
            folderName: 'forgotPassword',
            subject: 'Password Reset | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
    }
}