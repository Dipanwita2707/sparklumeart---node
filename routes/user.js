const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureUser } = require('../middleware/auth');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const CustomRequest = require('../models/CustomRequest');
const PsychometricTest = require('../models/PsychometricTest');
const nodemailer = require('nodemailer');
const activityTracker = require('../middleware/activityTracker');

// Custom middleware to ensure user role
const ensureUserRole = (req, res, next) => {
    if (req.user && req.user.role === 'user') {
        return next();
    }
    // If user is logged in but has a different role, redirect to appropriate dashboard
    if (req.user) {
        if (req.user.role === 'admin') {
            req.flash('error_msg', 'Only regular users can access the psychometric test.');
            return res.redirect('/admin/dashboard');
        } else if (req.user.role === 'seller') {
            req.flash('error_msg', 'Only regular users can access the psychometric test.');
            return res.redirect('/seller/dashboard');
        } else if (req.user.role === 'psychologist') {
            req.flash('error_msg', 'Only regular users can access the psychometric test.');
            return res.redirect('/psychologist/dashboard');
        }
    }
    // If not logged in at all
    req.flash('error_msg', 'Please log in as a user to access this page');
    res.redirect('/auth/login');
};

// User dashboard (root path)
router.get('/', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        // Track dashboard view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'view_dashboard',
                details: {}
            });
        } catch (error) {
            console.error('Error tracking dashboard view:', error);
        }
        
        // Get recent orders
        const recentOrders = await Order.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(5);
            
        res.render('user/dashboard', {
            user: req.user,
            title: 'User Dashboard',
            recentOrders,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading user dashboard:', error);
        req.flash('error_msg', 'Error loading dashboard data');
        res.redirect('/');
    }
});

// User dashboard (explicit dashboard path)
router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        // Track dashboard view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'view_dashboard',
                details: {}
            });
        } catch (error) {
            console.error('Error tracking dashboard view:', error);
        }
        
        // Get user's orders
        const orders = await Order.find({ user: req.user._id })
            .sort({ createdAt: -1 });

        // Get user's custom requests
        const customRequests = await CustomRequest.find({ user: req.user._id })
            .sort({ createdAt: -1 });

        // Get user's psychometric tests
        const tests = await PsychometricTest.find({ user: req.user._id })
            .sort({ createdAt: -1 });

        res.render('user/dashboard', {
            user: req.user,
            orders,
            customRequests,
            tests
        });
    } catch (err) {
        console.error('Error loading dashboard:', err);
        res.status(500).render('error', { 
            message: 'Error loading dashboard', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// User orders
router.get('/orders', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        // Track orders view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'view_orders',
                details: {}
            });
        } catch (error) {
            console.error('Error tracking orders view:', error);
        }
        
        const orders = await Order.find({ user: req.user._id })
            .sort({ createdAt: -1 });
            
        res.render('user/orders', {
            user: req.user,
            title: 'My Orders',
            orders,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading user orders:', error);
        req.flash('error_msg', 'Error loading orders');
        res.redirect('/user/dashboard');
    }
});

// View order details
router.get('/orders/:id', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order || order.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/user/orders');
        }
        
        // Track order details view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'view_order_details',
                details: {
                    orderId: order._id,
                    orderStatus: order.orderStatus,
                    orderAmount: order.totalAmount
                }
            });
        } catch (error) {
            console.error('Error tracking order detail view:', error);
        }
        
        res.render('user/order-details', {
            user: req.user,
            title: 'Order Details',
            order,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        req.flash('error_msg', 'Error loading order details');
        res.redirect('/user/orders');
    }
});

// User profile
router.get('/profile', ensureAuthenticated, ensureUser, (req, res) => {
    // Track profile view
    try {
        activityTracker.trackActivity(req, {
            activityType: 'view_profile',
            details: {}
        });
    } catch (error) {
        console.error('Error tracking profile view:', error);
    }
    
    res.render('user/profile', {
        user: req.user,
        title: 'My Profile',
        messages: {
            success: req.flash('success_msg'),
            error: req.flash('error_msg')
        }
    });
});

// Browse paintings
router.get('/paintings', ensureUser, (req, res) => {
    res.render('user/paintings', {
        user: req.user
    });
});

// View painting details
router.get('/paintings/:id', ensureUser, (req, res) => {
    res.render('user/painting-details', {
        user: req.user,
        paintingId: req.params.id
    });
});

// Favorites
router.get('/favorites', ensureAuthenticated, ensureUser, (req, res) => {
    res.render('user/favorites', {
        user: req.user,
        title: 'My Favorites',
        messages: {
            success: req.flash('success_msg'),
            error: req.flash('error_msg')
        }
    });
});

