module.exports = {
    emailTypes: {
        REGISTER: 'REGISTER',
        FORGOT_PASSWORD: 'FORGOT_PASSWORD',
        REFER_A_FRIEND: 'REFER_A_FRIEND',
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
        REFER_A_FRIEND: {
            folderName: 'referFriend',
            subject: 'Invite Your Friends to Join | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
    },
    orderStatus: {
         //   0 for pending 1 for successful 2 for returned 3 for payment_failed 4 for canceled
         PENDING: 0,
         SUCCESS: 1,
         PAYMENT_FAILED : 2,
         CANCELED : 4
    },
    attributes: {
        types: {
            SELECT: 'select',
            RADIO: 'radio',
            TEXT: 'text',
            IMAGE: 'image'
        },
        sortOrders: {
            CUSTOM: 'custom',
            NAME: 'name',
            ID: 'id'
        }
    },
    attributeEnums: {
        types: ['select', 'radio', 'text', 'image'],
        sortOrders: ['custom', 'name', 'id']
    },
    productVariants: {
        stockStatus: {
            IN_STOCK: 'in_stock',
            OUT_OF_STOCK: 'out_of_stock',
            BACKORDER: 'backorder'
        }
    },
    stockMovements: {
        changeTypes: {
            ADDITION: 'addition',
            DEDUCTION: 'deduction',
            ADJUSTMENT: 'adjustment',
            RESERVATION: 'reservation'
        }
    },
    productVariantEnums: {
        stockStatus: ['in_stock', 'out_of_stock', 'backorder']
    },
    stockMovementEnums: {
        changeTypes: ['addition', 'deduction', 'adjustment', 'reservation']
    },
    // Transaction related constants
    paymentMethods: {
        CREDIT_CARD: 'CREDIT_CARD',
        PAYPAL: 'PAYPAL',
        BANK_TRANSFER: 'BANK_TRANSFER',
        CRYPTO: 'CRYPTO',
        OTHER: 'OTHER'
    },
    transactionTypes: {
        PURCHASE: 'PURCHASE',
        REFUND: 'REFUND',
        SUBSCRIPTION: 'SUBSCRIPTION',
        DEPOSIT: 'DEPOSIT',
        WITHDRAWAL: 'WITHDRAWAL'
    },
    transactionStatus: {
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        REFUNDED: 'REFUNDED',
        CANCELLED: 'CANCELLED'
    },
    paymentMethodEnums: ['CREDIT_CARD', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO', 'OTHER'],
    transactionTypeEnums: ['PURCHASE', 'REFUND', 'SUBSCRIPTION', 'DEPOSIT', 'WITHDRAWAL'],
    transactionStatusEnums: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED']
}