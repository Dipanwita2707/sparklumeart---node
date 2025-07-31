// Routes for email campaigns with the correct ordering

// ============ EMAIL CAMPAIGN MANAGEMENT ROUTES ============

// Email Campaigns List
router.get('/email-campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaigns = await EmailCampaign.find()
            .sort({ createdAt: -1 })
            .populate('sentBy', 'name');
            
        res.render('admin/email-campaigns/index', {
            user: req.user,
            campaigns,
            currentPath: req.path,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error fetching email campaigns:', error);
        req.flash('error_msg', 'Failed to load email campaigns');
        res.redirect('/admin/dashboard');
    }
});

// New Campaign Form - MUST come before the :id route to avoid route conflicts
router.get('/email-campaigns/new', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get lead count for targeting options
        const totalLeads = await Lead.countDocuments();
        const highPotentialCount = await Lead.countDocuments({ 
            interestLevel: { $in: ['high', 'very_high'] } 
        });
        const cartAbandoners = await Lead.countDocuments({ 
            tags: 'cart_abandoner' 
        });
        const recentlyActive = await Lead.countDocuments({
            'engagementMetrics.lastInteraction': { 
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
            }
        });
        
        res.render('admin/email-campaigns/new', {
            user: req.user,
            targetingOptions: {
                totalLeads,
                highPotentialCount,
                cartAbandoners,
                recentlyActive
            },
            currentPath: req.path,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading new campaign form:', error);
        req.flash('error_msg', 'Failed to load campaign form');
        res.redirect('/admin/email-campaigns');
    }
});

// Campaign Detail Route - MUST come after the /new route
router.get('/email-campaigns/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id)
            .populate('sentBy', 'name')
            .populate('recipients.lead')
            .populate('recipients.user', 'name email');
            
        if (!campaign) {
            req.flash('error_msg', 'Email campaign not found');
            return res.redirect('/admin/email-campaigns');
        }
        
        // Calculate delivery rate
        const sentCount = campaign.recipients.filter(r => r.sent).length;
        const deliveryRate = sentCount > 0 ? 
            (campaign.recipients.filter(r => r.delivered).length / sentCount * 100).toFixed(1) : 0;
        
        // Calculate open rate
        const openRate = sentCount > 0 ?
            (campaign.metrics.uniqueOpens / sentCount * 100).toFixed(1) : 0;
            
        // Calculate click rate
        const clickRate = campaign.metrics.uniqueOpens > 0 ?
            (campaign.metrics.uniqueClicks / campaign.metrics.uniqueOpens * 100).toFixed(1) : 0;
            
        // Calculate conversion rate
        const conversionRate = campaign.metrics.uniqueClicks > 0 ?
            (campaign.metrics.conversionCount / campaign.metrics.uniqueClicks * 100).toFixed(1) : 0;
            
        // Get opened but not clicked
        const openedNotClicked = campaign.recipients.filter(r => r.opened && !r.clicked).length;
        
        res.render('admin/email-campaigns/details', {
            title: 'Campaign Details',
            user: req.user,
            campaign,
            metrics: {
                deliveryRate,
                openRate,
                clickRate,
                conversionRate,
                openedNotClicked
            },
            currentPath: req.path,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading campaign details:', error);
        req.flash('error_msg', 'Error loading campaign details');
        res.redirect('/admin/email-campaigns');
    }
});

// Create New Campaign
router.post('/email-campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { name, subject, content, targetCriteria, scheduledDate } = req.body;
        
        // Validate input
        if (!name || !subject || !content || !targetCriteria) {
            req.flash('error_msg', 'Please provide all required fields');
            return res.redirect('/admin/email-campaigns/new');
        }
        
        // Parse target criteria
        let criteriaObj = {};
        let targetLeads = [];
        
        if (targetCriteria === 'high_potential') {
            criteriaObj = { interestLevel: { $in: ['high', 'very_high'] } };
        } else if (targetCriteria === 'cart_abandoners') {
            criteriaObj = { tags: 'cart_abandoner' };
        } else if (targetCriteria === 'recently_active') {
            criteriaObj = { 
                'engagementMetrics.lastInteraction': { 
                    $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
                }
            };
        } else if (targetCriteria === 'all') {
            criteriaObj = {};
        }
        
        // Get target leads
        targetLeads = await Lead.find(criteriaObj)
            .populate('user', 'name email preferences');
            
        // Filter leads with email preferences enabled
        targetLeads = targetLeads.filter(lead => 
            lead.user && 
            lead.user.email && 
            (!lead.user.preferences || lead.user.preferences.emailEnabled !== false)
        );
        
        const recipients = targetLeads.map(lead => ({
            lead: lead._id,
            user: lead.user._id,
            email: lead.user.email
        }));
        
        // Create campaign
        const newCampaign = new EmailCampaign({
            name,
            subject,
            content,
            targetCriteria: JSON.stringify(criteriaObj),
            totalLeads: recipients.length,
            status: scheduledDate ? 'scheduled' : 'draft',
            sentBy: req.user._id,
            scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
            recipients
        });
        
        await newCampaign.save();
        
        req.flash('success_msg', 'Email campaign created successfully');
        res.redirect('/admin/email-campaigns');
    } catch (error) {
        console.error('Error creating email campaign:', error);
        req.flash('error_msg', 'Failed to create campaign: ' + error.message);
        res.redirect('/admin/email-campaigns/new');
    }
}); 