// Cancel order
router.post('/orders/:id/cancel', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order || order.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/user/orders');
        }
        
        if (order.orderStatus === 'delivered' || order.orderStatus === 'cancelled') {
            req.flash('error_msg', 'Cannot cancel this order');
            return res.redirect(`/user/orders/${order._id}`);
        }
        
        // Update order status
        order.orderStatus = 'cancelled';
        await order.save();
        
        // Restore product stock
        for (const item of order.items) {
            try {
                const product = await Product.findById(item.product);
                if (product) {
                    product.stock += item.quantity;
                    await product.save();
                }
            } catch (err) {
                console.error('Error restoring product stock:', err);
                // Continue with other items even if one fails
            }
        }
        
        req.flash('success_msg', 'Order cancelled successfully');
        res.redirect('/user/orders');
    } catch (error) {
        console.error('Error cancelling order:', error);
        req.flash('error_msg', 'Error cancelling order');
        res.redirect(`/user/orders/${req.params.id}`);
    }
});

// Psychometric Test Routes

// Start psychometric test
router.get('/psychometric-test', ensureAuthenticated, ensureUserRole, (req, res) => {
    // Track psychometric test start
    try {
        activityTracker.trackActivity(req, {
            activityType: 'start_psychometric_test',
            details: {}
        });
    } catch (error) {
        console.error('Error tracking psychometric test start:', error);
    }
    
    res.render('user/psychometric-test', {
        user: req.user,
        title: 'Psychometric Test',
        currentPath: req.path
    });
});

// Submit psychometric test
router.post('/psychometric-test', ensureAuthenticated, async (req, res) => {
    try {
        const user = req.user;
        const answersMap = {};
        
        // Process color preference questions (1-5)
        for (let i = 1; i <= 5; i++) {
            const answer = req.body[`question${i}`];
            if (!answer) {
                return res.status(400).send('Please answer all questions');
            }
            answersMap[`q${i}`] = answer;
        }
        
        // Process style preference questions (6-10)
        for (let i = 6; i <= 10; i++) {
            const answer = req.body[`question${i}`];
            if (!answer) {
                return res.status(400).send('Please answer all questions');
            }
            answersMap[`q${i}`] = answer;
        }
        
        // Process personality questions (11-15)
        for (let i = 11; i <= 15; i++) {
            const answer = req.body[`question${i}`];
            if (!answer) {
                return res.status(400).send('Please answer all questions');
            }
            answersMap[`q${i}`] = answer;
        }
        
        // Get all answers for each category for preference calculation
        const colorAnswers = [answersMap.q1, answersMap.q2, answersMap.q3, answersMap.q4, answersMap.q5];
        const styleAnswers = [answersMap.q6, answersMap.q7, answersMap.q8, answersMap.q9, answersMap.q10];
        const personalityAnswers = [answersMap.q11, answersMap.q12, answersMap.q13, answersMap.q14, answersMap.q15];
        
        // Simple algorithm to determine preferences (can be made more sophisticated)
        const colorPreference = calculateColorPreference(colorAnswers);
        const stylePreference = calculateStylePreference(styleAnswers);
        const personalityTraits = calculatePersonalityTraits(personalityAnswers);
        
        // Create new test record
        const test = new PsychometricTest({
            user: user._id,
            answers: answersMap,
            colorPreference,
            stylePreference,
            personalityTraits,
            status: 'awaiting_payment'
        });
        
        await test.save();
        
        // Track test submission
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'complete_psychometric_test',
                details: {
                    testId: test._id,
                    colorPreference: colorPreference,
                    stylePreference: stylePreference
                }
            });
        } catch (error) {
            console.error('Error tracking psychometric test completion:', error);
        }
        
        // Redirect to payment page
        res.redirect(`/user/psychometric-test/${test._id}/payment`);
        
    } catch (err) {
        console.error('Error submitting psychometric test:', err);
        res.status(500).render('error', { 
            message: 'Error submitting test', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// Payment page for psychometric test
router.get('/psychometric-test/:id/payment', ensureAuthenticated, ensureUserRole, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            return res.status(404).render('error', { 
                message: 'Test not found', 
                error: { status: 404 } 
            });
        }
        
        // Remove the status check to allow payment for any test status
        // Only redirect if already paid
        if (test.status === 'paid' || test.status === 'under_review' || test.status === 'reviewed') {
            req.flash('info_msg', 'This test has already been paid for');
            return res.redirect('/user/dashboard');
        }
        
        res.render('user/psychometric-test-payment', {
            user: req.user,
            test: test,
            testFee: 100 // Base fee in INR
        });
        
    } catch (err) {
        console.error('Error loading payment page:', err);
        res.status(500).render('error', { 
            message: 'Error loading payment page', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// Complete payment for psychometric test
router.post('/psychometric-test/:id/payment', ensureAuthenticated, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            return res.status(404).render('error', { 
                message: 'Test not found', 
                error: { status: 404 } 
            });
        }
        
        // Dummy payment process - no actual verification
        const paymentId = 'PSYCH' + Date.now() + Math.floor(Math.random() * 1000);
        
        // Update test with payment details
        test.status = 'paid';
        test.paymentId = paymentId;
        test.paymentAmount = 118; // 100 + 18% GST
        test.paymentDate = new Date();
        
        await test.save();
        
        req.flash('success_msg', 'Payment successful! Your test will be reviewed by a psychologist.');
        res.redirect('/user/dashboard');
        
    } catch (err) {
        console.error('Error processing payment:', err);
        req.flash('error_msg', 'Error processing payment. Please try again.');
        res.redirect(`/user/psychometric-test/${req.params.id}/payment`);
    }
});

// View quotation from admin
router.get('/psychometric-test/:id/quote', ensureAuthenticated, ensureUserRole, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Test not found or not authorized');
            return res.redirect('/user/dashboard');
        }
        
        if (test.status !== 'admin_quoted') {
            req.flash('error_msg', 'No quote available yet');
            return res.redirect('/user/dashboard');
        }
        
        res.render('user/psychometric-test-quote', {
            title: 'Home Decor Quote',
            user: req.user,
            test
        });
    } catch (error) {
        console.error('Error loading quote:', error);
        req.flash('error_msg', 'Error loading quote');
        res.redirect('/user/dashboard');
    }
});

