const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EmailCampaignSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    targetCriteria: {
        type: String, // JSON string of the query criteria
        required: true
    },
    totalLeads: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
        default: 'draft'
    },
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    scheduledDate: {
        type: Date,
        default: null
    },
    sentDate: {
        type: Date,
        default: null
    },
    metrics: {
        openCount: {
            type: Number,
            default: 0
        },
        clickCount: {
            type: Number,
            default: 0
        },
        uniqueOpens: {
            type: Number,
            default: 0
        },
        uniqueClicks: {
            type: Number,
            default: 0
        },
        deliveryFailures: {
            type: Number,
            default: 0
        },
        conversionCount: {
            type: Number,
            default: 0
        }
    },
    recipients: [{
        lead: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lead'
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        email: {
            type: String,
            required: true
        },
        sent: {
            type: Boolean,
            default: false
        },
        sentAt: Date,
        delivered: {
            type: Boolean,
            default: false
        },
        opened: {
            type: Boolean,
            default: false
        },
        openCount: {
            type: Number,
            default: 0
        },
        firstOpenAt: Date,
        lastOpenAt: Date,
        clicked: {
            type: Boolean,
            default: false
        },
        clickCount: {
            type: Number,
            default: 0
        },
        firstClickAt: Date,
        lastClickAt: Date,
        clickedLinks: [{
            url: String,
            clickedAt: Date
        }],
        converted: {
            type: Boolean,
            default: false
        },
        convertedAt: Date
    }]
}, { timestamps: true });

// Calculate metrics based on recipient data
EmailCampaignSchema.methods.calculateMetrics = async function() {
    const recipients = this.recipients || [];
    
    const openCount = recipients.reduce((sum, recipient) => sum + recipient.openCount, 0);
    const clickCount = recipients.reduce((sum, recipient) => sum + recipient.clickCount, 0);
    const uniqueOpens = recipients.filter(recipient => recipient.opened).length;
    const uniqueClicks = recipients.filter(recipient => recipient.clicked).length;
    const deliveryFailures = recipients.filter(recipient => !recipient.delivered && recipient.sent).length;
    const conversionCount = recipients.filter(recipient => recipient.converted).length;
    
    this.metrics = {
        openCount,
        clickCount,
        uniqueOpens,
        uniqueClicks,
        deliveryFailures,
        conversionCount
    };
    
    await this.save();
    return this.metrics;
};

// Update recipient metrics based on lead tracking data
EmailCampaignSchema.methods.updateRecipientFromLead = async function(leadId) {
    const recipientIndex = this.recipients.findIndex(r => 
        r.lead && r.lead.toString() === leadId.toString()
    );
    
    if (recipientIndex === -1) return false;
    
    const lead = await mongoose.model('Lead').findById(leadId);
    if (!lead || !lead.emailTracking) return false;
    
    const recipient = this.recipients[recipientIndex];
    
    // Update open data
    if (lead.emailTracking.opens && lead.emailTracking.opens.length > 0) {
        recipient.opened = true;
        recipient.openCount = lead.emailTracking.opens.length;
        
        // Sort opens by timestamp
        const sortedOpens = [...lead.emailTracking.opens].sort((a, b) => 
            a.timestamp - b.timestamp
        );
        
        recipient.firstOpenAt = sortedOpens[0].timestamp;
        recipient.lastOpenAt = sortedOpens[sortedOpens.length - 1].timestamp;
    }
    
    // Update click data
    if (lead.emailTracking.clicks && lead.emailTracking.clicks.length > 0) {
        recipient.clicked = true;
        recipient.clickCount = lead.emailTracking.clicks.length;
        
        // Sort clicks by timestamp
        const sortedClicks = [...lead.emailTracking.clicks].sort((a, b) => 
            a.timestamp - b.timestamp
        );
        
        recipient.firstClickAt = sortedClicks[0].timestamp;
        recipient.lastClickAt = sortedClicks[sortedClicks.length - 1].timestamp;
        
        // Update clicked links
        recipient.clickedLinks = lead.emailTracking.clicks.map(click => ({
            url: click.link,
            clickedAt: click.timestamp
        }));
    }
    
    // Update conversion
    if (lead.status === 'converted' && lead.lastContact > this.sentDate) {
        recipient.converted = true;
        recipient.convertedAt = lead.lastContact;
    }
    
    // Mark as updated
    this.recipients[recipientIndex] = recipient;
    await this.save();
    
    // Recalculate metrics
    await this.calculateMetrics();
    
    return true;
};

module.exports = mongoose.model('EmailCampaign', EmailCampaignSchema); 