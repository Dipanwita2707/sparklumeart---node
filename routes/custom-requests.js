const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CustomRequest = require('../models/CustomRequest');
const PaintingRequest = require('../models/PaintingRequest');
const Bid = require('../models/Bid');
const { ensureAuthenticated } = require('../middleware/auth');

// View seller profile
router.get('/seller/:id', async (req, res) => {
    try {
        const seller = await User.findById(req.params.id);
        if (!seller || !seller.isSeller) {
            req.flash('error_msg', 'Seller not found');
            return res.redirect('/custom-requests');
        }

        // Get completed custom requests
        const completedRequests = await CustomRequest.find({
            assignedSeller: seller._id,
            status: 'completed'
        }).sort({ updatedAt: -1 });

        // Get gallery requests
        const galleryRequests = await PaintingRequest.find({
            seller: seller._id,
            status: 'approved'
        }).sort({ createdAt: -1 });

        // Get active bids
        const activeBids = await Bid.find({
            seller: seller._id,
            status: 'pending'
        })
        .populate({
            path: 'customRequest',
            select: 'title description budget'
        })
        .sort({ createdAt: -1 });

        // Get current custom requests
        const customRequests = await CustomRequest.find({
            assignedSeller: seller._id,
            status: { $in: ['assigned', 'in_progress'] }
        })
        .sort({ createdAt: -1 });

        res.render('custom-requests/seller-profile', {
            title: `${seller.name}'s Profile`,
            seller,
            completedRequests,
            galleryRequests,
            activeBids,
            customRequests,
            user: req.user
        });
    } catch (error) {
        console.error('Error loading seller profile:', error);
        req.flash('error_msg', 'Error loading seller profile');
        res.redirect('/custom-requests');
    }
});

module.exports = router; 