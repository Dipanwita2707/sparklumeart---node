const cron = require('node-cron');
const automatedEmailService = require('./automatedEmailService');
const EmailCampaign = require('../models/EmailCampaign');
const emailService = require('./emailService');
const UserBehaviorAnalyzer = require('./userBehaviorAnalyzer.js');
const AILeadService = require('./aiLeadService');
const Order = require('../models/Order');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Cart = require('../models/Cart');

class SchedulerService {
    constructor() {
        this.tasks = {};
        this.initializeTasks();
    }

    initializeTasks() {
        // Process leads for automated emails daily at 2am
        this.tasks.processLeads = cron.schedule('0 2 * * *', async () => {
            console.log('Running scheduled task: Process leads for automated emails');
            await automatedEmailService.processLeadBehaviors();
        }, {
            scheduled: false
        });

        // Clean abandoned carts older than 30 days at 3am
        this.tasks.cleanCarts = cron.schedule('0 3 * * *', async () => {
            console.log('Running scheduled task: Clean abandoned carts');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            await Cart.deleteMany({
                updatedAt: { $lt: thirtyDaysAgo },
                status: 'abandoned'
            });
        }, {
            scheduled: false
        });

        // Analyze user behavior patterns daily at 1am
        this.tasks.analyzeBehavior = cron.schedule('0 1 * * *', async () => {
            console.log('Running scheduled task: Analyze user behavior patterns');
            await UserBehaviorAnalyzer.analyzeAllUsers();
        }, {
            scheduled: false
        });

        // Send order status reminder emails at 10am
        this.tasks.orderReminders = cron.schedule('0 10 * * *', async () => {
            console.log('Running scheduled task: Send order status reminders');
            
            // Get orders that have been in production for more than 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const orders = await Order.find({
                status: 'in_production',
                statusUpdatedAt: { $lt: sevenDaysAgo },
                'reminderSent': { $ne: true }
            }).populate('user').populate('items.seller');
            
            for (const order of orders) {
                try {
                    await emailService.sendOrderStatusReminder(order);
                    order.reminderSent = true;
                    await order.save();
                } catch (error) {
                    console.error(`Error sending reminder for order ${order._id}:`, error);
                }
            }
        }, {
            scheduled: false
        });

        // Recalculate lead priority scores daily at 4am
        this.tasks.recalculateLeadPriorities = cron.schedule('0 4 * * *', async () => {
            console.log('Running scheduled task: Recalculate lead priority scores');
            await AILeadService.recalculateAllPriorityScores();
        }, {
            scheduled: false
        });
        
        // Send follow-up reminders at 8am
        this.tasks.sendFollowUpReminders = cron.schedule('0 8 * * *', async () => {
            console.log('Running scheduled task: Send follow-up reminders');
            const leadsNeedingFollowUp = await AILeadService.getLeadsNeedingFollowUp();
            
            if (leadsNeedingFollowUp.length > 0) {
                const leadIds = leadsNeedingFollowUp.map(lead => lead._id);
                
                // Group leads by assigned seller
                const leadsByAssignedSeller = {};
                leadsNeedingFollowUp.forEach(lead => {
                    if (lead.assignedSeller) {
                        const sellerId = lead.assignedSeller._id.toString();
                        if (!leadsByAssignedSeller[sellerId]) {
                            leadsByAssignedSeller[sellerId] = {
                                seller: lead.assignedSeller,
                                leads: []
                            };
                        }
                        leadsByAssignedSeller[sellerId].leads.push(lead);
                    }
                });
                
                // Send email to each seller with their follow-ups
                for (const sellerId in leadsByAssignedSeller) {
                    try {
                        const { seller, leads } = leadsByAssignedSeller[sellerId];
                        await emailService.sendSellerFollowUpReminder(seller, leads);
                    } catch (error) {
                        console.error(`Error sending follow-up reminder to seller ${sellerId}:`, error);
                    }
                }
                
                // Send admin summary of all follow-ups
                try {
                    const admins = await User.find({ role: 'admin' });
                    for (const admin of admins) {
                        await emailService.sendAdminFollowUpSummary(admin, leadsNeedingFollowUp);
                    }
                } catch (error) {
                    console.error('Error sending follow-up summary to admins:', error);
                }
                
                // Mark reminders as sent
                await AILeadService.markFollowUpRemindersSent(leadIds);
            }
        }, {
            scheduled: false
        });
        
        // Identify stale leads weekly on Monday at 5am
        this.tasks.identifyStaleLeads = cron.schedule('0 5 * * 1', async () => {
            console.log('Running scheduled task: Identify stale leads');
            const staleLeads = await AILeadService.identifyStaleLeads(14);
            
            if (staleLeads.length > 0) {
                // Send stale leads report to admins
                try {
                    const admins = await User.find({ role: 'admin' });
                    for (const admin of admins) {
                        await emailService.sendStaleLeadsReport(admin, staleLeads);
                    }
                } catch (error) {
                    console.error('Error sending stale leads report to admins:', error);
                }
            }
        }, {
            scheduled: false
        });
        
        // Send consolidated AI insights hourly
        this.tasks.sendConsolidatedInsights = cron.schedule('0 * * * *', async () => {
            console.log('Running scheduled task: Send consolidated AI insights');
            const processedCount = await AILeadService.generateConsolidatedInsights();
            console.log(`Processed ${processedCount} leads for consolidated insights`);
        }, {
            scheduled: false
        });
    }

    startAll() {
        console.log('Starting all scheduled tasks');
        Object.values(this.tasks).forEach(task => task.start());
    }

    stopAll() {
        console.log('Stopping all scheduled tasks');
        Object.values(this.tasks).forEach(task => task.stop());
    }
}

module.exports = new SchedulerService(); 