module.exports = {
    emailTypes: {
        REGISTER: 'REGISTER',
        FORGOT_PASSWORD: 'FORGOT_PASSWORD',
        REFER_A_FRIEND: 'REFER_A_FRIEND',
        REFERRER_REWARD: 'REFERRER_REWARD',
        ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
        ORDER_CANCELLATION: 'ORDER_CANCELLATION',
        ACCOUNT_DELETION: 'ACCOUNT_DELETION',
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
            folderName: 'refer_a_friend',
            subject: 'Invite Your Friends to Join | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        REFERRER_REWARD: {
            folderName: 'referrer_reward',
            subject: 'Your Referral Reward is Ready! | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        ORDER_CONFIRMATION:{
            folderName: 'order_confirmation',
            subject: "Order Confirmation",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ORDER_CANCELLATION: {
            folderName: 'order_cancellation',
            subject: "Order Cancellation",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ACCOUNT_DELETION: {
            from: process.env.EMAIL_FROM,
            subject: 'Account Deletion Confirmation',
            folderName: 'account_deletion'
        },
    },
    orderStatus: {
        //   0 for pending 1 for successful 2 for returned 3 for payment_failed 4 for canceled
        DRAFT: 'draft',                // Initial cart state
        PENDING: 'pending',            // Order placed but payment not confirmed
        PROCESSING: 'processing',       // Payment confirmed, preparing for shipment
        PACKED: 'packed',              // Order has been packed and ready for shipping
        SHIPPED: 'shipped',            // Order has been shipped
        OUT_FOR_DELIVERY: 'out_for_delivery', // Order is out for delivery
        DELIVERED: 'delivered',        // Order has been delivered
        COMPLETED: 'completed',        // Order successfully fulfilled
        FAIL: 'fail',                 // Order/payment failed
        CANCEL: 'cancel',             // Order cancelled
        RETURN_REQUESTED: 'return_requested', // Customer requested a return
        RETURN_APPROVED: 'return_approved',   // Return request approved
        RETURN_RECEIVED: 'return_received',   // Returned items received
        REFUNDED: 'refunded'          // Money refunded to customer
    },
    orderStatusEnums: [
        'draft',
        'pending',
        'processing',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'completed',
        'fail',
        'cancel',
        'return_requested',
        'return_approved',
        'return_received',
        'refunded'
    ],
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
        worldPay: 'worldPay',
        vivaWallet: 'vivaWallet'
    },
    transactionTypes: {
        PURCHASE: 'PURCHASE',
        REFUND: 'REFUND'
    },
    transactionStatus: {
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        REFUNDED: 'REFUNDED',
        CANCELLED: 'CANCELLED'
    },
    paymentMethodEnums: ['worldPay', 'vivaWallet'],
    transactionTypeEnums: ['PURCHASE', 'REFUND'],
    transactionStatusEnums: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'],
    
    productStatus: {
        DRAFT: 'draft',
        PUBLISHED: 'published',
        ARCHIVED: 'archived'
    },
    productStatusEnums: [
        'draft',
        'published',
        'archived'
    ]
}