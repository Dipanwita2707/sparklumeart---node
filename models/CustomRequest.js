const mongoose = require('mongoose');

const customRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['portrait', 'landscape', 'room_decor', 'custom_gift'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    budget: {
        type: Number,
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'assigned', 'in_progress', 'completed', 'cancelled'],
        default: 'open'
    },
    address: {
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
    phoneNumber: {
        type: String,
        required: true,
        match: /^[0-9]{10}$/
    },
    assignedSeller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    bids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
    }],
    expectedDeliveryDate: {
        type: Date,
        default: null
    },
    paymentId: {
        type: String,
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
customRequestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('CustomRequest', customRequestSchema); 