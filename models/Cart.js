const mongoose = require('mongoose');

// Define the cart item schema
const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        default: 1,
        min: 1
    },
    price: {
        type: Number,
        required: true
    }
});

// Define the main cart schema
const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [cartItemSchema],
    totalQuantity: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        default: 0
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

// Calculate totals before saving
cartSchema.pre('save', function(next) {
    let totalQuantity = 0;
    let totalAmount = 0;
    
    this.items.forEach(item => {
        totalQuantity += item.quantity;
        totalAmount += (item.price * item.quantity);
    });
    
    this.totalQuantity = totalQuantity;
    this.totalAmount = totalAmount;
    this.updatedAt = Date.now();
    
    next();
});

module.exports = mongoose.model('Cart', cartSchema); 