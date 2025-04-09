const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { ensureAuthenticated, ensureSeller } = require('../middleware/auth');
const CustomRequest = require('../models/CustomRequest');
const Bid = require('../models/Bid');
const User = require('../models/User');
const PaintingRequest = require('../models/PaintingRequest');
const Razorpay = require('razorpay');
const { sendDeliveryDateEmail, sendShippingUpdateEmail } = require('../utils/emailService');
const nodemailer = require('nodemailer');

// Root route handler
router.get('/', ensureAuthenticated, async (req, res) => {
    if (req.user.role === 'seller') {
        res.redirect('/customRequests/open-requests');
    } else {
        res.redirect('/customRequests/my-requests');
    }
});

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Verify if Razorpay is properly initialized
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('Razorpay credentials are not properly configured in environment variables');
}

// Configure multer for request image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/custom_requests')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5000000 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// Check file type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

// Configure multer for PDF uploads
const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/shipping_documents')
    },
    filename: function (req, file, cb) {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf')
    }
});

const uploadPDF = multer({ 
    storage: pdfStorage,
    limits: { fileSize: 10000000 }, // 10MB limit
    fileFilter: function (req, file, cb) {
        checkPDFFileType(file, cb);
    }
});

// Check PDF file type
function checkPDFFileType(file, cb) {
    const filetypes = /pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: PDF Files Only!');
    }
}

// User Routes

// View all custom requests for user
router.get('/my-requests', ensureAuthenticated, async (req, res) => {
    try {
        const requests = await CustomRequest.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('assignedSeller', 'name email');
        
        res.render('custom-requests/my-requests', {
            user: req.user,
            requests: requests,
            title: 'My Custom Requests'
        });
    } catch (error) {
        console.error('Error fetching custom requests:', error);
        req.flash('error_msg', 'Error loading custom requests');
        res.redirect('/dashboard');
    }
});

// Create new custom request page
router.get('/create', ensureAuthenticated, (req, res) => {
    res.render('custom-requests/create', {
        user: req.user,
        title: 'Create Custom Request'
    });
});

// Submit new custom request
router.post('/create', ensureAuthenticated, upload.single('image'), async (req, res) => {
    try {
        const { type, title, description, budget, phoneNumber, address } = req.body;
        
        if (!req.file) {
            req.flash('error_msg', 'Please upload an image');
            return res.redirect('/customRequests/create');
        }

        const newRequest = new CustomRequest({
            user: req.user._id,
            type,
            title,
            description,
            budget: parseFloat(budget),
            phoneNumber,
            address: {
                street: address.street,
                city: address.city,
                state: address.state,
                pincode: address.pincode
            },
            imageUrl: `/uploads/custom_requests/${req.file.filename}`
        });

        await newRequest.save();
        req.flash('success_msg', 'Custom request created successfully');
        res.redirect('/customRequests/my-requests');
    } catch (error) {
        console.error('Error creating custom request:', error);
        req.flash('error_msg', 'Error creating custom request');
        res.redirect('/customRequests/create');
    }
});

// View single custom request with bids
router.get('/:id', ensureAuthenticated, async (req, res) => {
    try {
        const request = await CustomRequest.findById(req.params.id)
            .populate('user', 'name email')
            .populate('assignedSeller', 'name email');
        
        if (!request) {
            req.flash('error_msg', 'Custom request not found');
            return res.redirect('/customRequests/my-requests');
        }

        // Check if user owns this request or is a seller
        if (request.user._id.toString() !== req.user._id.toString() && req.user.role !== 'seller') {
            req.flash('error_msg', 'Not authorized');
            return res.redirect('/customRequests/my-requests');
        }

        const bids = await Bid.find({ customRequest: request._id })
            .populate('seller', 'name email')
            .sort({ createdAt: -1 });

        res.render('custom-requests/view', {
            user: req.user,
            request: request,
            bids: bids,
            title: 'Custom Request Details'
        });
    } catch (error) {
        console.error('Error fetching custom request:', error);
        req.flash('error_msg', 'Error loading custom request');
        res.redirect('/customRequests/my-requests');
    }
});

