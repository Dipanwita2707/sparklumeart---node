const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            title: String,
            artistName: String,
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: {
                type: Number,
                required: true
            },
            seller: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }
    ],
    totalAmount: {
        type: Number,
        required: true
    },
    shippingAddress: {
        firstName: String,
        lastName: String,
        email: String,
        address: String,
        city: String,
        postalCode: String,
        country: String,
        phone: String
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    orderStatus: {
        type: String,
        enum: ['processing', 'approved', 'shipped', 'in_transit', 'delivered', 'cancelled'],
        default: 'processing'
    },
    trackingNumber: {
        type: String,
        default: null
    },
    estimatedDeliveryDate: {
        type: Date,
        default: null
    },
    emailNotifications: [{
        status: {
            type: String,
            enum: ['processing', 'approved', 'in_transit', 'delivered', 'cancelled']
        },
        sentAt: {
            type: Date,
            default: Date.now
        },
        successful: {
            type: Boolean,
            default: true
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema); 