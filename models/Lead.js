const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LeadSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    source: {
        type: String,
        enum: ['psychometric_test', 'gallery_view', 'product_view', 'custom_request', 'direct_inquiry', 'user_behavior', 'referral', 'marketing_campaign'],
        required: true
    },
    activityType: {
        type: String,
        required: true
    },
    activityData: {
        type: Schema.Types.Mixed
    },
    aiScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    interestLevel: {
        type: String,
        enum: ['very_low', 'low', 'medium', 'high', 'very_high'],
        default: 'medium'
    },
    conversionProbability: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    aiInsights: [{
        type: String
    }],
    recommendedActions: [{
        type: String
    }],
    assignedSeller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    status: {
        type: String,
        enum: ['new', 'contacted', 'qualified', 'proposal', 'converted', 'lost', 'nurturing'],
        default: 'new'
    },
    notes: [{
        text: String,
        createdAt: {
            type: Date,
            default: Date.now
        },
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        type: {
            type: String,
            enum: ['general', 'ai_insight', 'seller_note', 'status_change', 'assignment', 'follow_up'],
            default: 'general'
        }
    }],
    lastContact: {
        type: Date,
        default: null
    },
    nextFollowUp: {
        type: Date,
        default: null
    },
    followUpReminder: {
        enabled: {
            type: Boolean,
            default: false
        },
        reminderType: {
            type: String,
            enum: ['email', 'sms', 'notification', 'all'],
            default: 'notification'
        },
        reminderSent: {
            type: Boolean,
            default: false
        }
    },
    tags: [String],
    isActive: {
        type: Boolean,
        default: true
    },
    aiLastUpdated: {
        type: Date,
        default: Date.now
    },
    behaviorPatterns: [{
        type: String,
        confidence: Number,
        details: String
    }],
    engagementMetrics: {
        totalInteractions: {
            type: Number,
            default: 0
        },
        lastInteraction: {
            type: Date,
            default: null
        },
        averageResponseTime: {
            type: Number,
            default: null
        },
        interactionFrequency: {
            type: String,
            enum: ['low', 'medium', 'high', 'very_high'],
            default: 'low'
        },
        websiteVisits: {
            type: Number,
            default: 0
        },
        productViews: {
            type: Number,
            default: 0
        },
        cartInteractions: {
            type: Number,
            default: 0
        },
        emailEngagement: {
            opens: {
                type: Number,
                default: 0
            },
            clicks: {
                type: Number,
                default: 0
            }
        },
        lastPageVisited: {
            path: String,
            timestamp: Date
        }
    },
    emailTracking: {
        lastSent: Date,
        sentCount: { type: Number, default: 0 },
        opens: [{
            timestamp: Date,
            ip: String,
            userAgent: String
        }],
        clicks: [{
            timestamp: Date,
            link: String,
            ip: String,
            userAgent: String
        }]
    },
    previousScores: [{
        score: Number,
        date: { type: Date, default: Date.now },
        reason: String
    }],
    priorityScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    lastStatusChange: {
        date: Date,
        previousStatus: String
    }
}, { timestamps: true });

// Indexes for better query performance
LeadSchema.index({ user: 1, createdAt: -1 });
LeadSchema.index({ aiScore: -1 });
LeadSchema.index({ status: 1, aiScore: -1 });
LeadSchema.index({ assignedSeller: 1, status: 1 });
LeadSchema.index({ nextFollowUp: 1 });
LeadSchema.index({ tags: 1 });
LeadSchema.index({ priorityScore: -1 });