// Accept bid and show payment page
router.post('/:requestId/accept-bid/:bidId', ensureAuthenticated, async (req, res) => {
    try {
        // Find request and bid with necessary populated fields
        const request = await CustomRequest.findById(req.params.requestId)
            .populate('user', 'name email');
        const bid = await Bid.findById(req.params.bidId)
            .populate('seller', 'name email');

        // Validate request and bid existence
        if (!request || !bid) {
            req.flash('error_msg', 'Request or bid not found');
            return res.redirect('/customRequests/my-requests');
        }

        // Validate user authorization
        if (request.user._id.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Not authorized to accept this bid');
            return res.redirect('/customRequests/my-requests');
        }

        // Validate request status
        if (request.status !== 'open') {
            req.flash('error_msg', 'This request is no longer open for bidding');
            return res.redirect(`/customRequests/${request._id}`);
        }

        // Validate bid status
        if (bid.status !== 'pending') {
            req.flash('error_msg', 'This bid cannot be accepted');
            return res.redirect(`/customRequests/${request._id}`);
        }

        // Render payment page
        res.render('custom-requests/payment', {
            user: req.user,
            request: request,
            bid: bid,
            title: 'Payment'
        });

    } catch (error) {
        console.error('Error accepting bid:', error);
        req.flash('error_msg', 'Error processing request');
        res.redirect('/customRequests/my-requests');
    }
});

// Complete payment and update request status
router.post('/:requestId/complete-payment/:bidId', ensureAuthenticated, async (req, res) => {
    try {
        const request = await CustomRequest.findById(req.params.requestId);
        const bid = await Bid.findById(req.params.bidId);

        if (!request || !bid) {
            req.flash('error_msg', 'Request or bid not found');
            return res.redirect('/customRequests/my-requests');
        }

        // Update request status
        request.status = 'in_progress';
        request.assignedSeller = bid.seller;
        await request.save();

        // Update bid status
        bid.status = 'accepted';
        await bid.save();

        // Reject all other bids
        await Bid.updateMany(
            { 
                customRequest: request._id,
                _id: { $ne: bid._id }
            },
            { status: 'rejected' }
        );

        req.flash('success_msg', 'Payment completed successfully! The seller has been notified.');
        res.redirect(`/customRequests/${request._id}`);

    } catch (error) {
        console.error('Error completing payment:', error);
        req.flash('error_msg', 'Error processing payment');
        res.redirect('/customRequests/my-requests');
    }
});

// Verify payment and update order status
router.post('/:requestId/verify-payment', ensureAuthenticated, async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
        
        console.log('Payment verification received:', {
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id
        });

        // Verify payment signature
        const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // Find the request and update its status
            const request = await CustomRequest.findById(req.params.requestId)
                .populate('assignedSeller', 'name email');

            if (!request) {
                throw new Error('Custom request not found');
            }

            // Update request status and payment details
            request.paymentId = razorpay_payment_id;
            request.status = 'in_progress';
            await request.save();

            // Find the accepted bid and update its status
            const acceptedBid = await Bid.findOne({
                customRequest: request._id,
                status: 'accepted'
            }).populate('seller', 'name email');

            if (acceptedBid) {
                // You might want to send email notifications here
                console.log('Bid accepted and payment verified for:', {
                    seller: acceptedBid.seller.name,
                    amount: acceptedBid.amount,
                    requestTitle: request.title
                });
            }

            req.flash('success_msg', 'Payment successful! The seller has been notified and will start working on your request.');
            res.redirect(`/customRequests/${req.params.requestId}`);
        } else {
            console.error('Payment signature verification failed');
            req.flash('error_msg', 'Payment verification failed. Please contact support if amount was deducted.');
            res.status(400).redirect(`/customRequests/${req.params.requestId}`);
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        req.flash('error_msg', 'Error processing payment verification. Please contact support.');
        res.status(500).redirect(`/customRequests/${req.params.requestId}`);
    }
});

