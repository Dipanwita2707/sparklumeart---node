const mongoose = require('mongoose');
const UserActivity = require('../models/UserActivity');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Order = require('../models/Order');
const SellerPerformance = require('../models/SellerPerformance');
const PsychometricTest = require('../models/PsychometricTest');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const emailService = require('./emailService');

// Initialize Gemini AI with API key from environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * AI Lead Service - Handles lead scoring and seller performance analysis
 */
class AILeadService {
    /**
     * Score a lead using Gemini AI
     * @param {Object} lead - Lead object
     * @returns {Object} - Updated lead score and insights
     */
    static async scoreNewLead(lead) {
        try {
            // Get user information
            const user = await User.findById(lead.user);
            if (!user) return { score: 30, level: 'low' };

            // Get user's complete history
            const userHistory = await this._getUserHistory(user._id);
            
            // Prepare context for Gemini
            const context = this._prepareContextForAI(lead, user, userHistory);
            
            // Get AI analysis from Gemini
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(JSON.stringify(context));
            const response = await result.response;
            const aiAnalysis = JSON.parse(response.text());

            // Update lead with AI insights
            lead.aiScore = aiAnalysis.score;
            lead.interestLevel = aiAnalysis.interestLevel;
            lead.conversionProbability = aiAnalysis.conversionProbability;
            lead.aiInsights = aiAnalysis.insights;
            lead.recommendedActions = aiAnalysis.recommendedActions;

            // Add AI-generated tags
            lead.tags = [...(lead.tags || []), ...aiAnalysis.tags];

            // Send personalized email based on score
            if (lead.aiScore >= 50) {
                await emailService.sendPersonalizedEmail(lead._id);
            }

            return {
                score: aiAnalysis.score,
                interestLevel: aiAnalysis.interestLevel,
                conversionProbability: aiAnalysis.conversionProbability,
                insights: aiAnalysis.insights,
                recommendedActions: aiAnalysis.recommendedActions
            };
        } catch (error) {
            console.error('Error in AI lead scoring:', error);
            return { 
                score: 50, 
                interestLevel: 'medium', 
                conversionProbability: 50,
                insights: ['Error processing lead data'],
                recommendedActions: ['Review lead manually']
            };
        }
    }

    /**
     * Get comprehensive user history for AI analysis
     * @private
     */
    static async _getUserHistory(userId) {
        const [
            orders,
            tests,
            activities,
            previousLeads
        ] = await Promise.all([
            Order.find({ user: userId }).sort({ createdAt: -1 }),
            PsychometricTest.find({ user: userId }).sort({ createdAt: -1 }),
            UserActivity.find({ user: userId }).sort({ createdAt: -1 }),
            Lead.find({ user: userId }).sort({ createdAt: -1 })
        ]);

        return {
            orders,
            tests,
            activities,
            previousLeads
        };
    }

    /**
     * Prepare context for AI analysis
     * @private
     */
    static _prepareContextForAI(lead, user, history) {
        return {
            lead: {
                source: lead.source,
                activityType: lead.activityType,
                activityData: lead.activityData,
                createdAt: lead.createdAt
            },
            user: {
                name: user.name,
                email: user.email,
                createdAt: user.createdAt,
                isVerified: user.isVerified,
                lastLogin: user.lastLogin
            },
            history: {
                totalOrders: history.orders.length,
                totalSpent: history.orders.reduce((sum, order) => sum + order.totalAmount, 0),
                averageOrderValue: history.orders.length > 0 ? 
                    history.orders.reduce((sum, order) => sum + order.totalAmount, 0) / history.orders.length : 0,
                testCount: history.tests.length,
                activityCount: history.activities.length,
                previousLeadCount: history.previousLeads.length,
                previousLeadStatuses: history.previousLeads.map(l => l.status)
            }
        };
    }

