const EmailCampaign = require('../models/EmailCampaign');
const Lead = require('../models/Lead');
const User = require('../models/User');
const automatedEmailService = require('../services/automatedEmailService');
const { validationResult } = require('express-validator');

/**
 * Email Campaign Controller - Handles all email campaign related operations
 */
class EmailCampaignController {
    /**
     * Get all email campaigns for display in the admin dashboard
     */
    static async getAllCampaigns(req, res) {
        try {
            // Get all campaigns sorted by creation date (newest first)
            const campaigns = await EmailCampaign.find({})
                .sort({ createdAt: -1 })
                .populate('sentBy', 'name email');
            
            // Count campaigns by status
            const totalCampaigns = campaigns.length;
            const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
            const scheduledCampaigns = campaigns.filter(c => c.status === 'scheduled').length;
            const draftCampaigns = campaigns.filter(c => c.status === 'draft').length;
            
            // Calculate total conversions
            const totalConversions = campaigns.reduce((sum, campaign) => {
                return sum + (campaign.metrics?.conversions || 0);
            }, 0);
            
            // Return campaigns and summary statistics
            return res.render('admin/email-campaigns/index', {
                campaigns,
                stats: {
                    totalCampaigns,
                    activeCampaigns,
                    scheduledCampaigns,
                    draftCampaigns,
                    totalConversions
                },
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            });
        } catch (error) {
            console.error('Error fetching email campaigns:', error);
            req.flash('error_msg', 'Failed to load email campaigns');
            return res.redirect('/admin/dashboard');
        }
    }
    
    /**
     * Get campaign details by ID
     */
    static async getCampaignDetails(req, res) {
        try {
            const campaignId = req.params.id;
            
            // Fetch campaign with populated sender details and recipient info
            const campaign = await EmailCampaign.findById(campaignId)
                .populate('sentBy', 'name email')
                .populate('recipients.lead', 'user email preferences');
                
            if (!campaign) {
                req.flash('error_msg', 'Campaign not found');
                return res.redirect('/admin/email-campaigns');
            }
            
            // Calculate key metrics
            const deliveryRate = campaign.totalLeads > 0 ? 
                ((campaign.totalLeads - campaign.metrics.bounces) / campaign.totalLeads * 100) : 0;
                
            const openRate = (campaign.totalLeads - campaign.metrics.bounces) > 0 ? 
                (campaign.metrics.uniqueOpens / (campaign.totalLeads - campaign.metrics.bounces) * 100) : 0;
                
            const clickRate = campaign.metrics.uniqueOpens > 0 ? 
                (campaign.metrics.uniqueClicks / campaign.metrics.uniqueOpens * 100) : 0;
                
            const conversionRate = campaign.metrics.uniqueClicks > 0 ? 
                (campaign.metrics.conversions / campaign.metrics.uniqueClicks * 100) : 0;
            
            // Get additional user data for recipients
            const recipientsWithUserData = await Promise.all(
                campaign.recipients.map(async (recipient) => {
                    if (recipient.lead && recipient.lead.user) {
                        const userData = await User.findById(recipient.lead.user, 'name email lastLogin');
                        return {
                            ...recipient.toObject(),
                            userData: userData || { name: 'Unknown', email: recipient.email || 'No email' }
                        };
                    }
                    return recipient;
                })
            );
            
            // Return the campaign details with calculated metrics
            return res.render('admin/email-campaigns/details', {
                campaign,
                metrics: {
                    deliveryRate,
                    openRate,
                    clickRate,
                    conversionRate
                },
                recipients: recipientsWithUserData,
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            });
        } catch (error) {
            console.error('Error fetching campaign details:', error);
            req.flash('error_msg', 'Failed to load campaign details');
            return res.redirect('/admin/email-campaigns');
        }
    }
    
