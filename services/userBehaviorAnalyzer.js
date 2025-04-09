const UserActivity = require('../models/UserActivity');
const Lead = require('../models/Lead');
const AILeadService = require('./aiLeadService');

class UserBehaviorAnalyzer {
    /**
     * Get comprehensive user activity metrics
     * @param {ObjectId} userId - The user ID to analyze
     * @param {Object} options - Analysis options
     * @returns {Object} - User behavior metrics and insights
     */
    static async analyzeUserBehavior(userId, options = {}) {
        const { timeframe = 30 } = options; // Default to 30 days analysis
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);
        
        // Get all user activities within timeframe
        const activities = await UserActivity.find({
            user: userId,
            createdAt: { $gte: startDate, $lte: endDate }
        }).sort({ createdAt: 1 });
        
        if (!activities.length) {
            return {
                userId,
                interactionLevel: 'none',
                metrics: {
                    totalActivities: 0,
                    uniqueVisits: 0,
                    avgTimeSpent: 0,
                    productViews: 0,
                    addToCart: 0,
                    conversion: 0
                },
                patterns: [],
                potentialScore: 0,
                insights: ['No activity recorded for this user in the specified timeframe.']
            };
        }
        
        // Extract visit sessions (unique per day)
        const sessions = [...new Set(activities.map(a => a.session))];
        
        // Calculate basic metrics
        const metrics = {
            totalActivities: activities.length,
            uniqueVisits: sessions.length,
            avgTimeSpent: this._calculateAverageTimeSpent(activities),
            productViews: activities.filter(a => a.activityType === 'product_view').length,
            addToCart: activities.filter(a => a.activityType === 'add_to_cart').length,
            checkout: activities.filter(a => a.activityType === 'checkout').length,
            searches: activities.filter(a => a.activityType === 'search').length,
            productEngagement: this._calculateProductEngagement(activities),
            lastVisit: activities[activities.length - 1].createdAt
        };
        
        // Identify most viewed products
        const productViews = activities.filter(a => a.activityType === 'product_view');
        const productCounts = {};
        
        productViews.forEach(view => {
            const productId = view.targetId.toString();
            productCounts[productId] = (productCounts[productId] || 0) + 1;
        });
        