    /**
     * Assign the most appropriate seller to a lead using AI
     * @param {Object} lead - The lead to assign
     * @returns {String} - ID of the assigned seller
     */
    static async assignSellerToLead(lead) {
        try {
            // Get all active sellers with their performance metrics
            const sellers = await User.find({ 
                role: 'seller', 
                isActive: true 
            });

            if (sellers.length === 0) return null;

            // Get detailed seller performance data
            const sellerData = await Promise.all(
                sellers.map(async (seller) => {
                    const performance = await SellerPerformance.findOne({
                        seller: seller._id,
                        period: 'monthly',
                        endDate: { $gte: new Date() }
                    }).sort({ endDate: -1 });

                    const activeLeads = await Lead.countDocuments({
                        assignedSeller: seller._id,
                        status: { $in: ['new', 'contacted', 'qualified', 'proposal'] }
                    });

                    return {
                        sellerId: seller._id,
                        name: seller.name,
                        performance: performance || { performanceScore: 50 },
                        activeLeads,
                        expertise: seller.expertise || [],
                        responseTime: performance?.metrics?.responseTime || 24
                    };
                })
            );

            // Prepare context for Gemini
            const context = {
                lead: {
                    aiScore: lead.aiScore,
                    interestLevel: lead.interestLevel,
                    source: lead.source,
                    activityType: lead.activityType
                },
                sellers: sellerData
            };

            // Get AI recommendation
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(JSON.stringify(context));
            const response = await result.response;
            const aiRecommendation = JSON.parse(response.text());

            // Find the recommended seller
            const recommendedSeller = sellerData.find(s => s.sellerId.toString() === aiRecommendation.recommendedSellerId);
            
            if (recommendedSeller) {
                // Add assignment note with AI reasoning
                lead.notes.push({
                    text: `AI Assignment: Assigned to ${recommendedSeller.name}. Reasoning: ${aiRecommendation.reasoning}`,
                    addedBy: null,
                    createdAt: new Date()
                });
            }

            return aiRecommendation.recommendedSellerId;
        } catch (error) {
            console.error('Error assigning seller to lead:', error);
            return null;
        }
    }

    /**
     * Generate AI insights for seller performance
     * @param {Object} performance - Seller performance object
     * @returns {Object} - Performance with AI insights
     */
    static async analyzeSellerPerformance(performance) {
        try {
            const context = {
                performance: {
                    metrics: performance.metrics,
                    period: performance.period,
                    startDate: performance.startDate,
                    endDate: performance.endDate
                }
            };

            // Get AI analysis from Gemini
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(JSON.stringify(context));
            const response = await result.response;
            const aiAnalysis = JSON.parse(response.text());

            // Update performance with AI insights
            performance.aiInsights = aiAnalysis.insights;
            performance.performanceScore = aiAnalysis.performanceScore;
            performance.strengths = aiAnalysis.strengths;
            performance.improvementAreas = aiAnalysis.improvementAreas;

            return performance;
        } catch (error) {
            console.error('Error in seller performance analysis:', error);
            return {
                performanceScore: 50,
                insights: ['Error processing performance data'],
                strengths: [],
                improvementAreas: ['Data analysis capabilities']
            };
        }
    }