// Seller Routes

// View all open custom requests
router.get('/open-requests', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const requests = await CustomRequest.find({ status: 'open' })
            .populate('user', 'name email')
            .sort({ createdAt: -1 });

        // Get existing bids by this seller
        const existingBids = await Bid.find({ seller: req.user._id })
            .select('customRequest');

        const biddedRequestIds = existingBids.map(bid => bid.customRequest.toString());

        res.render('custom-requests/open-requests', {
            user: req.user,
            requests: requests,
            biddedRequestIds: biddedRequestIds,
            title: 'Open Custom Requests'
        });
    } catch (error) {
        console.error('Error fetching open requests:', error);
        req.flash('error_msg', 'Error loading open requests');
        res.redirect('/seller/dashboard');
    }
});

// Submit bid on custom request
router.post('/:id/bid', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const { amount, deliveryTime, proposal } = req.body;
        console.log('Received bid data:', {
            amount,
            deliveryTime,
            proposal
        });

        const request = await CustomRequest.findById(req.params.id)
            .populate('user', 'name email');
        console.log('Found request:', request ? 'yes' : 'no');

        if (!request || request.status !== 'open') {
            req.flash('error_msg', 'Custom request not found or not open for bidding');
            return res.redirect('/seller/custom-requests');
        }

        // Check if seller has already bid
        const existingBid = await Bid.findOne({
            customRequest: request._id,
            seller: req.user._id
        });
        console.log('Existing bid found:', existingBid ? 'yes' : 'no');

        if (existingBid) {
            req.flash('error_msg', 'You have already placed a bid on this request');
            return res.redirect(`/customRequests/${request._id}`);
        }

        const newBid = new Bid({
            customRequest: request._id,
            seller: req.user._id,
            amount: parseFloat(amount),
            deliveryTime: parseInt(deliveryTime),
            proposal,
            shippingAddress: request.address // Use customer's address from the request
        });

        console.log('Created new bid:', newBid);

        await newBid.save();
        
        // Add bid to custom request
        request.bids.push(newBid._id);
        await request.save();
        
        console.log('Bid saved successfully');

        req.flash('success_msg', 'Bid submitted successfully');
        res.redirect(`/customRequests/${request._id}`);
    } catch (error) {
        console.error('Error submitting bid:', error);
        req.flash('error_msg', 'Error submitting bid: ' + error.message);
        res.redirect('/seller/custom-requests');
    }
});

// Update tentative delivery date
router.post('/bid/:bidId/delivery-date', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const { tentativeDeliveryDate } = req.body;
        const bid = await Bid.findById(req.params.bidId)
            .populate('customRequest')
            .populate('seller');

        if (!bid || bid.seller._id.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Bid not found or not authorized');
            return res.redirect('/seller/dashboard');
        }

        // Use findByIdAndUpdate instead of save to avoid validation issues
        await Bid.findByIdAndUpdate(
            req.params.bidId,
            { tentativeDeliveryDate: new Date(tentativeDeliveryDate) },
            { runValidators: false }
        );

        // Send email notification to the buyer
        const buyer = await User.findById(bid.customRequest.user);
        await sendDeliveryDateEmail(buyer.email, {
            requestTitle: bid.customRequest.title,
            deliveryDate: tentativeDeliveryDate,
            sellerName: req.user.name
        });

        req.flash('success_msg', 'Delivery date updated successfully');
        res.redirect('/seller/dashboard');
    } catch (error) {
        console.error('Error updating delivery date:', error);
        req.flash('error_msg', 'Error updating delivery date');
        res.redirect('/seller/dashboard');
    }
});

