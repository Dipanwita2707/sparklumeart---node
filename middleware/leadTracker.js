const Lead = require('../models/Lead');
const AILeadService = require('../services/aiLeadService');
const UserActivity = require('../models/UserActivity');

/**
 * Lead tracking middleware
 * Records user activities that might indicate lead interest
 */
const leadTracker = {
    /**
     * Track psychometric test completion
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    async trackPsychometricTest(req, res, next) {
        try {
            if (!req.user) return next();
            
            const testId = req.params.id;
            const testScore = req.body.score;
            const testResult = req.body.result;
            
            // Look for existing lead
            let lead = await Lead.findOne({ user: req.user._id });
            
            // Create new lead if none exists
            if (!lead) {
                lead = new Lead({
                    user: req.user._id,
                    source: 'psychometric_test',
                    status: 'new',
                    tags: ['psychometric_test', `test_${testId}`]
                });
            } else {
                // Update existing lead
                lead.tags = [...new Set([...lead.tags || [], 'psychometric_test', `test_${testId}`])];
                lead.lastContact = new Date();
            }
            
            // Create activity record
            const activity = new UserActivity({
                user: req.user._id,
                activityType: 'psychometric_test',
                route: req.originalUrl,
                metadata: {
                    testId,
                    testScore,
                    testResult
                }
            });
            
            await activity.save();
            
            // Process the lead with AI and trigger appropriate actions
            await AILeadService.processLeadWithActions(lead);
            
            next();
        } catch (error) {
            console.error('Error tracking psychometric test:', error);
            next();
        }
    },
    
    /**
     * Track custom request submission
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    async trackCustomRequest(req, res, next) {
        try {
            if (!req.user) return next();
            
            const { title, description, budget } = req.body;
            
            // Look for existing lead
            let lead = await Lead.findOne({ user: req.user._id });
            
            // Create new lead if none exists
            if (!lead) {
                lead = new Lead({
                    user: req.user._id,
                    source: 'custom_request',
                    status: 'new',
                    tags: ['custom_request']
                });
                
                // Tag high budget requests
                if (budget && budget > 500) {
                    lead.tags.push('high_budget');
                }
            } else {
                // Update existing lead
                lead.tags = [...new Set([...lead.tags || [], 'custom_request'])];
                
                // Tag high budget requests
                if (budget && budget > 500 && !lead.tags.includes('high_budget')) {
                    lead.tags.push('high_budget');
                }
                
                lead.lastContact = new Date();
            }
            
            // Create activity record
            const activity = new UserActivity({
                user: req.user._id,
                activityType: 'custom_request',
                route: req.originalUrl,
                metadata: {
                    title,
                    budget
                }
            });
            
            await activity.save();
            
            // Process the lead with AI and trigger appropriate actions
            await AILeadService.processLeadWithActions(lead);
            
            next();
        } catch (error) {
            console.error('Error tracking custom request:', error);
            next();
        }
    },
    
    /**
     * Track product view
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    productView(req, res, next) {
        try {
            if (req.user) {
                // Record this asynchronously
                setTimeout(async () => {
                    try {
                        // Check recent product views
                        const recentLeads = await Lead.countDocuments({
                            user: req.user._id,
                            source: 'product_view',
                            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
                        });
                        
                        // Create or update lead
                        let lead = await Lead.findOne({
                            user: req.user._id,
                            source: 'product_view',
                            activityType: 'product_browsing'
                        });
                        
                        if (!lead) {
                            lead = new Lead({
                                user: req.user._id,
                                source: 'product_view',
                                activityType: 'product_browsing',
                                activityData: {
                                    productId: req.params.id,
                                    viewCount: recentLeads + 1,
                                    lastViewed: new Date()
                                }
                            });
                        } else {
                            lead.activityData.viewCount = recentLeads + 1;
                            lead.activityData.lastViewed = new Date();
                        }
                        
                        // Get AI scoring and insights
                        const aiResult = await AILeadService.scoreNewLead(lead);
                        lead.aiScore = aiResult.score;
                        lead.interestLevel = aiResult.interestLevel;
                        lead.conversionProbability = aiResult.conversionProbability;
                        lead.aiInsights = aiResult.insights;
                        lead.recommendedActions = aiResult.recommendedActions;
                        lead.aiLastUpdated = new Date();
                        
                        // Update behavior patterns
                        lead.behaviorPatterns = [
                            {
                                type: 'product_interest',
                                confidence: Math.min(70 + (recentLeads * 10), 95),
                                details: `Viewed ${recentLeads + 1} products in last 24 hours`
                            }
                        ];
                        
                        // Update engagement metrics
                        await lead.updateEngagementMetrics();
                        
                        // Assign a seller if needed
                        if (aiResult.score >= 60) {
                            const sellerId = await AILeadService.assignSellerToLead(lead);
                            if (sellerId) {
                                lead.assignedSeller = sellerId;
                            }
                        }
                        
                        await lead.save();
                    } catch (error) {
                        console.error('Error tracking product view for lead:', error);
                    }
                }, 0);
            }
        } catch (error) {
            console.error('Error in product view middleware:', error);
        }
        
        next();
    },
    
    /**
     * Track gallery browsing
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     * @param {Function} next - Next middleware function
     */
    galleryView(req, res, next) {
        try {
            if (req.user) {
                // Record this asynchronously
                setTimeout(async () => {
                    try {
                        // Create or update lead
                        let lead = await Lead.findOne({
                            user: req.user._id,
                            source: 'gallery_view',
                            activityType: 'gallery_browsing'
                        });
                        
                        if (!lead) {
                            lead = new Lead({
                                user: req.user._id,
                                source: 'gallery_view',
                                activityType: 'gallery_browsing',
                                activityData: {
                                    viewTime: new Date(),
                                    viewCount: 1
                                }
                            });
                        } else {
                            lead.activityData.viewCount = (lead.activityData.viewCount || 0) + 1;
                            lead.activityData.lastViewed = new Date();
                        }
                        
                        // Get AI scoring and insights
                        const aiResult = await AILeadService.scoreNewLead(lead);
                        lead.aiScore = aiResult.score;
                        lead.interestLevel = aiResult.interestLevel;
                        lead.conversionProbability = aiResult.conversionProbability;
                        lead.aiInsights = aiResult.insights;
                        lead.recommendedActions = aiResult.recommendedActions;
                        lead.aiLastUpdated = new Date();
                        
                        // Update behavior patterns
                        lead.behaviorPatterns = [
                            {
                                type: 'gallery_engagement',
                                confidence: Math.min(60 + (lead.activityData.viewCount * 5), 90),
                                details: `Gallery views: ${lead.activityData.viewCount}`
                            }
                        ];
                        
                        // Update engagement metrics
                        await lead.updateEngagementMetrics();
                        
                        // Assign a seller if needed
                        if (aiResult.score >= 60) {
                            const sellerId = await AILeadService.assignSellerToLead(lead);
                            if (sellerId) {
                                lead.assignedSeller = sellerId;
                            }
                        }
                        
                        await lead.save();
                    } catch (error) {
                        console.error('Error tracking gallery view for lead:', error);
                    }
                }, 0);
            }
        } catch (error) {
            console.error('Error in gallery view middleware:', error);
        }
        
        next();
    }
};

module.exports = leadTracker; 