    /**
     * Process lead scoring and trigger appropriate actions
     * @param {Object} lead - Lead object
     * @returns {Object} - Updated lead with actions taken
     */
    static async processLeadWithActions(lead) {
        try {
            // 1. Update engagement metrics
            await lead.updateEngagementMetrics();
            
            // 2. Update AI score if it's older than 3 days
            const daysSinceLastUpdate = (Date.now() - lead.aiLastUpdated) / (1000 * 60 * 60 * 24);
            if (daysSinceLastUpdate >= 3) {
                await this.scoreNewLead(lead);
                lead.aiLastUpdated = new Date();
            }
            
            // 3. Determine if assignable to seller
            if (!lead.assignedSeller && lead.aiScore >= 70) {
                const sellerId = await this.assignSellerToLead(lead);
                if (sellerId) {
                    lead.assignedSeller = sellerId;
                    lead.notes.push({
                        text: 'Automatically assigned to seller based on AI score',
                        type: 'ai_insight',
                        addedBy: null
                    });
                }
            }
            
            // 4. Check if eligible for automated email
            if (lead.qualifiesForEmail()) {
                await emailService.sendPersonalizedEmail(lead._id);
                lead.notes.push({
                    text: 'Sent automated personalized email',
                    type: 'ai_insight',
                    addedBy: null
                });
            }
            
            // 5. Set follow-up reminder if needed
            if (lead.status === 'contacted' && !lead.nextFollowUp) {
                // Set default follow-up for 3 days after contact
                lead.nextFollowUp = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                lead.followUpReminder.enabled = true;
                lead.notes.push({
                    text: 'Automatic follow-up scheduled',
                    type: 'follow_up',
                    addedBy: null
                });
            }
            
            await lead.save();
            return lead;
        } catch (error) {
            console.error('Error processing lead:', error);
            return lead;
        }
    }

    /**
     * Recalculate priority scores for all active leads
     * @returns {Number} - Count of updated leads
     */
    static async recalculateAllPriorityScores() {
        try {
            const activeLeads = await Lead.find({ isActive: true });
            let updatedCount = 0;
            
            for (const lead of activeLeads) {
                // Store the old score for comparison
                const oldScore = lead.priorityScore;
                
                // Recalculate score
                lead.calculatePriorityScore();
                
                // If score changed by more than 5 points, add a note
                if (Math.abs(oldScore - lead.priorityScore) >= 5) {
                    const direction = lead.priorityScore > oldScore ? 'increased' : 'decreased';
                    lead.notes.push({
                        text: `Priority score ${direction} from ${oldScore} to ${lead.priorityScore}`,
                        type: 'ai_insight',
                        addedBy: null
                    });
                }
                
                await lead.save();
                updatedCount++;
            }
            
            return updatedCount;
        } catch (error) {
            console.error('Error recalculating priority scores:', error);
            return 0;
        }
    }

    /**
     * Get leads requiring follow-up
     * @returns {Array} - Leads requiring follow-up today
     */
    static async getLeadsNeedingFollowUp() {
        try {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            
            // Find leads with follow-up date between today and tomorrow
            // that haven't been marked as followed up
            const leadsForFollowUp = await Lead.find({
                nextFollowUp: { $gte: today, $lt: tomorrow },
                followUpReminder: { enabled: true, reminderSent: false },
                status: { $nin: ['converted', 'lost'] }
            }).populate('assignedSeller', 'name email');
            
            return leadsForFollowUp;
        } catch (error) {
            console.error('Error getting leads needing follow-up:', error);
            return [];
        }
    }

    /**
     * Mark follow-up reminders as sent
     * @param {Array} leadIds - Array of lead IDs
     * @returns {Number} - Count of updated leads
     */
    static async markFollowUpRemindersSent(leadIds) {
        try {
            const result = await Lead.updateMany(
                { _id: { $in: leadIds } },
                { 'followUpReminder.reminderSent': true }
            );
            
            return result.nModified;
        } catch (error) {
            console.error('Error marking follow-up reminders as sent:', error);
            return 0;
        }
    }

