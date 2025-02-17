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
    },
    orderStatus: {
         //   0 for pending 1 for successful 2 for returned 3 for payment_failed 4 for canceled
         PENDING: 0,
         SUCCESS: 1,
         PAYMENT_FAILED : 2,
         CANCELED : 4
    }
}