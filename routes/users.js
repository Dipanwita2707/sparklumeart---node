/**
 * My Insights Page
 * Shows user behavior insights and recommendations
 */
router.get('/my-insights', ensureAuthenticated, async (req, res) => {
    try {
        // Get user lead information
        const lead = await Lead.findOne({
            user: req.user._id
        });
        
        // Get user's recent activity
        const activities = await UserActivity.find({
            user: req.user._id
        })
        .sort({ createdAt: -1 })
        .limit(10);
        
        // Get user's recent orders
        const orders = await Order.find({
            user: req.user._id
        })
        .sort({ createdAt: -1 })
        .limit(5);
        
        // Get email history for this user
        const emailHistory = lead && lead.emailTracking ? {
            lastSent: lead.emailTracking.lastSent,
            totalSent: lead.emailTracking.sentCount,
            opened: lead.emailTracking.opens ? lead.emailTracking.opens.length : 0,
            clicked: lead.emailTracking.clicks ? lead.emailTracking.clicks.length : 0
        } : null;
        
        // Get personalized recommendations
        const recommendations = lead ? lead.recommendedActions || [] : [];
        
        // Get behavior insights
        const insights = lead ? lead.aiInsights || [] : [];
        
        // Render the insights page
        res.render('users/my-insights', {
            title: 'My Personal Insights',
            user: req.user,
            lead,
            activities,
            orders,
            emailHistory,
            recommendations,
            insights
        });
    } catch (error) {
        console.error('Error loading user insights:', error);
        req.flash('error_msg', 'Error loading insights');
        res.redirect('/dashboard');
    }
});

/**
 * Update Email Preferences
 */
router.post('/email-preferences', ensureAuthenticated, async (req, res) => {
    try {
        const { emailEnabled, emailTypes } = req.body;
        
        // Get user lead
        let lead = await Lead.findOne({ user: req.user._id });
        
        // If no lead exists, create one
        if (!lead) {
            lead = new Lead({
                user: req.user._id,
                status: 'new',
                source: 'direct',
                aiScore: 30,
                interestLevel: 'low'
            });
        }
        
        // Update email preferences
        if (!lead.preferences) lead.preferences = {};
        lead.preferences.emailEnabled = emailEnabled === 'on';
        lead.preferences.emailTypes = emailTypes || [];
        
        await lead.save();
        
        req.flash('success_msg', 'Email preferences updated');
        res.redirect('/users/my-insights');
    } catch (error) {
        console.error('Error updating email preferences:', error);
        req.flash('error_msg', 'Error updating email preferences');
        res.redirect('/users/my-insights');
    }
}); 