    /**
     * Identify leads with stale status
     * @param {Number} daysThreshold - Days threshold for stale leads
     * @returns {Array} - Stale leads
     */
    static async identifyStaleLeads(daysThreshold = 14) {
        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
            
            // Find leads where:
            // 1. Status is not converted or lost
            // 2. Last contact was more than X days ago OR never contacted
            // 3. No activity in the last X days
            const staleLeads = await Lead.find({
                status: { $nin: ['converted', 'lost'] },
                $or: [
                    { lastContact: { $lt: thresholdDate } },
                    { lastContact: null }
                ],
                'engagementMetrics.lastInteraction': { $lt: thresholdDate }
            }).populate('assignedSeller', 'name email')
              .populate('user', 'name email');
            
            return staleLeads;
        } catch (error) {
            console.error('Error identifying stale leads:', error);
            return [];
        }
    }

    /**
     * Generate consolidated AI insights summary for leads
     * Send single, detailed customized email
     * @returns {Number} - Count of processed leads
     */
    static async generateConsolidatedInsights() {
        try {
            // Find leads that have been updated in the last hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentlyUpdatedLeads = await Lead.find({
                $or: [
                    { updatedAt: { $gte: oneHourAgo } },
                    { 'engagementMetrics.lastInteraction': { $gte: oneHourAgo } }
                ]
            })
            .populate('user')
            .populate('assignedSeller');
            
            if (recentlyUpdatedLeads.length === 0) {
                return 0;
            }
            
            console.log(`Generating consolidated insights for ${recentlyUpdatedLeads.length} leads`);
            
            // Group leads by assigned seller
            const leadsByAssignedSeller = {};
            const unassignedLeads = [];
            
            recentlyUpdatedLeads.forEach(lead => {
                if (lead.assignedSeller) {
                    const sellerId = lead.assignedSeller._id.toString();
                    if (!leadsByAssignedSeller[sellerId]) {
                        leadsByAssignedSeller[sellerId] = {
                            seller: lead.assignedSeller,
                            leads: []
                        };
                    }
                    leadsByAssignedSeller[sellerId].leads.push(lead);
                } else {
                    unassignedLeads.push(lead);
                }
            });
            
            // Prepare AI insights for each seller's leads
            for (const sellerId in leadsByAssignedSeller) {
                const { seller, leads } = leadsByAssignedSeller[sellerId];
                
                // Generate detailed analysis for this batch of leads
                const batchInsights = await this._generateBatchInsights(leads);
                
                // Send consolidated email to seller
                await emailService.sendConsolidatedInsightsEmail(
                    seller.email,
                    {
                        sellerName: seller.name,
                        insights: batchInsights,
                        leads: leads.map(lead => ({
                            id: lead._id,
                            name: lead.user ? lead.user.name : 'Unknown',
                            email: lead.user ? lead.user.email : 'Unknown',
                            score: lead.aiScore,
                            priority: lead.priorityScore,
                            status: lead.status,
                            lastActivity: lead.engagementMetrics?.lastInteraction || lead.updatedAt,
                            nextFollowUp: lead.nextFollowUp,
                            recommendedAction: this._getTopRecommendation(lead)
                        }))
                    }
                );
            }
            
            // Send unassigned leads to admins
            if (unassignedLeads.length > 0) {
                const batchInsights = await this._generateBatchInsights(unassignedLeads);
                const admins = await User.find({ role: 'admin' });
                
                for (const admin of admins) {
                    await emailService.sendConsolidatedInsightsEmail(
                        admin.email,
                        {
                            sellerName: admin.name,
                            insights: batchInsights,
                            leads: unassignedLeads.map(lead => ({
                                id: lead._id,
                                name: lead.user ? lead.user.name : 'Unknown',
                                email: lead.user ? lead.user.email : 'Unknown',
                                score: lead.aiScore,
                                priority: lead.priorityScore,
                                status: lead.status,
                                lastActivity: lead.engagementMetrics?.lastInteraction || lead.updatedAt,
                                nextFollowUp: lead.nextFollowUp,
                                recommendedAction: this._getTopRecommendation(lead)
                            })),
                            isAdmin: true
                        }
                    );
                }
            }
            
            return recentlyUpdatedLeads.length;
        } catch (error) {
            console.error('Error generating consolidated insights:', error);
            return 0;
        }
    }
    
    /**
     * Generate batch insights using AI analysis
     * @private
     * @param {Array} leads - Array of lead objects
     * @returns {Object} - Batch insights
     */
    static async _generateBatchInsights(leads) {
        try {
            // Create context with aggregated lead data
            const context = {
                leadsCount: leads.length,
                leadsByStatus: {},
                leadsByInterestLevel: {},
                leadsBySource: {},
                highPriorityLeads: leads.filter(l => l.priorityScore >= 70).length,
                averageScore: leads.reduce((sum, l) => sum + l.aiScore, 0) / leads.length,
                recentBehaviors: []
            };
            
            // Aggregate status counts
            leads.forEach(lead => {
                // Count by status
                if (!context.leadsByStatus[lead.status]) {
                    context.leadsByStatus[lead.status] = 0;
                }
                context.leadsByStatus[lead.status]++;
                
                // Count by interest level
                if (!context.leadsByInterestLevel[lead.interestLevel]) {
                    context.leadsByInterestLevel[lead.interestLevel] = 0;
                }
                context.leadsByInterestLevel[lead.interestLevel]++;
                
                // Count by source
                if (!context.leadsBySource[lead.source]) {
                    context.leadsBySource[lead.source] = 0;
                }
                context.leadsBySource[lead.source]++;
                
                // Collect recent behaviors
                if (lead.engagementMetrics?.lastPageVisited) {
                    context.recentBehaviors.push({
                        leadId: lead._id,
                        leadName: lead.user ? lead.user.name : 'Unknown',
                        behavior: 'page_visit',
                        path: lead.engagementMetrics.lastPageVisited.path,
                        timestamp: lead.engagementMetrics.lastPageVisited.timestamp
                    });
                }
                
                if (lead.engagementMetrics?.cartInteractions > 0) {
                    context.recentBehaviors.push({
                        leadId: lead._id,
                        leadName: lead.user ? lead.user.name : 'Unknown',
                        behavior: 'cart_interaction',
                        count: lead.engagementMetrics.cartInteractions
                    });
                }
            });
            
            // Get AI analysis from Gemini
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            const result = await model.generateContent(JSON.stringify({
                task: "Generate consolidated AI insights",
                context
            }));
            const response = await result.response;
            const aiAnalysis = JSON.parse(response.text());
            
            return {
                summary: aiAnalysis.summary,
                keyFindings: aiAnalysis.keyFindings || [],
                trends: aiAnalysis.trends || [],
                recommendations: aiAnalysis.recommendations || [],
                opportunityScore: aiAnalysis.opportunityScore || 50
            };
        } catch (error) {
            console.error('Error generating batch insights:', error);
            return {
                summary: "Error generating consolidated insights. Please check individual lead details.",
                keyFindings: [],
                trends: [],
                recommendations: [
                    "Review leads individually due to error in batch processing",
                    "Check system logs for more details on the error"
                ],
                opportunityScore: 50
            };
        }
    }
    
    /**
     * Get the top recommendation for a lead
     * @private
     * @param {Object} lead - Lead object
     * @returns {String} - Top recommendation
     */
    static _getTopRecommendation(lead) {
        // Default recommendation based on lead status
        if (!lead.assignedSeller && lead.priorityScore >= 70) {
            return "Assign to seller immediately";
        }
        
        if (lead.status === 'new' && lead.aiScore >= 60) {
            return "Make initial contact";
        }
        
        if (lead.status === 'contacted' && !lead.nextFollowUp) {
            return "Schedule follow-up";
        }
        
        if (lead.engagementMetrics && 
            lead.engagementMetrics.cartInteractions > 0 && 
            lead.status !== 'converted') {
            return "Offer purchase incentive";
        }
        
        if (lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date()) {
            return "Follow-up overdue";
        }
        
        // Based on recent activity
        if (lead.engagementMetrics?.lastInteraction) {
            const hoursSinceLastActivity = 
                (Date.now() - new Date(lead.engagementMetrics.lastInteraction)) / (1000 * 60 * 60);
                
            if (hoursSinceLastActivity < 1) {
                return "Recent activity - engage now";
            }
        }
        
        return "Monitor for further activity";
    }
}

module.exports = AILeadService; 