    /**
     * Render form for creating a new campaign
     */
    static async getNewCampaignForm(req, res) {
        try {
            // Get targeting options with counts for different lead segments
            const [totalLeads, highPotentialCount, cartAbandoners, recentlyActive] = await Promise.all([
                Lead.countDocuments({ 'preferences.emailEnabled': true }),
                Lead.countDocuments({ 'preferences.emailEnabled': true, aiScore: { $gte: 70 } }),
                Lead.countDocuments({ 
                    'preferences.emailEnabled': true, 
                    'patternTags': { $in: ['cart_abandoner'] } 
                }),
                Lead.countDocuments({ 
                    'preferences.emailEnabled': true, 
                    lastActivity: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                })
            ]);
            
            return res.render('admin/email-campaigns/new', {
                targetingOptions: {
                    totalLeads,
                    highPotentialCount,
                    cartAbandoners,
                    recentlyActive
                },
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            });
        } catch (error) {
            console.error('Error preparing new campaign form:', error);
            req.flash('error_msg', 'Failed to load campaign creation form');
            return res.redirect('/admin/email-campaigns');
        }
    }
    
    /**
     * Create a new email campaign
     */
    static async createCampaign(req, res) {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error_msg', 'Please correct all errors in the form');
            return res.redirect('/admin/email-campaigns/new');
        }
        