// Accept quotation and proceed to payment
router.post('/psychometric-test/:id/quote/accept', ensureAuthenticated, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Test not found or not authorized');
            return res.redirect('/user/dashboard');
        }
        
        if (test.status !== 'admin_quoted') {
            req.flash('error_msg', 'No quote available to accept');
            return res.redirect('/user/dashboard');
        }
        
        test.userApproval = true;
        await test.save();
        
        res.redirect(`/user/psychometric-test/${test._id}/final-payment`);
    } catch (error) {
        console.error('Error accepting quote:', error);
        req.flash('error_msg', 'Error accepting quote');
        res.redirect('/user/dashboard');
    }
});

// Final payment page
router.get('/psychometric-test/:id/final-payment', ensureAuthenticated, ensureUserRole, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Test not found or not authorized');
            return res.redirect('/user/dashboard');
        }
        
        if (!test.userApproval) {
            req.flash('error_msg', 'Please accept the quote first');
            return res.redirect(`/user/psychometric-test/${test._id}/quote`);
        }
        
        if (test.finalPaymentStatus === 'completed') {
            req.flash('info_msg', 'Payment already completed');
            return res.redirect('/user/dashboard');
        }
        
        res.render('user/psychometric-test-final-payment', {
            title: 'Final Payment',
            user: req.user,
            test
        });
    } catch (error) {
        console.error('Error loading final payment page:', error);
        req.flash('error_msg', 'Error loading final payment page');
        res.redirect('/user/dashboard');
    }
});

// Complete final payment
router.post('/psychometric-test/:id/final-payment', ensureAuthenticated, async (req, res) => {
    try {
        const { mobileNumber, street, city, state, pincode } = req.body;
        
        // Validate input
        if (!mobileNumber || !street || !city || !state || !pincode) {
            req.flash('error_msg', 'Please fill in all address details');
            return res.redirect(`/user/psychometric-test/${req.params.id}/final-payment`);
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            req.flash('error_msg', 'Test not found or not authorized');
            return res.redirect('/user/dashboard');
        }
        
        if (!test.userApproval) {
            req.flash('error_msg', 'Please accept the quote first');
            return res.redirect(`/user/psychometric-test/${test._id}/quote`);
        }
        
        if (test.finalPaymentStatus === 'completed') {
            req.flash('info_msg', 'Payment already completed');
            return res.redirect('/user/dashboard');
        }
        
        // Update order details
        test.orderDetails = {
            mobileNumber,
            address: {
                street,
                city,
                state,
                pincode
            }
        };
        
        // In a real scenario, we would process payment here
        // For now, we'll just mark it as completed
        test.finalPaymentId = 'FINAL_' + Date.now();
        test.finalPaymentStatus = 'completed';
        test.status = 'payment_completed';
        await test.save();
        
        req.flash('success_msg', 'Payment completed. Your order has been placed.');
        res.redirect('/user/dashboard');
    } catch (error) {
        console.error('Error processing final payment:', error);
        req.flash('error_msg', 'Error processing payment');
        res.redirect('/user/dashboard');
    }
});