// Virtual for lead age
LeadSchema.virtual('age').get(function() {
    return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to update engagement metrics
LeadSchema.methods.updateEngagementMetrics = async function() {
    const activities = await mongoose.model('UserActivity').find({
        user: this.user,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).sort({ createdAt: 1 });

    this.engagementMetrics.totalInteractions = activities.length;
    this.engagementMetrics.lastInteraction = activities.length > 0 ? activities[activities.length - 1].createdAt : null;
    
    // Calculate average response time
    if (activities.length > 1) {
        let totalResponseTime = 0;
        let responseCount = 0;
        
        for (let i = 1; i < activities.length; i++) {
            const timeDiff = activities[i].createdAt - activities[i-1].createdAt;
            if (timeDiff < 24 * 60 * 60 * 1000) { // Only count responses within 24 hours
                totalResponseTime += timeDiff;
                responseCount++;
            }
        }
        
        this.engagementMetrics.averageResponseTime = responseCount > 0 ? 
            Math.round(totalResponseTime / responseCount / (1000 * 60)) : null; // in minutes
    }
    
    // Set interaction frequency
    const dailyAverage = activities.length / 30;
    if (dailyAverage >= 3) {
        this.engagementMetrics.interactionFrequency = 'very_high';
    } else if (dailyAverage >= 2) {
        this.engagementMetrics.interactionFrequency = 'high';
    } else if (dailyAverage >= 1) {
        this.engagementMetrics.interactionFrequency = 'medium';
    } else {
        this.engagementMetrics.interactionFrequency = 'low';
    }

    // Count specific activity types
    const pageViews = activities.filter(a => a.type === 'page_view').length;
    const productViews = activities.filter(a => a.type === 'product_view').length;
    const cartActions = activities.filter(a => a.type.includes('cart')).length;
    
    this.engagementMetrics.websiteVisits = pageViews;
    this.engagementMetrics.productViews = productViews;
    this.engagementMetrics.cartInteractions = cartActions;
    
    // Get the last page visited
    const lastPageActivity = activities
        .filter(a => a.type === 'page_view')
        .sort((a, b) => b.createdAt - a.createdAt)[0];
        
    if (lastPageActivity) {
        this.engagementMetrics.lastPageVisited = {
            path: lastPageActivity.data.path,
            timestamp: lastPageActivity.createdAt
        };
    }
    
    // Calculate priority score based on engagement
    this.calculatePriorityScore();
    
    await this.save();
};

// Method to calculate priority score
LeadSchema.methods.calculatePriorityScore = function() {
    // Base the priority on AI score (50%)
    let priorityScore = this.aiScore * 0.5;
    
    // Add engagement factor (20%)
    const engagementFactor = 
        this.engagementMetrics.interactionFrequency === 'very_high' ? 20 :
        this.engagementMetrics.interactionFrequency === 'high' ? 15 :
        this.engagementMetrics.interactionFrequency === 'medium' ? 10 : 5;
    
    priorityScore += engagementFactor;
    
    // Add recency factor (15%)
    if (this.engagementMetrics.lastInteraction) {
        const daysSinceLastInteraction = (Date.now() - new Date(this.engagementMetrics.lastInteraction)) / (1000 * 60 * 60 * 24);
        const recencyFactor = daysSinceLastInteraction <= 1 ? 15 :
                             daysSinceLastInteraction <= 3 ? 10 :
                             daysSinceLastInteraction <= 7 ? 5 : 0;
        priorityScore += recencyFactor;
    }
    
    // Add cart activity factor (15%)
    const cartFactor = this.engagementMetrics.cartInteractions > 0 ? 15 : 0;
    priorityScore += cartFactor;
    
    // Ensure the score is between 0-100
    this.priorityScore = Math.min(100, Math.max(0, Math.round(priorityScore)));
};

// Add a pre-save hook to track score changes
LeadSchema.pre('save', function(next) {
    // If the aiScore is being modified, save the previous score
    if (this.isModified('aiScore')) {
        const currentScore = this.aiScore;
        
        // Only save if we have a previous score to compare
        if (this._aiScorePrevious !== undefined && this._aiScorePrevious !== currentScore) {
            // If previousScores doesn't exist, initialize it
            if (!this.previousScores) this.previousScores = [];
            
            // Add the previous score to history
            this.previousScores.push({
                score: this._aiScorePrevious,
                date: new Date(),
                reason: this._aiScoreChangeReason || 'Score update'
            });
            
            // Trim history if it gets too long (keep last 10)
            if (this.previousScores.length > 10) {
                this.previousScores = this.previousScores.slice(-10);
            }
        }
        
        // Save current score for next comparison
        this._aiScorePrevious = currentScore;
    }
    
    // Track status changes
    if (this.isModified('status')) {
        const newStatus = this.status;
        const oldStatus = this._oldStatus || 'new';
        
        this.lastStatusChange = {
            date: new Date(),
            previousStatus: oldStatus
        };
        
        this._oldStatus = newStatus;
    }
    
    next();
});

// Method to update the AI score with a reason
LeadSchema.methods.updateAiScore = function(newScore, reason) {
    this._aiScorePrevious = this.aiScore;
    this._aiScoreChangeReason = reason;
    this.aiScore = newScore;
    return this.save();
};

// Method to check if lead qualifies for an automated email
LeadSchema.methods.qualifiesForEmail = function() {
    // Don't send emails too frequently
    if (this.emailTracking && this.emailTracking.lastSent) {
        const lastEmailDate = new Date(this.emailTracking.lastSent);
        const daysSinceLastEmail = (Date.now() - lastEmailDate.getTime()) / (1000 * 60 * 60 * 24);
        
        // Don't send more than 1 email every 3 days
        if (daysSinceLastEmail < 3) return false;
    }
    
    // Check for significant score increase
    if (this.previousScores && this.previousScores.length > 0) {
        const latestPreviousScore = this.previousScores[this.previousScores.length - 1].score;
        if (this.aiScore - latestPreviousScore >= 5) return true;
    }
    
    // Check for specific behavior patterns
    const hasRelevantPattern = this.behaviorPatterns && this.behaviorPatterns.some(p => 
        (p.type === 'cart_abandonment' || p.type === 'product_interest') && p.confidence > 70
    );
    
    return hasRelevantPattern;
};

module.exports = mongoose.model('Lead', LeadSchema); 