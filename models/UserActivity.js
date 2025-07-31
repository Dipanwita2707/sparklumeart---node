const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserActivitySchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    session: {
        type: String,
        required: true
    },
    activityType: {
        type: String,
        enum: [
            'page_view', 'product_view', 'gallery_view', 'psychometric_test', 
            'search', 'click', 'add_to_cart', 'remove_from_cart', 'checkout', 'begin_checkout',
            'custom_request', 'wishlist_add', 'wishlist_remove', 'login', 'logout',
            'behavior_analysis', 'view_dashboard', 'view_orders', 'view_order_details', 
            'view_profile', 'start_psychometric_test', 'complete_psychometric_test', 
            'purchase', 'product_browsing', 'gallery_browsing'
        ],
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'targetModel'
    },
    targetModel: {
        type: String,
        enum: ['Product', 'Gallery', 'PsychometricTest', 'CustomRequest', null]
    },
    route: {
        type: String
    },
    referrer: {
        type: String
    },
    timeSpent: {
        type: Number,  // Time spent in seconds
        default: 0
    },
    deviceInfo: {
        type: Object
    },
    metadata: {
        type: Schema.Types.Mixed
    },
    location: {
        type: String
    },
    ipAddress: {
        type: String
    }
}, { timestamps: true });

// Index for efficient querying
UserActivitySchema.index({ user: 1, createdAt: -1 });
UserActivitySchema.index({ session: 1 });
UserActivitySchema.index({ activityType: 1 });

module.exports = mongoose.model('UserActivity', UserActivitySchema); 