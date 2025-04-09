const nodemailer = require('nodemailer');
const Lead = require('../models/Lead');
const User = require('../models/User');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }

    /**
     * Send an email using the configured transporter
     * @param {Object} options - Email options (to, subject, html, text)
     * @returns {Promise<Object>} - Nodemailer send result
     */
    async sendEmail(options) {
        try {
            const result = await this.transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text
            });
            return result;
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    /**
     * Send personalized email to lead based on their score and interests
     */
    async sendPersonalizedEmail(leadId) {
        try {
            const lead = await Lead.findById(leadId).populate('user');
            if (!lead || !lead.user) return false;

            const user = lead.user;
            const template = this._getEmailTemplate(lead);
            
            // Create tracking pixel URL
            const trackingPixelUrl = `${process.env.BASE_URL}/api/track-email/${lead._id}/open`;
            
            // Create email content with tracking
            const emailContent = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: template.subject,
                html: `
                    ${template.content}
                    <img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none" />
                `,
                text: template.textContent
            };

            // Send email
            await this.transporter.sendMail(emailContent);

            // Update lead's email tracking
            lead.emailTracking.lastSent = new Date();
            lead.emailTracking.sentCount += 1;
            await lead.save();

            return true;
        } catch (error) {
            console.error('Error sending personalized email:', error);
            return false;
        }
    }

    /**
     * Send custom email for campaigns
     * @param {string} to - Recipient email address
     * @param {Object} data - Email data including subject, content, and tracking options
     */
    async sendCustomEmail(to, data) {
        try {
            const { subject, content, trackingEnabled, leadId, campaignId } = data;
            
            let htmlContent = content;
            
            // Add tracking pixel if tracking is enabled
            if (trackingEnabled && leadId) {
                const trackingParams = campaignId ? `${leadId}/open?cid=${campaignId}` : `${leadId}/open`;
                const trackingPixelUrl = `${process.env.BASE_URL}/api/track-email/${trackingParams}`;
                htmlContent += `<img src="${trackingPixelUrl}" alt="" width="1" height="1" style="display:none" />`;
                
                // Add tracking to all links
                htmlContent = this._addLinkTracking(htmlContent, leadId, campaignId);
            }
            
            // Create email content
            const emailContent = {
                from: process.env.EMAIL_USER,
                to,
                subject,
                html: htmlContent,
                text: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
            };
            
            // Send email
            await this.transporter.sendMail(emailContent);
            
            // Update lead's email tracking if a lead ID was provided
            if (leadId) {
                await Lead.findByIdAndUpdate(leadId, {
                    $set: {
                        'emailTracking.lastSent': new Date()
                    },
                    $inc: {
                        'emailTracking.sentCount': 1
                    }
                });
            }
            
            return true;
        } catch (error) {
            console.error('Error sending custom email:', error);
            return false;
        }
    }

    /**
     * Add tracking to all links in the email content
     * @private
     */
    _addLinkTracking(htmlContent, leadId, campaignId) {
        // Regular expression to find all links
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi;
        
        // Replace each link with a tracking link
        return htmlContent.replace(linkRegex, (match, url) => {
            const trackingParams = campaignId 
                ? `${leadId}/click?link=${encodeURIComponent(url)}&cid=${campaignId}` 
                : `${leadId}/click?link=${encodeURIComponent(url)}`;
            const trackingUrl = `${process.env.BASE_URL}/api/track-email/${trackingParams}`;
            return `<a href="${trackingUrl}"`;
        });
    }

    /**
     * Get personalized email template based on lead score and interests
     */
    _getEmailTemplate(lead) {
        const templates = {
            high: {
                subject: 'Exclusive Art Collection Just for You!',
                content: `
                    <h2>Dear ${lead.user.name},</h2>
                    <p>Based on your interest in our art collection, we've curated some exclusive pieces we think you'll love!</p>
                    <p>Here are some personalized recommendations:</p>
                    <ul>
                        ${lead.recommendedActions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                    <p>Would you like to explore these pieces?</p>
                    <a href="${process.env.BASE_URL}/gallery?lead=${lead._id}">View Your Personalized Collection</a>
                `,
                textContent: `Dear ${lead.user.name},\n\nBased on your interest in our art collection, we've curated some exclusive pieces we think you'll love!`
            },
            medium: {
                subject: 'Discover Your Perfect Art Piece',
                content: `
                    <h2>Hi ${lead.user.name},</h2>
                    <p>We noticed you're interested in art, and we'd love to help you find the perfect piece!</p>
                    <p>Here are some suggestions to get started:</p>
                    <ul>
                        ${lead.recommendedActions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                    <p>Ready to explore?</p>
                    <a href="${process.env.BASE_URL}/gallery?lead=${lead._id}">Browse Our Collection</a>
                `,
                textContent: `Hi ${lead.user.name},\n\nWe noticed you're interested in art, and we'd love to help you find the perfect piece!`
            },
            low: {
                subject: 'Welcome to Our Art Gallery!',
                content: `
                    <h2>Hello ${lead.user.name},</h2>
                    <p>Thank you for your interest in our art gallery!</p>
                    <p>We'd love to help you discover beautiful pieces that match your style.</p>
                    <p>Here's a special offer to get you started:</p>
                    <a href="${process.env.BASE_URL}/gallery?lead=${lead._id}">Explore Our Gallery</a>
                `,
                textContent: `Hello ${lead.user.name},\n\nThank you for your interest in our art gallery!`
            }
        };

        // Select template based on lead score
        if (lead.aiScore >= 80) return templates.high;
        if (lead.aiScore >= 50) return templates.medium;
        return templates.low;
    }

    /**
     * Track email open
     */
    async trackEmailOpen(leadId, ip, userAgent) {
        try {
            await Lead.findByIdAndUpdate(leadId, {
                $push: {
                    'emailTracking.opens': {
                        timestamp: new Date(),
                        ip,
                        userAgent
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Error tracking email open:', error);
            return false;
        }
    }

    /**
     * Track link click
     */
    async trackLinkClick(leadId, link, ip, userAgent) {
        try {
            await Lead.findByIdAndUpdate(leadId, {
                $push: {
                    'emailTracking.clicks': {
                        timestamp: new Date(),
                        link,
                        ip,
                        userAgent
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Error tracking link click:', error);
            return false;
        }
    }

    /**
     * Send consolidated AI insights email
     * @param {String} recipientEmail - Email address
     * @param {Object} data - Email data including insights and leads
     * @returns {Boolean} - Success status
     */
    async sendConsolidatedInsightsEmail(recipientEmail, data) {
        try {
            const { sellerName, insights, leads, isAdmin = false } = data;
            
            // Generate a subject line based on insights
            const subject = isAdmin
                ? `AI Lead Insights Summary: ${insights.opportunityScore}% Opportunity Score (${leads.length} Unassigned Leads)`
                : `Your Lead Insights: ${insights.opportunityScore}% Opportunity Score (${leads.length} Leads)`;
            
            // Create a customized HTML template
            const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Lead Insights Summary</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4a69bd; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                    .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
                    .summary { margin-bottom: 20px; padding: 15px; background-color: white; border-left: 4px solid #4a69bd; }
                    .lead-card { background-color: white; padding: 15px; margin-bottom: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .lead-header { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
                    .score { display: inline-block; padding: 5px 10px; border-radius: 15px; font-weight: bold; color: white; background-color: #4a69bd; }
                    .priority-high { background-color: #6ab04c; }
                    .priority-medium { background-color: #f0932b; }
                    .priority-low { background-color: #eb4d4b; }
                    .status { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; color: white; }
                    .status-new { background-color: #7f8c8d; }
                    .status-contacted { background-color: #3498db; }
                    .status-qualified { background-color: #2ecc71; }
                    .status-proposal { background-color: #f1c40f; }
                    .status-converted { background-color: #27ae60; }
                    .status-lost { background-color: #e74c3c; }
                    .recommendation { background-color: #f1f5f9; padding: 10px; border-radius: 5px; margin-top: 10px; }
                    .insights-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .insights-table th, .insights-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                    .insights-table th { background-color: #f2f2f2; }
                    .btn { display: inline-block; background-color: #4a69bd; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Lead Insights Summary</h1>
                    <p>Hourly AI analysis for ${sellerName}</p>
                </div>
                <div class="content">
                    <div class="summary">
                        <h2>Summary</h2>
                        <p>${insights.summary}</p>
                        
                        <h3>Key Findings</h3>
                        <ul>
                            ${insights.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
                        </ul>
                        
                        <h3>Trends</h3>
                        <ul>
                            ${insights.trends.map(trend => `<li>${trend}</li>`).join('')}
                        </ul>
                        
                        <h3>Recommendations</h3>
                        <ul>
                            ${insights.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <h2>Priority Leads</h2>
                    ${leads
                        .sort((a, b) => b.priority - a.priority)
                        .map(lead => `
                        <div class="lead-card">
                            <div class="lead-header">
                                <div>
                                    <h3>${lead.name}</h3>
                                    <p>${lead.email}</p>
                                </div>
                                <div>
                                    <span class="score priority-${lead.priority >= 70 ? 'high' : lead.priority >= 40 ? 'medium' : 'low'}">${lead.priority}%</span>
                                    <span class="status status-${lead.status}">${lead.status.toUpperCase()}</span>
                                </div>
                            </div>
                            <p><strong>AI Score:</strong> ${lead.score}%</p>
                            <p><strong>Last Activity:</strong> ${new Date(lead.lastActivity).toLocaleString()}</p>
                            ${lead.nextFollowUp ? `<p><strong>Next Follow-up:</strong> ${new Date(lead.nextFollowUp).toLocaleString()}</p>` : ''}
                            <div class="recommendation">
                                <strong>Recommended Action:</strong> ${lead.recommendedAction}
                            </div>
                            <p style="margin-top: 20px;">
                                <a href="${process.env.BASE_URL}/admin/leads/${lead.id}" class="btn">View Lead</a>
                            </p>
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>`;
            
            const result = await this.sendEmail({
                to: recipientEmail,
                subject,
                html: htmlContent,
                text: `
                    Lead Insights Summary for ${sellerName}
                    
                    Summary: ${insights.summary}
                    
                    Key Findings:
                    ${insights.keyFindings.map(finding => `- ${finding}`).join('\n')}
                    
                    Recommendations:
                    ${insights.recommendations.map(rec => `- ${rec}`).join('\n')}
                    
                    Priority Leads:
                    ${leads.map(lead => `
                    - ${lead.name} (${lead.email})
                      Priority: ${lead.priority}%, Status: ${lead.status}
                      Recommended Action: ${lead.recommendedAction}
                    `).join('\n')}
                    
                    View all leads at: ${process.env.BASE_URL}/admin/leads
                `
            });
            
            return result;
        } catch (error) {
            console.error('Error sending consolidated insights email:', error);
            return false;
        }
    }
}

module.exports = new EmailService(); 