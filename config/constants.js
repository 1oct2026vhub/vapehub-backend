module.exports = {
    emailTypes: {
        REGISTER: 'REGISTER',
        FORGOT_PASSWORD: 'FORGOT_PASSWORD',
        REFER_A_FRIEND: 'REFER_A_FRIEND',
        REFERRER_REWARD: 'REFERRER_REWARD',
        ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
        ORDER_SHIPPED: 'ORDER_SHIPPED',
        ORDER_PACKED: 'ORDER_PACKED',
        ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
        ORDER_DELIVERED: 'ORDER_DELIVERED',
        ORDER_FAILED: 'ORDER_FAILED',
        ORDER_CANCELLATION: 'ORDER_CANCELLATION',
        ACCOUNT_DELETION: 'ACCOUNT_DELETION',
        REFUND_CONFIRMATION: 'REFUND_CONFIRMATION',
        WELCOME: 'WELCOME',
        INVENTORY_LOW_STOCK: 'INVENTORY_LOW_STOCK',
        PRODUCT_UPDATES: 'PRODUCT_UPDATES',
        PROMOTIONAL: 'PROMOTIONAL',
        PROMOTIONAL_NEWSLETTER: 'PROMOTIONAL_NEWSLETTER',
        ABANDONED_CART_REMINDER_1: 'ABANDONED_CART_REMINDER_1',
        ABANDONED_CART_REMINDER_2: 'ABANDONED_CART_REMINDER_2',
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
        ORDER_SHIPPED: {
            folderName: 'shipstation_emails/order_shipped',
            subject: "Your Order Has Been Completed | VapeHub",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ORDER_PACKED: {
            folderName: 'shipstation_emails/order_packed',
            subject: "Your Order Has Been Packed | VapeHub",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ORDER_OUT_FOR_DELIVERY: {
            folderName: 'shipstation_emails/order_out_for_delivery',
            subject: "Your Order Is Out For Delivery | VapeHub",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ORDER_DELIVERED: {
            folderName: 'shipstation_emails/order_delivered',
            subject: "Your Order Has Been Delivered | VapeHub",
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        ORDER_FAILED: {
            folderName: 'shipstation_emails/order_failed',
            subject: "Order Fulfillment Issue | VapeHub",
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
        REFUND_CONFIRMATION: {
            folderName: 'refund_confirmation',
            subject: 'Refund Confirmation',
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        WELCOME: {
            folderName: 'welcome',
            subject: 'Welcome to VapeHub! 🎉',
            from: process.env.EMAIL_NO_REPLY_SENDER
        },
        INVENTORY_LOW_STOCK: {
            folderName: 'inventory',
            subject: 'Low Stock Alert: Product Variants',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        PRODUCT_UPDATES: {
            folderName: 'product_updates',
            subject: 'New Products Alert! 🆕 Latest Additions to VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        PROMOTIONAL: {
            folderName: 'promotional_newsletter',
            subject: 'Special Offer from VapeHub! 🎉',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        PROMOTIONAL_NEWSLETTER: {
            folderName: 'promotional_newsletter',
            subject: '',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        ABANDONED_CART_REMINDER_1: {
            folderName: 'abandoned_cart/reminder_1',
            subject: 'Did you forget something? Complete your purchase | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
        },
        ABANDONED_CART_REMINDER_2: {
            folderName: 'abandoned_cart/reminder_2',
            subject: 'Complete your order with 10% off | VapeHub',
            from: process.env.EMAIL_NO_REPLY_SENDER,
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
    checkout: {
        FREE_SHIPPING_MERCHANDISE_GBP: 30,
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
            LOW_STOCK: 'low_stock',
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
        stockStatus: ['in_stock', 'low_stock', 'out_of_stock', 'backorder']
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
    ],
    
    // Deal related constants
    DEAL_TYPES: {
        BUY_N_FOR_FIXED: 'BUY_N_FOR_FIXED',       // Buy any N for fixed price
        BUY_X_GET_Y_FREE: 'BUY_X_GET_Y_FREE',     // Buy X get Y free
        BUY_MORE_SAVE_MORE: 'BUY_MORE_SAVE_MORE', // Tiered discounts
        BUNDLE: 'BUNDLE',                         // Fixed price for product combo
        QUANTITY_DISCOUNT: 'QUANTITY_DISCOUNT'    // Volume-based price drops
    },
    DEAL_TYPE_ENUMS: [
        'BUY_N_FOR_FIXED',
        'BUY_X_GET_Y_FREE',
        'BUY_MORE_SAVE_MORE',
        'BUNDLE',
        'QUANTITY_DISCOUNT'
    ],

    // Legal content settings constants
    LEGAL_CONTENT_KEYS: {
        'DELIVERY INFORMATION': 'delivery_information',
        'PRIVACY POLICY': 'privacy_policy',
        'RETURNS POLICY': 'returns_policy',
        'TERMS CONDITIONS': 'terms_conditions',
        'DISPATCH NOTICE': 'dispatch_notice',
        'LOYALTY POINTS': 'loyalty_points',
        'KEY HIGHLIGHTS': 'key_highlights'
    },
    LEGAL_CONTENT_KEY_ENUMS: [
        'delivery_information',
        'privacy_policy',
        'returns_policy',
        'terms_conditions',
        'dispatch_notice',
        'loyalty_points',
        'key_highlights'
    ]
}