// Update shipping details
router.post('/bid/:bidId/shipping', ensureAuthenticated, ensureSeller, uploadPDF.fields([
    { name: 'billPdf', maxCount: 1 },
    { name: 'certificateOfAuthenticity', maxCount: 1 }
]), async (req, res) => {
    try {
        const { billNumber, trackingId } = req.body;
        const bid = await Bid.findById(req.params.bidId)
            .populate('customRequest')
            .populate('seller');

        if (!bid || bid.seller._id.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Bid not found or not authorized');
            return res.redirect('/seller/dashboard');
        }

        // Get file paths if files were uploaded
        const billPdfPath = req.files.billPdf ? '/uploads/shipping_documents/' + req.files.billPdf[0].filename : null;
        const certificateOfAuthenticityPath = req.files.certificateOfAuthenticity ? '/uploads/shipping_documents/' + req.files.certificateOfAuthenticity[0].filename : null;

        // Use findByIdAndUpdate instead of save to avoid validation issues
        await Bid.findByIdAndUpdate(
            req.params.bidId,
            { 
                shippingDetails: {
                    billNumber,
                    trackingId,
                    billPdfPath,
                    certificateOfAuthenticityPath,
                    updatedAt: new Date()
                }
            },
            { runValidators: false }
        );

        // Send email notification to the buyer
        const buyer = await User.findById(bid.customRequest.user);
        await sendShippingUpdateEmail(buyer.email, {
            requestTitle: bid.customRequest.title,
            trackingId,
            billNumber,
            sellerName: req.user.name
        });

        req.flash('success_msg', 'Shipping details updated successfully');
        res.redirect('/seller/dashboard');
    } catch (error) {
        console.error('Error updating shipping details:', error);
        req.flash('error_msg', 'Error updating shipping details');
        res.redirect('/seller/dashboard');
    }
});

// Mark bid as delivered
router.post('/bid/:bidId/mark-delivered', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const bid = await Bid.findById(req.params.bidId)
            .populate('customRequest')
            .populate('seller');

        if (!bid || bid.seller._id.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Bid not found or not authorized');
            return res.redirect('/seller/dashboard');
        }

        // Check if delivery date and shipping details are set with required fields
        if (!bid.tentativeDeliveryDate || 
            !bid.shippingDetails || 
            !bid.shippingDetails.billNumber || 
            !bid.shippingDetails.trackingId) {
            req.flash('error_msg', 'Cannot mark as delivered. Please set delivery date and complete shipping details first.');
            return res.redirect('/seller/dashboard');
        }

        // Update bid as delivered
        await Bid.findByIdAndUpdate(
            req.params.bidId,
            { 
                delivered: true,
                deliveredAt: new Date()
            },
            { runValidators: false }
        );

        // Update custom request status to completed
        await CustomRequest.findByIdAndUpdate(
            bid.customRequest._id,
            { status: 'completed' }
        );

        // Send email notification to the buyer
        const buyer = await User.findById(bid.customRequest.user);
        
        // Create a simple email service function for delivery notification
        const emailSubject = `Your order "${bid.customRequest.title}" has been delivered`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4a90e2; text-align: center;">Order Delivered</h2>
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                    <p>Hello ${buyer.name},</p>
                    <p>Great news! Your custom request "${bid.customRequest.title}" has been marked as delivered by ${req.user.name}.</p>
                    <p>If you have received your order, please check that everything is as expected.</p>
                    <p>If you have any questions or concerns, please contact the seller directly.</p>
                    <p>Thank you for using our platform!</p>
                </div>
            </div>
        `;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: buyer.email,
            subject: emailSubject,
            html: emailHtml
        });

        req.flash('success_msg', 'Order marked as delivered successfully');
        res.redirect('/seller/dashboard');
    } catch (error) {
        console.error('Error marking bid as delivered:', error);
        req.flash('error_msg', 'Error marking as delivered');
        res.redirect('/seller/dashboard');
    }
});

// View seller profile
router.get('/seller/:id', ensureAuthenticated, async (req, res) => {
    try {
        const seller = await User.findById(req.params.id);
        if (!seller || !seller.isSeller) {
            req.flash('error_msg', 'Seller not found');
            return res.redirect('/customRequests');
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
        res.redirect('/customRequests');
    }
});

module.exports = router; 