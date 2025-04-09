const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const EmailCampaign = require('../models/EmailCampaign');

// Track email opens
router.get('/track-email/:leadId/open', async (req, res) => {
    try {
        const { leadId } = req.params;
        const { cid } = req.query; // Campaign ID, if provided
        const ip = req.ip;
        const userAgent = req.headers['user-agent'];

        // Track open in lead
        await emailService.trackEmailOpen(leadId, ip, userAgent);

        // If campaign ID was provided, update campaign metrics
        if (cid) {
            const campaign = await EmailCampaign.findById(cid);
            if (campaign) {
                await campaign.updateRecipientFromLead(leadId);
            }
        }

        // Return a 1x1 transparent GIF
        const img = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Content-Length': img.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(img);
    } catch (error) {
        console.error('Error tracking email open:', error);
        res.status(500).send('Error tracking email open');
    }
});

// Track link clicks
router.get('/track-email/:leadId/click', async (req, res) => {
    try {
        const { leadId } = req.params;
        const { link, cid } = req.query; // cid = Campaign ID
        const ip = req.ip;
        const userAgent = req.headers['user-agent'];

        // Track click in lead
        await emailService.trackLinkClick(leadId, link, ip, userAgent);

        // If campaign ID was provided, update campaign metrics
        if (cid) {
            const campaign = await EmailCampaign.findById(cid);
            if (campaign) {
                await campaign.updateRecipientFromLead(leadId);
            }
        }

        // Redirect to the actual link
        res.redirect(link);
    } catch (error) {
        console.error('Error tracking link click:', error);
        res.status(500).send('Error tracking link click');
    }
});

module.exports = router; 