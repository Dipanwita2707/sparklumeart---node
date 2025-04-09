const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SellerPerformanceSchema = new Schema({
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    metrics: {
        leadsAssigned: {
            type: Number,
            default: 0
        },
        leadsContacted: {
            type: Number,
            default: 0
        },
        leadsQualified: {
            type: Number,
            default: 0
        },
        proposalsSent: {
            type: Number,
            default: 0
        },
        salesClosed: {
            type: Number,
            default: 0
        },
        totalRevenue: {
            type: Number,
            default: 0
        },
        averageOrderValue: {
            type: Number,
            default: 0
        },
        conversionRate: {
            type: Number,
            default: 0
        },
        responseTime: {
            type: Number, // in hours
            default: 0
        }
    },
    aiInsights: [{
        type: String
    }],
    performanceScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    strengths: [{
        type: String
    }],
    improvementAreas: [{
        type: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('SellerPerformance', SellerPerformanceSchema); 