// View psychometric test results
router.get('/psychometric-tests', ensureAuthenticated, async (req, res) => {
    try {
        const tests = await PsychometricTest.find({ user: req.user._id })
            .sort({ createdAt: -1 });
        
        res.render('user/psychometric-tests', {
            user: req.user,
            tests: tests
        });
        
    } catch (err) {
        console.error('Error fetching psychometric tests:', err);
        res.status(500).render('error', { 
            message: 'Error fetching tests', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// View psychometric test details
router.get('/psychometric-test/:id', ensureAuthenticated, ensureUserRole, async (req, res) => {
    try {
        const test = await PsychometricTest.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/user/psychometric-tests');
        }

        res.render('user/psychometric-test-detail', {
            user: req.user,
            title: 'Test Details',
            test: test,
            currentPath: req.path
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error retrieving test details');
        res.redirect('/user/psychometric-tests');
    }
});

// Handle order approval and payment
router.post('/psychometric-test/:id/approve', ensureAuthenticated, async (req, res) => {
    try {
        const { mobileNumber, street, city, state, pincode } = req.body;
        
        // Validate required fields
        if (!mobileNumber || !street || !city || !state || !pincode) {
            req.flash('error_msg', 'All fields are required');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test || test.user.toString() !== req.user._id.toString()) {
            return res.status(404).render('error', { 
                message: 'Test not found', 
                error: { status: 404 } 
            });
        }
        
        // Ensure that the admin has provided a quote
        if (!test.adminQuote.budget || !test.adminQuote.description) {
            req.flash('error_msg', 'No admin quote available yet');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        // In a real app, this would integrate with a payment gateway
        const paymentId = 'ORDER' + Date.now() + Math.floor(Math.random() * 1000);
        
        // Update order details
        test.order = {
            approved: true,
            paymentId: paymentId,
            paymentAmount: test.adminQuote.budget,
            paymentDate: new Date(),
            status: 'pending',
            shippingAddress: {
                street,
                city,
                state,
                pincode
            },
            mobileNumber
        };
        
        await test.save();
        
        req.flash('success_msg', 'Your order has been approved and payment processed!');
        res.redirect('/user/dashboard');
        
    } catch (err) {
        console.error('Error approving order:', err);
        res.status(500).render('error', { 
            message: 'Error approving order', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// Submit comment for completed psychometric test
router.post('/psychometric-test/:id/feedback', ensureAuthenticated, async (req, res) => {
    try {
        const test = await PsychometricTest.findOne({ 
            _id: req.params.id,
            user: req.user._id,
            'order.status': 'completed'
        });
        
        if (!test) {
            req.flash('error_msg', 'Test not found or not eligible for comments');
            return res.redirect('/user/dashboard');
        }
        
        // Check if feedback already exists
        if (test.userFeedback && test.userFeedback.submittedAt) {
            req.flash('error_msg', 'You have already submitted a comment for this test');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        const { comment } = req.body;
        
        if (!comment || comment.trim() === '') {
            req.flash('error_msg', 'Please provide a comment');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        test.userFeedback = {
            rating: null,
            comment: comment,
            submittedAt: new Date()
        };
        
        await test.save();
        
        req.flash('success_msg', 'Thank you for your comment!');
        res.redirect(`/user/psychometric-test/${req.params.id}`);
    } catch (error) {
        console.error('Error submitting comment:', error);
        req.flash('error_msg', 'Error submitting comment');
        res.redirect('/user/dashboard');
    }
});

// Route for approving a quote and placing an order
router.post('/psychometric-test/:id/approve-quote', ensureAuthenticated, async (req, res) => {
    try {
        const { mobileNumber, address } = req.body;
        
        // Validate inputs
        if (!mobileNumber || !address) {
            req.flash('error_msg', 'Mobile number and address are required');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/user/dashboard');
        }
        
        // Check if test belongs to user
        if (test.user.toString() !== req.user.id) {
            req.flash('error_msg', 'Unauthorized access');
            return res.redirect('/user/dashboard');
        }
        
        // Check if test has an admin quote
        if (!test.adminQuote || !test.adminQuote.budget || !test.adminQuote.description) {
            req.flash('error_msg', 'No quote available for this test');
            return res.redirect(`/user/psychometric-test/${req.params.id}`);
        }
        
        // Update test with order details
        if (!test.order) {
            test.order = {};
        }
        
        // Generate a unique payment ID
        const paymentId = 'ORDER' + Date.now() + Math.floor(Math.random() * 1000);
        
        test.order.mobileNumber = mobileNumber;
        test.order.address = address;
        test.order.approvedAt = new Date();
        test.order.status = 'placed';
        test.order.approved = true;
        test.order.paymentId = paymentId;
        test.order.paymentAmount = test.adminQuote.budget;
        test.order.paymentDate = new Date();
        
        // Update main test status to indicate order has been placed
        test.status = 'order_placed';
        
        await test.save();
        
        // Optionally send email notification to admin about order placement
        try {
            const adminEmails = await User.find({ role: 'admin' }).select('email');
            if (adminEmails.length > 0) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: adminEmails.map(admin => admin.email).join(','),
                    subject: 'New Order Placed',
                    html: `
                        <h2>New Order Alert!</h2>
                        <p>A user has approved a quote and placed an order.</p>
                        <h3>Order Details:</h3>
                        <p><strong>User:</strong> ${req.user.name} (${req.user.email})</p>
                        <p><strong>Mobile Number:</strong> ${mobileNumber}</p>
                        <p><strong>Address:</strong> ${address}</p>
                        <p><strong>Budget:</strong> ₹${test.adminQuote.budget.toLocaleString('en-IN')}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                        <p>Please log in to the admin panel to process this order.</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Error sending email notification:', emailError);
            // Continue execution even if email fails
        }
        
        req.flash('success_msg', 'Quote approved and order placed successfully');
        res.redirect('/user/dashboard');
        
    } catch (err) {
        console.error('Error approving quote:', err);
        req.flash('error_msg', 'Error approving quote');
        res.redirect('/user/dashboard');
    }
});

// Helper functions for calculating preferences
function calculateColorPreference(answers) {
    // Count occurrences of each preference
    const counts = {
        warm: 0,
        cool: 0,
        neutral: 0,
        bold: 0
    };
    
    // Map answers to preferences (simplified mapping)
    answers.forEach(answer => {
        if (answer.includes('warm') || answer.includes('red') || answer.includes('orange') || answer.includes('yellow')) {
            counts.warm++;
        } else if (answer.includes('cool') || answer.includes('blue') || answer.includes('green') || answer.includes('purple')) {
            counts.cool++;
        } else if (answer.includes('neutral') || answer.includes('beige') || answer.includes('white') || answer.includes('gray')) {
            counts.neutral++;
        } else if (answer.includes('bold') || answer.includes('bright') || answer.includes('contrast')) {
            counts.bold++;
        }
    });
    
    // Find the preference with the highest count
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

function calculateStylePreference(answers) {
    // Count occurrences of each preference
    const counts = {
        modern: 0,
        traditional: 0,
        minimal: 0,
        eclectic: 0
    };
    
    // Map answers to preferences (simplified mapping)
    answers.forEach(answer => {
        if (answer.includes('modern') || answer.includes('contemporary') || answer.includes('sleek')) {
            counts.modern++;
        } else if (answer.includes('traditional') || answer.includes('classic') || answer.includes('elegant')) {
            counts.traditional++;
        } else if (answer.includes('minimal') || answer.includes('simple') || answer.includes('clean')) {
            counts.minimal++;
        } else if (answer.includes('eclectic') || answer.includes('mix') || answer.includes('diverse')) {
            counts.eclectic++;
        }
    });
    
    // Find the preference with the highest count
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

function calculatePersonalityTraits(answers) {
    const traits = [];
    
    // Determine personality traits based on answers (simplified logic)
    if (answers.some(a => a.includes('often') || a.includes('frequently') || a.includes('regularly'))) {
        traits.push('Dynamic');
    }
    
    if (answers.some(a => a.includes('comfort') || a.includes('cozy'))) {
        traits.push('Comfort-focused');
    }
    
    if (answers.some(a => a.includes('organized') || a.includes('structure'))) {
        traits.push('Organized');
    }
    
    if (answers.some(a => a.includes('trend') || a.includes('latest'))) {
        traits.push('Trend-conscious');
    }
    
    if (answers.some(a => a.includes('social') || a.includes('entertain') || a.includes('hosting'))) {
        traits.push('Social');
    }
    
    if (answers.some(a => a.includes('sanctuar') || a.includes('retreat') || a.includes('relax'))) {
        traits.push('Sanctuary-seeker');
    }
    
    // Ensure at least one trait
    if (traits.length === 0) {
        traits.push('Balanced');
    }
    
    return traits;
}

module.exports = router; 