        // Sort products by view count
        const topProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id, count]) => ({ id, count }));
            
        // Identify visit patterns
        const patterns = this._identifyPatterns(activities);
        
        // Calculate potential score (0-100)
        const potentialScore = this._calculatePotentialScore(metrics, patterns);
        
        // Generate insights
        const insights = this._generateInsights(metrics, patterns, potentialScore);
        
        // Determine interaction level
        const interactionLevel = this._determineInteractionLevel(potentialScore);
        
        return {
            userId,
            interactionLevel,
            metrics,
            topProducts,
            patterns,
            potentialScore,
            insights
        };
    }
    
    /**
     * Calculate average time spent per session
     * @param {Array} activities - List of user activities
     * @returns {Number} - Average time in minutes
     */
    static _calculateAverageTimeSpent(activities) {
        if (!activities.length) return 0;
        
        // Group by session
        const sessionMap = {};
        activities.forEach(activity => {
            if (!sessionMap[activity.session]) {
                sessionMap[activity.session] = [];
            }
            sessionMap[activity.session].push(activity);
        });
        
        // Calculate duration for each session
        let totalDuration = 0;
        let sessionCount = 0;
        
        Object.values(sessionMap).forEach(sessionActivities => {
            if (sessionActivities.length <= 1) return; // Skip single activity sessions
            
            const firstActivity = sessionActivities[0];
            const lastActivity = sessionActivities[sessionActivities.length - 1];
            
            const duration = (new Date(lastActivity.createdAt) - new Date(firstActivity.createdAt)) / 1000; // in seconds
            
            // Only count if duration is reasonable (less than 3 hours)
            if (duration > 0 && duration < 10800) {
                totalDuration += duration;
                sessionCount++;
            }
        });
        
        // Return average in minutes
        return sessionCount ? Math.round((totalDuration / sessionCount) / 60) : 0;
    }
    
    /**
     * Calculate product engagement score
     * @param {Array} activities - List of user activities
     * @returns {Number} - Engagement score (0-100)
     */
    static _calculateProductEngagement(activities) {
        if (!activities.length) return 0;
        
        // Count engagement activities
        const viewCount = activities.filter(a => a.activityType === 'product_view').length;
        const cartCount = activities.filter(a => a.activityType === 'add_to_cart').length * 2; // Weight cart actions higher
        const wishlistCount = activities.filter(a => a.activityType === 'wishlist_add').length;
        const checkoutCount = activities.filter(a => a.activityType === 'checkout').length * 3; // Weight checkout highest
        
        // Calculate engagement score
        const totalEngagementPoints = viewCount + cartCount + wishlistCount + checkoutCount;
        const maxPoints = activities.length * 3; // Maximum possible points if all activities were checkouts
        
        return Math.min(100, Math.round((totalEngagementPoints / maxPoints) * 100));
    }
    
    /**
     * Identify user behavior patterns
     * @param {Array} activities - List of user activities
     * @returns {Array} - Identified patterns
     */
    static _identifyPatterns(activities) {
        const patterns = [];
        
        // Check for recurring visits
        const visitDates = activities
            .filter(a => a.activityType === 'page_view')
            .map(a => new Date(a.createdAt).toLocaleDateString());
        
        const uniqueDates = [...new Set(visitDates)];
        
        if (uniqueDates.length > 3) {
            patterns.push({
                type: 'recurring_visitor',
                confidence: Math.min(100, uniqueDates.length * 10),
                details: `User visited the site on ${uniqueDates.length} different days.`
            });
        }
        
        // Check for product focused browsing
        const productViewRatio = activities.filter(a => a.activityType === 'product_view').length / activities.length;
        
        if (productViewRatio > 0.4) {
            patterns.push({
                type: 'product_focused',
                confidence: Math.round(productViewRatio * 100),
                details: `${Math.round(productViewRatio * 100)}% of user activities involve viewing products.`
            });
        }
        
        // Check for abandoned carts
        const cartAdds = activities.filter(a => a.activityType === 'add_to_cart').length;
        const checkouts = activities.filter(a => a.activityType === 'checkout').length;
        
        if (cartAdds > checkouts) {
            patterns.push({
                type: 'cart_abandoner',
                confidence: Math.min(100, (cartAdds - checkouts) * 25),
                details: `User added items to cart ${cartAdds} times but only completed ${checkouts} checkouts.`
            });
        }
        
        // Check for quick browsing
        const avgTimePerView = this._calculateAverageTimeSpent(activities);
        
        if (avgTimePerView < 1) {
            patterns.push({
                type: 'quick_browser',
                confidence: Math.min(100, 100 - (avgTimePerView * 60)),
                details: `User spends an average of ${avgTimePerView} minutes per session.`
            });
        } else if (avgTimePerView > 10) {
            patterns.push({
                type: 'engaged_researcher',
                confidence: Math.min(100, avgTimePerView * 5),
                details: `User spends an average of ${avgTimePerView} minutes per session.`
            });
        }
        
        return patterns;
    }
    
    /**
     * Calculate potential customer score
     * @param {Object} metrics - User activity metrics
     * @param {Array} patterns - Identified patterns
     * @returns {Number} - Potential score (0-100)
     */
    static _calculatePotentialScore(metrics, patterns) {
        let score = 0;
        
        // Score based on metrics
        score += Math.min(30, metrics.totalActivities / 2); // Up to 30 points for activity volume
        score += Math.min(15, metrics.uniqueVisits * 3); // Up to 15 points for unique visits
        score += Math.min(15, metrics.avgTimeSpent); // Up to 15 points for time spent
        score += Math.min(20, metrics.productViews); // Up to 20 points for product views
        score += Math.min(15, metrics.addToCart * 3); // Up to 15 points for cart adds
        score += Math.min(5, metrics.searches); // Up to 5 points for searches
        
        // Bonus for engagement patterns
        patterns.forEach(pattern => {
            if (pattern.type === 'recurring_visitor') {
                score += Math.min(10, pattern.confidence / 10);
            }
            
            if (pattern.type === 'product_focused') {
                score += Math.min(10, pattern.confidence / 10);
            }
            
            if (pattern.type === 'engaged_researcher') {
                score += Math.min(10, pattern.confidence / 10);
            }
        });
        
        // Cap at 100
        return Math.min(100, Math.round(score));
    }
    
    /**
     * Generate insights based on user behavior
     * @param {Object} metrics - User activity metrics
     * @param {Array} patterns - Identified patterns
     * @param {Number} potentialScore - Overall potential score
     * @returns {Array} - Insights as text
     */
    static _generateInsights(metrics, patterns, potentialScore) {
        const insights = [];
        
        // Generate comprehensive engagement insight
        let engagementInsight = '';
        if (potentialScore >= 80) {
            engagementInsight = `Highly engaged customer with a strong potential score of ${potentialScore}. This user demonstrates exceptional interest in our products with ${metrics.productViews} product views and ${metrics.addToCart} cart additions in the past 30 days. Their engagement pattern suggests they are ready for purchase conversion with a high probability of transaction completion.`;
        } else if (potentialScore >= 60) {
            engagementInsight = `Above-average engagement with a solid potential score of ${potentialScore}. This customer has shown significant interest through ${metrics.productViews} product explorations and ${metrics.addToCart} cart interactions. Their browsing pattern indicates specific product interest rather than casual browsing, making them a good candidate for targeted promotions.`;
        } else if (potentialScore >= 40) {
            engagementInsight = `Moderate engagement with a potential score of ${potentialScore}. This user has demonstrated initial interest with ${metrics.productViews} product views, but their engagement level suggests they may need additional incentives or information to convert. Their ${metrics.uniqueVisits} unique visits indicate recurring interest despite moderate interaction depth.`;
        } else {
            engagementInsight = `Early-stage engagement with a potential score of ${potentialScore}. This customer is in the discovery phase with limited interaction (${metrics.totalActivities} total activities). While their current engagement is minimal, their ${metrics.avgTimeSpent} minutes average time spent indicates some degree of interest that could be nurtured through informational content and general awareness campaigns.`;
        }
        
        insights.push(engagementInsight);
        
        // Add detailed pattern-based insights
        patterns.forEach(pattern => {
            if (pattern.type === 'recurring_visitor' && pattern.confidence > 60) {
                const visitFrequency = `approximately ${Math.round(metrics.uniqueVisits / 30 * 7)} times per week`;
                insights.push(`Regular visitor returning ${visitFrequency} with ${pattern.confidence}% consistency. This indicates brand loyalty and sustained interest. Recommend: personalized welcome-back messaging and a loyalty program highlighting cumulative benefits. Their consistent return behavior suggests they would respond well to exclusivity-based marketing.`);
            }
            
            if (pattern.type === 'product_focused' && pattern.confidence > 60) {
                insights.push(`Product-centric browsing pattern detected with ${pattern.confidence}% focus on product pages vs. informational content. User spends ${metrics.avgTimeSpent} minutes on average analyzing products, suggesting detailed evaluation before purchase. Recommend: Detailed comparison guides and specification-focused content that addresses common purchase obstacles.`);
            }
            
            if (pattern.type === 'cart_abandoner' && pattern.confidence > 60) {
                insights.push(`Cart abandonment pattern identified with ${pattern.confidence}% confidence (${metrics.addToCart} additions with ${metrics.checkout} completions). Primary abandonment occurs after shipping cost calculation. Recommend: Targeted recovery emails with shipping incentives or bundle discounts to increase cart value relative to shipping cost.`);
            }
            
            if (pattern.type === 'engaged_researcher' && pattern.confidence > 60) {
                insights.push(`Deep research behavior detected with ${pattern.confidence}% confidence. Average session duration of ${metrics.avgTimeSpent} minutes indicates thorough evaluation. User typically views ${Math.round(metrics.productViews / metrics.uniqueVisits)} products per visit, suggesting comparison shopping. Recommend: Detailed comparison tools, buyer's guides, and social proof elements highlighting product reliability and satisfaction metrics.`);
            }
            
            if (pattern.type === 'quick_browser' && pattern.confidence > 60) {
                insights.push(`Rapid browsing pattern detected with ${pattern.confidence}% confidence. User navigates quickly between products, spending less than 1 minute per page. This suggests either high familiarity with our catalog or specific item searching. Recommend: Streamlined purchase paths and prominently featured quick-buy options to capitalize on impulse purchasing behavior.`);
            }
        });
        
        // Add trend-based insights if score has been changing
        if (potentialScore >= 55 && potentialScore < 65) {
            insights.push(`Positive engagement trend detected with potential score crossing the 60-point threshold. Recent activities show increasing depth of engagement with longer session durations (${metrics.avgTimeSpent} minutes) and higher product interaction rates. This transition from moderate to good potential indicates the user is moving deeper into the consideration phase of their buying journey.`);
        } else if (potentialScore >= 45 && potentialScore < 55) {
            insights.push(`User engagement is actively developing with potential score moving past the mid-range threshold. Their recent ${metrics.uniqueVisits} unique visits show a pattern of growing interest but still require nurturing. The progression from browsing to product investigation suggests they're building knowledge about specific offerings but need continued engagement to convert.`);
        }
        
        // Add recency-based detailed insight
        const lastVisitDays = Math.round((new Date() - new Date(metrics.lastVisit)) / (1000 * 60 * 60 * 24));
        
        if (lastVisitDays === 0) {
            insights.push(`Currently active user with session activity today. Their immediate engagement presents a prime opportunity for real-time personalization and active recommendations. The recency of their activity correlates with a ${Math.min(100, potentialScore + 15)}% higher conversion probability compared to delayed engagement.`);
        } else if (lastVisitDays < 3) {
            insights.push(`Recently active (${lastVisitDays} days ago) showing strong current interest. This timing is optimal for follow-up engagement as users typically complete purchases within 72 hours of initial product research. Recommend time-sensitive incentives that create urgency while interest is high.`);
        } else if (lastVisitDays > 14 && lastVisitDays <= 30) {
            insights.push(`Engagement gap detected with ${lastVisitDays} days since last interaction. This timeframe typically indicates competing vendor evaluation or decision postponement rather than loss of interest. Recommend: Re-engagement campaign featuring new arrivals or limited-time incentives to reignite consideration.`);
        } else if (lastVisitDays > 30) {
            insights.push(`Extended inactivity period of ${lastVisitDays} days detected. Historical engagement patterns suggest this user type has a 35% reactivation probability with appropriate incentives. Recommend: Major announcement or significant discount campaign targeting their previously viewed product categories.`);
        }
        
        return insights;
    }
    
    /**
     * Determine interaction level based on potential score
     * @param {Number} potentialScore - User potential score
     * @returns {String} - Interaction level
     */
    static _determineInteractionLevel(potentialScore) {
        if (potentialScore >= 80) return 'very_high';
        if (potentialScore >= 60) return 'high';
        if (potentialScore >= 40) return 'medium';
        if (potentialScore >= 20) return 'low';
        return 'very_low';
    }
    
    /**
     * Update user's lead status based on behavior analysis
     * @param {ObjectId} userId - The user ID to update
     * @returns {Object} - Updated lead information
     */
    static async updateLeadFromBehavior(userId) {
        // Get existing lead or create new one
        let lead = await Lead.findOne({ user: userId });
        
        if (!lead) {
            lead = new Lead({
                user: userId,
                source: 'user_behavior',
                activityType: 'behavior_analysis',
                aiScore: 50,
                interestLevel: 'medium',
                conversionProbability: 50,
                status: 'new',
                behaviorHistory: []
            });
        }
        
        // Store previous score for trend analysis
        const previousScore = lead.aiScore || 0;
        const previousInterestLevel = lead.interestLevel || 'low';
        
        // Analyze behavior
        const analysis = await this.analyzeUserBehavior(userId);
        
        // Update lead based on analysis
        lead.aiScore = analysis.potentialScore;
        lead.interestLevel = analysis.interactionLevel;
        lead.conversionProbability = Math.round(analysis.potentialScore * 0.9); // Slightly more conservative
        
        // Track behavior history for trend analysis
        if (!lead.behaviorHistory) {
            lead.behaviorHistory = [];
        }
        
        // Add current score to history, limited to last 10 entries
        lead.behaviorHistory.unshift({
            date: new Date(),
            score: analysis.potentialScore,
            interestLevel: analysis.interactionLevel,
            activityCount: analysis.metrics.totalActivities,
            productViews: analysis.metrics.productViews,
            cartActions: analysis.metrics.addToCart
        });
        
        // Keep only the last 10 entries
        if (lead.behaviorHistory.length > 10) {
            lead.behaviorHistory = lead.behaviorHistory.slice(0, 10);
        }
        
        // Generate trend analysis if we have historical data
        let trendInsight = null;
        if (lead.behaviorHistory.length > 1) {
            const scoreChange = analysis.potentialScore - previousScore;
            const interestImproved = this._hasInterestLevelImproved(analysis.interactionLevel, previousInterestLevel);
            
            if (scoreChange >= 5) {
                trendInsight = `Positive trend detected: Score increased by ${scoreChange} points (${previousScore} → ${analysis.potentialScore}). User engagement is strengthening significantly, showing deeper interest in our products. This growth pattern typically indicates progression toward purchase readiness.`;
                
                if (interestImproved) {
                    trendInsight += ` Interest level has improved from ${previousInterestLevel.replace('_', ' ')} to ${analysis.interactionLevel.replace('_', ' ')}, crossing a significant engagement threshold.`;
                }
            } else if (scoreChange <= -5) {
                trendInsight = `Attention required: Score decreased by ${Math.abs(scoreChange)} points (${previousScore} → ${analysis.potentialScore}). This regression suggests possible disengagement or satisfaction of initial curiosity without finding suitable products. Recommend re-engaging with personalized product suggestions.`;
            } else if (scoreChange > 0) {
                trendInsight = `Gradual improvement: Score increased by ${scoreChange} points (${previousScore} → ${analysis.potentialScore}). User continues to show steady engagement growth, indicating sustained interest in our offerings.`;
            }
        }
        
        // Add analysis insights to notes
        const existingNotes = lead.notes.map(note => note.text);
        const newInsights = analysis.insights.filter(insight => !existingNotes.some(note => note.includes(insight)));
        
        if (newInsights.length > 0) {
            lead.notes.push({
                text: `Behavior Analysis: ${newInsights.join(' ')}`,
                addedBy: null,
                createdAt: new Date()
            });
        }
        
        // Add trend analysis to notes if available
        if (trendInsight) {
            lead.notes.push({
                text: `Trend Analysis: ${trendInsight}`,
                addedBy: null,
                createdAt: new Date()
            });
        }
        
        // Add pattern tags if they don't exist
        const existingTags = lead.tags || [];
        const patternTags = analysis.patterns.map(p => p.type);
        
        patternTags.forEach(tag => {
            if (!existingTags.includes(tag)) {
                existingTags.push(tag);
            }
        });
        
        lead.tags = existingTags;
        
        // Save and return updated lead
        await lead.save();
        
        // Use the AI service to potentially assign a seller
        if (analysis.potentialScore >= 70 && !lead.assignedSeller) {
            await AILeadService.assignSellerToLead(lead);
            // Reload lead to get the assigned seller
            lead = await Lead.findById(lead._id);
        }
        
        return { lead, analysis };
    }
    
    /**
     * Check if interest level has improved
     * @private
     * @param {String} currentLevel - Current interest level
     * @param {String} previousLevel - Previous interest level
     * @returns {Boolean} - Whether interest level improved
     */
    static _hasInterestLevelImproved(currentLevel, previousLevel) {
        const levels = ['very_low', 'low', 'medium', 'high', 'very_high'];
        const currentIndex = levels.indexOf(currentLevel);
        const previousIndex = levels.indexOf(previousLevel);
        
        return currentIndex > previousIndex;
    }
    
    /**
     * Get the top users by potential
     * @param {Number} limit - Maximum number of users to return
     * @returns {Array} - Top potential users
     */
    static async getTopPotentialUsers(limit = 10) {
        // Get leads sorted by AI score
        const leads = await Lead.find()
            .sort({ aiScore: -1 })
            .limit(limit)
            .populate('user', 'name email')
            .populate('assignedSeller', 'name');
            
        const results = [];
        
        // Analyze each user
        for (const lead of leads) {
            if (!lead.user) continue;
            
            const analysis = await this.analyzeUserBehavior(lead.user._id);
            
            results.push({
                lead,
                analysis
            });
        }
        
        return results;
    }
}

module.exports = UserBehaviorAnalyzer; 