        try {
            const { name, subject, content, targetCriteria, scheduledDate } = req.body;
            
            // Find leads based on targeting criteria
            let targetLeadsQuery = { 'preferences.emailEnabled': true };
            
            switch (targetCriteria) {
                case 'high_potential':
                    targetLeadsQuery.aiScore = { $gte: 70 };
                    break;
                case 'cart_abandoners':
                    targetLeadsQuery.patternTags = { $in: ['cart_abandoner'] };
                    break;
                case 'recently_active':
                    targetLeadsQuery.lastActivity = { 
                        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
                    };
                    break;
                // 'all' case uses the default query with just email preferences
            }
            
            // Fetch the target leads
            const targetLeads = await Lead.find(targetLeadsQuery)
                .populate('user', 'email name');
                
            if (targetLeads.length === 0) {
                req.flash('error_msg', 'No leads match the selected criteria');
                return res.redirect('/admin/email-campaigns/new');
            }
            
            // Prepare recipients list
            const recipients = targetLeads.map(lead => ({
                lead: lead._id,
                email: lead.user ? lead.user.email : null,
                status: 'pending'
            }));
            
            // Create the campaign
            const newCampaign = new EmailCampaign({
                name,
                subject,
                content,
                targetCriteria,
                totalLeads: recipients.length,
                status: scheduledDate ? 'scheduled' : 'draft',
                sentBy: req.user._id,
                scheduledDate: scheduledDate || null,
                recipients
            });
            
            await newCampaign.save();
            
            // If scheduled, register with automated email service
            if (scheduledDate) {
                automatedEmailService.scheduleCampaign(newCampaign._id, new Date(scheduledDate));
                req.flash('success_msg', 'Campaign scheduled successfully');
            } else {
                req.flash('success_msg', 'Campaign saved as draft');
            }
            
            return res.redirect('/admin/email-campaigns');
        } catch (error) {
            console.error('Error creating campaign:', error);
            req.flash('error_msg', `Failed to create campaign: ${error.message}`);
            return res.redirect('/admin/email-campaigns/new');
        }
    }
    
    /**
     * Send a campaign immediately or on schedule
     */
    static async sendCampaign(req, res) {
        try {
            const campaignId = req.params.id;
            const campaign = await EmailCampaign.findById(campaignId);
            
            if (!campaign) {
                req.flash('error_msg', 'Campaign not found');
                return res.redirect('/admin/email-campaigns');
            }
            
            if (campaign.status === 'completed' || campaign.status === 'active') {
                req.flash('error_msg', 'Campaign has already been sent');
                return res.redirect(`/admin/email-campaigns/${campaignId}`);
            }
            
            // Update campaign status
            campaign.status = 'active';
            campaign.sentDate = new Date();
            await campaign.save();
            
            // Process the campaign
            await automatedEmailService.processCampaign(campaignId);
            
            req.flash('success_msg', 'Campaign is being sent');
            return res.redirect(`/admin/email-campaigns/${campaignId}`);
        } catch (error) {
            console.error('Error sending campaign:', error);
            req.flash('error_msg', `Failed to send campaign: ${error.message}`);
            return res.redirect(`/admin/email-campaigns/${req.params.id}`);
        }
    }
    
    /**
     * Cancel a scheduled campaign
     */
    static async cancelCampaign(req, res) {
        try {
            const campaignId = req.params.id;
            const campaign = await EmailCampaign.findById(campaignId);
            
            if (!campaign) {
                req.flash('error_msg', 'Campaign not found');
                return res.redirect('/admin/email-campaigns');
            }
            
            if (campaign.status !== 'scheduled') {
                req.flash('error_msg', 'Only scheduled campaigns can be canceled');
                return res.redirect(`/admin/email-campaigns/${campaignId}`);
            }
            
            // Update campaign status
            campaign.status = 'draft';
            campaign.scheduledDate = null;
            await campaign.save();
            
            // Cancel the scheduled job
            automatedEmailService.cancelScheduledCampaign(campaignId);
            
            req.flash('success_msg', 'Campaign has been canceled and saved as draft');
            return res.redirect(`/admin/email-campaigns/${campaignId}`);
        } catch (error) {
            console.error('Error canceling campaign:', error);
            req.flash('error_msg', `Failed to cancel campaign: ${error.message}`);
            return res.redirect(`/admin/email-campaigns/${req.params.id}`);
        }
    }
    
    /**
     * Get performance dashboard data
     */
    static async getDashboard(req, res) {
        try {
            // Get all completed campaigns
            const campaigns = await EmailCampaign.find({ status: { $in: ['completed', 'active'] } })
                .sort({ sentDate: -1 })
                .limit(50);
                
            if (campaigns.length === 0) {
                req.flash('info_msg', 'No campaign data available yet. Create and send your first campaign.');
                return res.redirect('/admin/email-campaigns');
            }
            
            // Get recent campaigns for the table (last 5)
            const recentCampaigns = campaigns.slice(0, 5);
            
            // Get top performing campaigns by open rate
            const topCampaigns = [...campaigns]
                .filter(c => c.metrics && c.metrics.openRate > 0)
                .sort((a, b) => b.metrics.openRate - a.metrics.openRate)
                .slice(0, 5);
                
            // Calculate aggregate metrics
            const totalSent = campaigns.reduce((sum, c) => sum + c.totalLeads, 0);
            const totalOpens = campaigns.reduce((sum, c) => sum + (c.metrics?.opens || 0), 0);
            const totalClicks = campaigns.reduce((sum, c) => sum + (c.metrics?.clicks || 0), 0);
            const totalConversions = campaigns.reduce((sum, c) => sum + (c.metrics?.conversions || 0), 0);
            
            // Calculate rates
            const avgOpenRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : 0;
            const avgClickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;
            const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
            
            // Prepare chart data - last 10 campaigns in chronological order
            const chronoCampaigns = [...campaigns].reverse().slice(0, 10);
            
            const performanceData = {
                labels: chronoCampaigns.map(c => c.name),
                openRates: chronoCampaigns.map(c => c.metrics?.openRate || 0),
                clickRates: chronoCampaigns.map(c => c.metrics?.clickRate || 0),
                conversionRates: chronoCampaigns.map(c => c.metrics?.conversions / c.metrics?.uniqueClicks * 100 || 0)
            };
            
            // Campaign performance breakdown data for pie chart
            // Categories: high performing (>40% open), good (20-40%), average (10-20%), needs improvement (<10%)
            const highPerforming = campaigns.filter(c => c.metrics?.openRate >= 40).length;
            const good = campaigns.filter(c => c.metrics?.openRate >= 20 && c.metrics?.openRate < 40).length;
            const average = campaigns.filter(c => c.metrics?.openRate >= 10 && c.metrics?.openRate < 20).length;
            const needsImprovement = campaigns.filter(c => c.metrics?.openRate < 10).length;
            
            const breakdownData = [highPerforming, good, average, needsImprovement];
            
            // Get insights data based on campaign types
            const typesMap = {};
            campaigns.forEach(campaign => {
                if (!typesMap[campaign.targetCriteria]) {
                    typesMap[campaign.targetCriteria] = { 
                        count: 0, 
                        opens: 0, 
                        clicks: 0, 
                        conversions: 0,
                        totalSent: 0
                    };
                }
                
                const type = typesMap[campaign.targetCriteria];
                type.count++;
                type.opens += campaign.metrics?.opens || 0;
                type.clicks += campaign.metrics?.clicks || 0;
                type.conversions += campaign.metrics?.conversions || 0;
                type.totalSent += campaign.totalLeads;
            });
            
            const insightsData = {
                labels: Object.keys(typesMap).map(key => {
                    switch(key) {
                        case 'high_potential': return 'High Potential';
                        case 'cart_abandoners': return 'Cart Abandoners';
                        case 'recently_active': return 'Recently Active';
                        case 'all': return 'All Leads';
                        default: return key;
                    }
                }),
                data: Object.values(typesMap).map(type => type.totalSent > 0 ? (type.opens / type.totalSent) * 100 : 0)
            };
            
            // Generate text insights based on the data
            const insights = [];
            const recommendations = [];
            
            // Sample insights based on data analysis
            if (avgOpenRate > 25) {
                insights.push('Your email open rates are above industry average (25%)');
            } else {
                insights.push('Your email open rates are below industry average (25%)');
                recommendations.push('Try more compelling subject lines to improve open rates');
            }
            
            // Get best performing audience
            const bestAudience = Object.entries(typesMap)
                .sort((a, b) => {
                    const aRate = a[1].totalSent > 0 ? (a[1].opens / a[1].totalSent) * 100 : 0;
                    const bRate = b[1].totalSent > 0 ? (b[1].opens / b[1].totalSent) * 100 : 0;
                    return bRate - aRate;
                })[0];
                
            if (bestAudience) {
                const audienceName = (() => {
                    switch(bestAudience[0]) {
                        case 'high_potential': return 'High Potential';
                        case 'cart_abandoners': return 'Cart Abandoners';
                        case 'recently_active': return 'Recently Active';
                        case 'all': return 'All Leads';
                        default: return bestAudience[0];
                    }
                })();
                
                insights.push(`${audienceName} leads have the highest engagement rate`);
                recommendations.push(`Focus more campaigns on ${audienceName.toLowerCase()} segment`);
            }
            
            // Conversion insights
            if (conversionRate < 2) {
                insights.push('Email-to-conversion rate is relatively low');
                recommendations.push('Add stronger calls-to-action in your email content');
            } else {
                insights.push('Your email campaigns are effectively driving conversions');
            }
            
            // Click rate insights
            if (avgClickRate < 10) {
                recommendations.push('Improve email content to increase click-through rates');
            }
            
            // Add time-based recommendations
            recommendations.push('Test sending emails at different times of day to optimize engagement');
            
            // Render the dashboard with all the data
            return res.render('admin/email-campaigns/dashboard', {
                metrics: {
                    totalSent,
                    avgOpenRate,
                    avgClickRate,
                    conversionRate,
                    // Placeholder metrics for comparison with previous period
                    sentIncrease: 12,
                    openRateChange: 5.2,
                    clickRateChange: 3.1,
                    conversionRateChange: -1.5
                },
                recentCampaigns,
                topCampaigns,
                performanceData,
                breakdownData,
                insightsData,
                insights,
                recommendations,
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg'),
                info_msg: req.flash('info_msg')
            });
        } catch (error) {
            console.error('Error loading campaign dashboard:', error);
            req.flash('error_msg', `Failed to load dashboard: ${error.message}`);
            return res.redirect('/admin/email-campaigns');
        }
    }
}

module.exports = EmailCampaignController; 