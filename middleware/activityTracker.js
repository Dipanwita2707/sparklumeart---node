const UserActivity = require('../models/UserActivity');
const { v4: uuidv4 } = require('uuid');
const UserBehaviorAnalyzer = require('../services/userBehaviorAnalyzer');

/**
 * Middleware to track user activities throughout the website
 */
const activityTracker = {
    /**
     * Initialize activity tracking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    init: (req, res, next) => {
        // Skip tracking for admin routes
        if (req.path.startsWith('/admin') && req.user && req.user.role === 'admin') {
            return next();
        }
        
        // Skip for static resources
        if (req.path.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
            return next();
        }
        
        // Create or load session ID for tracking
        if (!req.session.trackingId) {
            req.session.trackingId = uuidv4();
        }
        
        // Set initial visit timestamp
        if (!req.session.visitStart) {
            req.session.visitStart = Date.now();
        }
        
        // Track last activity time to calculate time spent
        if (!req.session.lastActivity) {
            req.session.lastActivity = Date.now();
        } else {
            // Calculate time spent on previous page
            const timeSpent = Date.now() - req.session.lastActivity;
            
            // Update last activity time
            req.session.lastActivity = Date.now();
            
            // If authenticated, record previous page time spent
            if (req.user && req.session.lastPath && timeSpent > 1000 && timeSpent < 3600000) { // Between 1 second and 1 hour
                const previousActivity = req.session.currentActivity;
                
                if (previousActivity) {
                    // Update the time spent on the previous activity if it exists
                    UserActivity.findByIdAndUpdate(
                        previousActivity,
                        { $set: { timeSpent: Math.floor(timeSpent / 1000) } } // Convert to seconds
                    ).catch(err => console.error('Error updating time spent:', err));
                }
            }
        }
        
        next();
    },
    
    /**
     * General method to track any user activity
     * @param {Object} req - Express request object 
     * @param {Object} activityData - Activity data to record
     * @returns {Promise<Object>} - The created activity record
     */
    trackActivity: async (req, activityData) => {
        if (!req.user) return null;
        
        try {
            // Ensure we have a tracking session ID
            if (!req.session.trackingId) {
                req.session.trackingId = uuidv4();
            }
            
            // Create activity record
            const activity = new UserActivity({
                user: req.user._id,
                session: req.session.trackingId,
                activityType: activityData.activityType,
                route: req.path,
                referrer: req.get('Referrer') || null,
                timeSpent: 0, // Will be updated when user navigates away
                deviceInfo: {
                    userAgent: req.get('User-Agent'),
                    platform: req.get('sec-ch-ua-platform')
                },
                metadata: {
                    ...activityData.details,
                    query: req.query,
                    method: req.method
                },
                ipAddress: req.ip
            });
            
            // Add target info if available in activityData
            if (activityData.targetId) {
                activity.targetId = activityData.targetId;
                activity.targetModel = activityData.targetModel;
            }
            
            await activity.save();
            
            // Store current activity ID for time update
            req.session.currentActivity = activity._id;
            req.session.lastPath = req.path;
            
            // Run behavior analysis occasionally (to avoid doing it on every request)
            // Every 10th activity for a user will trigger an analysis
            const activityCount = await UserActivity.countDocuments({ user: req.user._id });
            
            if (activityCount % 10 === 0 || activityData.activityType === 'checkout' || 
                activityData.activityType === 'complete_psychometric_test') {
                // Run asynchronously to not block the response
                UserBehaviorAnalyzer.updateLeadFromBehavior(req.user._id)
                    .catch(err => console.error('Error updating lead from behavior:', err));
            }
            
            return activity;
        } catch (err) {
            console.error('Error tracking user activity:', err);
            return null;
        }
    },
    
    /**
     * Track page views
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    trackPageView: async (req, res, next) => {
        if (!req.user) {
            return next();
        }
        
        try {
            // Determine activity type based on route
            let activityType = 'page_view';
            let targetId = null;
            let targetModel = null;
            
            // Product views
            if (req.path.match(/^\/products\/[a-f\d]{24}$/i)) {
                activityType = 'product_view';
                targetId = req.params.id || req.path.split('/').pop();
                targetModel = 'Product';
            } 
            // Gallery views
            else if (req.path.match(/^\/gallery(\/.*)?$/i)) {
                activityType = 'gallery_view';
            }
            // Psychometric test interaction
            else if (req.path.match(/^\/psychometric-test(\/.*)?$/i)) {
                activityType = 'psychometric_test';
            }
            
            // Use the general trackActivity method
            await activityTracker.trackActivity(req, {
                activityType,
                targetId,
                targetModel,
                details: {}
            });
        } catch (err) {
            console.error('Error tracking user activity:', err);
        }
        
        next();
    },
    
    /**
     * Track search actions
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    trackSearch: async (req, res, next) => {
        if (!req.user || !req.query.q) {
            return next();
        }
        
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'search',
                details: {
                    searchQuery: req.query.q,
                    filters: { ...req.query }
                }
            });
        } catch (err) {
            console.error('Error tracking search activity:', err);
        }
        
        next();
    },
    
    /**
     * Track cart actions (add, remove)
     * This function should be called explicitly from routes
     * @param {String} action - Action type (add_to_cart, remove_from_cart)
     * @param {Object} req - Express request object
     * @param {Object} productId - Product ID
     */
    trackCartAction: async (action, req, productId) => {
        if (!req.user) return;
        
        try {
            await activityTracker.trackActivity(req, {
                activityType: action,
                targetId: productId,
                targetModel: 'Product',
                details: {
                    productId
                }
            });
        } catch (err) {
            console.error(`Error tracking ${action} activity:`, err);
        }
    },
    
    /**
     * Track checkout actions
     * This function should be called explicitly from checkout routes
     * @param {Object} req - Express request object
     * @param {Object} orderId - Order ID
     */
    trackCheckout: async (req, orderId) => {
        if (!req.user) return;
        
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'checkout',
                details: {
                    orderId
                }
            });
        } catch (err) {
            console.error('Error tracking checkout activity:', err);
        }
    },
    
    /**
     * Track user login
     * @param {Object} req - Express request object
     * @param {Object} userId - User ID
     */
    trackLogin: async (req, userId) => {
        try {
            // Generate new tracking ID for this session
            req.session.trackingId = uuidv4();
            req.session.visitStart = Date.now();
            req.session.lastActivity = Date.now();
            
            // We create this activity directly since the user might not be set in req.user yet
            const activity = new UserActivity({
                user: userId,
                session: req.session.trackingId,
                activityType: 'login',
                route: req.path,
                referrer: req.get('Referrer') || null,
                metadata: {
                    method: req.method,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                },
                ipAddress: req.ip
            });
            
            await activity.save();
        } catch (err) {
            console.error('Error tracking login activity:', err);
        }
    },
    
    /**
     * Track user logout
     * @param {Object} req - Express request object
     */
    trackLogout: async (req) => {
        if (!req.user) return;
        
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'logout',
                details: {
                    sessionDuration: Date.now() - (req.session.visitStart || Date.now())
                }
            });
        } catch (err) {
            console.error('Error tracking logout activity:', err);
        }
    }
};

module.exports = activityTracker; 