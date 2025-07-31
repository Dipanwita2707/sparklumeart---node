const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
    customRequest: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomRequest',
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    deliveryTime: {
        type: Number,
        required: true,
        min: 1
    },
    proposal: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    shippingAddress: {
        street: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        }
    },
    tentativeDeliveryDate: {
        type: Date,
        default: null
    },
    shippingDetails: {
        billNumber: {
            type: String,
            default: null
        },
        trackingId: {
            type: String,
            default: null
        },
        billPdfPath: {
            type: String,
            default: null
        },
        certificateOfAuthenticityPath: {
            type: String,
            default: null
        },
        updatedAt: {
            type: Date,
            default: null
        }
    },
    delivered: {
        type: Boolean,
        default: false
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamps on save
bidSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Ensure one seller can only bid once per request
bidSchema.index({ customRequest: 1, seller: 1 }, { unique: true });

module.exports = mongoose.model('Bid', bidSchema); 