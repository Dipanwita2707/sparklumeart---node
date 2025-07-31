const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { ensureAuthenticated, ensureSeller } = require('../middleware/auth');
const PaintingRequest = require('../models/PaintingRequest');
const fs = require('fs');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const { sendOrderStatusEmail } = require('../utils/emailService');
const CustomRequest = require('../models/CustomRequest');
const Bid = require('../models/Bid');
const SellerPerformance = require('../models/SellerPerformance');

// Configure multer for painting image upload
const paintingStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/paintings')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

// Configure multer for product image upload
const productStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/products')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const paintingUpload = multer({ 
    storage: paintingStorage,
    limits: { fileSize: 5000000 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

const productUpload = multer({ 
    storage: productStorage,
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

// Seller dashboard
router.get('/dashboard', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        // Get recent orders
        const recentOrders = await Order.find({
            'items.seller': req.user._id
        })
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5);

        // Get total orders count
        const totalOrders = await Order.countDocuments({
            'items.seller': req.user._id
        });

        // Get painting requests
        const requests = await PaintingRequest.find({ seller: req.user._id })
            .sort({ createdAt: -1 });

        // Get open custom requests
        const openRequests = await CustomRequest.find({
            status: 'open'
        })
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5);

        // Get active bids by this seller
        const activeBidsList = await Bid.find({
            seller: req.user._id,
            status: 'pending'
        })
        .populate('customRequest', 'title')
        .sort({ createdAt: -1 });

        // Get accepted bids
        const acceptedBids = await Bid.find({
            seller: req.user._id,
            status: 'accepted'
        })
        .populate('customRequest', 'title description')
        .sort({ createdAt: -1 });

        // Get total custom orders count
        const customOrders = await CustomRequest.countDocuments({
            assignedSeller: req.user._id
        });

        res.render('seller/dashboard', {
            user: req.user,
            recentOrders,
            totalOrders,
            requests,
            openRequests,
            activeBidsList,
            acceptedBids,
            activeBids: activeBidsList.length,
            customOrders,
            title: 'Seller Dashboard',
            products: [], // Provide empty array as fallback
            orders: [] // Provide empty array as fallback
        });
    } catch (error) {
        console.error('Error loading seller dashboard:', error);
        req.flash('error_msg', 'Error loading dashboard data');
        res.redirect('/');
    }
});

// Submit painting request
router.post('/paintings/request', ensureSeller, paintingUpload.single('image'), async (req, res) => {
    try {
        const { artistName, createdDate, description } = req.body;
        
        if (!req.file) {
            req.flash('error_msg', 'Please upload an image');
            return res.redirect('/seller/paintings/add');
        }

        // Make sure the file exists before continuing
        const filePath = path.join(__dirname, '../public', `/uploads/paintings/${req.file.filename}`);
        if (!fs.existsSync(filePath)) {
            req.flash('error_msg', 'Error saving image. Please try again.');
            return res.redirect('/seller/paintings/add');
        }

        const newRequest = new PaintingRequest({
            seller: req.user._id,
            title: artistName, // Using artistName as title
            description,
            createdDate: new Date(createdDate), // Ensure it's a Date object
            imageUrl: `/uploads/paintings/${req.file.filename}`
        });

        await newRequest.save();
        req.flash('success_msg', 'Painting request submitted successfully');
        res.redirect('/seller/dashboard');
    } catch (error) {
        console.error('Error submitting request:', error);
        req.flash('error_msg', `Error submitting request: ${error.message}`);
        res.redirect('/seller/paintings/add');
    }
});

// View painting requests
router.get('/paintings/requests', ensureSeller, async (req, res) => {
    try {
        const requests = await PaintingRequest.find({ seller: req.user._id })
            .sort({ createdAt: -1 });
        
        res.render('seller/requests', {
            user: req.user,
            requests: requests
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading requests');
        res.redirect('/seller/dashboard');
    }
});

// Manage paintings
router.get('/paintings', ensureSeller, (req, res) => {
    res.render('seller/paintings', {
        user: req.user
    });
});

// Add new painting
router.get('/paintings/add', ensureSeller, (req, res) => {
    res.render('seller/add-painting', {
        user: req.user
    });
});

// Profile settings
router.get('/profile', ensureSeller, async (req, res) => {
    try {
        // Get active bids by this seller
        const activeBids = await Bid.find({
            seller: req.user._id,
            status: 'pending'
        })
        .populate({
            path: 'customRequest',
            select: 'title description budget'
        })
        .sort({ createdAt: -1 });

        // Get assigned custom requests
        const customRequests = await CustomRequest.find({
            assignedSeller: req.user._id,
            status: { $in: ['assigned', 'in_progress'] }
        })
        .sort({ createdAt: -1 });

        res.render('seller/profile', {
            user: req.user,
            activeBids,
            customRequests,
            title: 'Profile Settings'
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        req.flash('error_msg', 'Error loading profile data');
        res.redirect('/seller/dashboard');
    }
});

// Seller products page
router.get('/products', ensureSeller, async (req, res) => {
    try {
        const products = await Product.find({ seller: req.user._id })
            .sort({ createdAt: -1 });
        
        res.render('seller/products', {
            user: req.user,
            title: 'My Products',
            products: products,
            messages: {
                success: req.flash('success_msg'),
                error_msg: req.flash('error_msg')
            }
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading products');
        res.redirect('/seller/dashboard');
    }
});

// Add new product page
router.get('/products/add', ensureSeller, (req, res) => {
    res.render('seller/add-product', {
        user: req.user,
        title: 'Add New Product',
        messages: {
            success: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        }
    });
});

// Submit product request
router.post('/products/request', ensureSeller, productUpload.single('image'), async (req, res) => {
    try {
        const { title, description, price, stock, artistName } = req.body;
        
        if (!req.file) {
            req.flash('error_msg', 'Please upload an image');
            return res.redirect('/seller/products/add');
        }

        // Make sure the file exists before continuing
        const filePath = path.join(__dirname, '../public', `/uploads/products/${req.file.filename}`);
        if (!fs.existsSync(filePath)) {
            req.flash('error_msg', 'Error saving image. Please try again.');
            return res.redirect('/seller/products/add');
        }

        const newProduct = new Product({
            seller: req.user._id,
            title,
            description,
            price: parseFloat(price),
            stock: parseInt(stock) || 1,
            artistName,
            image: `/uploads/products/${req.file.filename}`
        });

        await newProduct.save();
        req.flash('success_msg', 'Product request submitted successfully');
        res.redirect('/seller/products');
    } catch (error) {
        console.error('Error submitting product request:', error);
        req.flash('error_msg', `Error submitting request: ${error.message}`);
        res.redirect('/seller/products/add');
    }
});

// Seller orders page
router.get('/orders', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        console.log('Fetching orders for seller ID:', req.user._id);
        
        // Get product IDs for this seller
        const sellerProducts = await Product.find({ seller: req.user._id }).select('_id');
        const sellerProductIds = sellerProducts.map(product => product._id);
        
        console.log('Seller product IDs:', sellerProductIds);
        
        // Find all orders containing products sold by this seller
        // This query will find orders where either:
        // 1. items.seller is explicitly set to the seller's ID, OR
        // 2. items.product is one of the seller's products
        const orders = await Order.find({
            $or: [
                { 'items.seller': req.user._id },
                { 'items.product': { $in: sellerProductIds } }
            ]
        })
            .populate('user', 'name email')
            .populate('items.product')
            .sort({ createdAt: -1 });
        
        console.log(`Found ${orders.length} orders for seller`);
        
        // Group orders by status
        const processingOrders = orders.filter(order => order.orderStatus === 'processing');
        const approvedOrders = orders.filter(order => order.orderStatus === 'approved');
        const shippedOrders = orders.filter(order => order.orderStatus === 'in_transit');
        const deliveredOrders = orders.filter(order => order.orderStatus === 'delivered');
        
        res.render('seller/orders', {
            user: req.user,
            title: 'Manage Orders',
            orders: orders,
            processingOrders: processingOrders,
            approvedOrders: approvedOrders,
            shippedOrders: shippedOrders,
            deliveredOrders: deliveredOrders,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading seller orders:', error);
        req.flash('error_msg', 'Error loading orders');
        res.redirect('/seller/dashboard');
    }
});

// Order details page
router.get('/orders/:id', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        console.log('Fetching order details for ID:', req.params.id);
        
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product');
        
        if (!order) {
            console.log('Order not found');
            req.flash('error_msg', 'Order not found');
            return res.redirect('/seller/orders');
        }
        
        console.log('Order found, checking seller authorization');
        
        // Get product IDs for this seller
        const sellerProducts = await Product.find({ seller: req.user._id }).select('_id');
        const sellerProductIds = sellerProducts.map(product => product._id.toString());
        
        // Check if seller is authorized to view this order
        // Either items.seller is explicitly set to this seller OR items.product is one of this seller's products
        const sellerItems = order.items.filter(item => 
            (item.seller && item.seller.toString() === req.user._id.toString()) || 
            (item.product && sellerProductIds.includes(item.product._id.toString()))
        );
        
        if (sellerItems.length === 0) {
            console.log('Seller not authorized to view this order');
            req.flash('error_msg', 'You are not authorized to view this order');
            return res.redirect('/seller/orders');
        }
        
        console.log('Seller authorized, rendering order details');
        
        res.render('seller/order-details', {
            user: req.user,
            title: 'Order Details',
            order: order,
            sellerItems: sellerItems,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        req.flash('error_msg', 'Error loading order details');
        res.redirect('/seller/orders');
    }
});

// Update order status (approve order)
router.post('/orders/:id/approve', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        console.log('Approving order:', req.params.id);
        
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!order) {
            console.log('Order not found');
            req.flash('error_msg', 'Order not found');
            return res.redirect('/seller/orders');
        }
        
        // Get product IDs for this seller
        const sellerProducts = await Product.find({ seller: req.user._id }).select('_id');
        const sellerProductIds = sellerProducts.map(product => product._id.toString());
        
        // Check if seller is authorized to update this order
        const sellerItems = order.items.filter(item => 
            (item.seller && item.seller.toString() === req.user._id.toString()) || 
            (item.product && sellerProductIds.includes(item.product.toString()))
        );
        
        if (sellerItems.length === 0) {
            console.log('Seller not authorized to update this order');
            req.flash('error_msg', 'You are not authorized to update this order');
            return res.redirect('/seller/orders');
        }
        
        // Update order status to approved
        if (order.orderStatus === 'processing') {
            order.orderStatus = 'approved';
            order.updatedAt = Date.now();
            
            // Add email notification record
            order.emailNotifications.push({
                status: 'approved',
                sentAt: new Date(),
                successful: true
            });
            
            await order.save();
            console.log('Order approved successfully');
            
            // Send email notification to customer
            try {
                await sendOrderStatusEmail(order, order.user);
                console.log('Approval notification email sent to customer');
            } catch (emailError) {
                console.error('Error sending approval notification email:', emailError);
                // Update the email notification record
                order.emailNotifications[order.emailNotifications.length - 1].successful = false;
                await order.save();
            }
            
            req.flash('success_msg', 'Order has been approved');
        } else {
            console.log('Order cannot be approved - incorrect status:', order.orderStatus);
            req.flash('error_msg', 'Order cannot be approved because it is not in processing status');
        }
        
        res.redirect(`/seller/orders/${order._id}`);
    } catch (error) {
        console.error('Error approving order:', error);
        req.flash('error_msg', 'Error approving order');
        res.redirect('/seller/orders');
    }
});

// Update shipping details
router.post('/orders/:id/ship', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        console.log('Shipping order:', req.params.id);
        const { trackingNumber, estimatedDeliveryDate } = req.body;
        
        if (!trackingNumber) {
            console.log('Tracking number not provided');
            req.flash('error_msg', 'Tracking number is required');
            return res.redirect(`/seller/orders/${req.params.id}`);
        }
        
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!order) {
            console.log('Order not found');
            req.flash('error_msg', 'Order not found');
            return res.redirect('/seller/orders');
        }
        
        // Get product IDs for this seller
        const sellerProducts = await Product.find({ seller: req.user._id }).select('_id');
        const sellerProductIds = sellerProducts.map(product => product._id.toString());
        
        // Check if seller is authorized to update this order
        const sellerItems = order.items.filter(item => 
            (item.seller && item.seller.toString() === req.user._id.toString()) || 
            (item.product && sellerProductIds.includes(item.product.toString()))
        );
        
        if (sellerItems.length === 0) {
            console.log('Seller not authorized to update this order');
            req.flash('error_msg', 'You are not authorized to update this order');
            return res.redirect('/seller/orders');
        }
        
        // Update order status and tracking information
        if (order.orderStatus === 'approved') {
            order.orderStatus = 'in_transit';
            order.trackingNumber = trackingNumber;
            
            if (estimatedDeliveryDate) {
                order.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
            }
            
            order.updatedAt = Date.now();
            
            // Add email notification record
            order.emailNotifications.push({
                status: 'in_transit',
                sentAt: new Date(),
                successful: true
            });
            
            await order.save();
            console.log('Order marked as shipped successfully');
            
            // Send email notification to customer
            try {
                await sendOrderStatusEmail(order, order.user);
                console.log('Shipping notification email sent to customer');
            } catch (emailError) {
                console.error('Error sending shipping notification email:', emailError);
                // Update the email notification record
                order.emailNotifications[order.emailNotifications.length - 1].successful = false;
                await order.save();
            }
            
            req.flash('success_msg', 'Order has been marked as shipped and tracking information has been updated');
        } else {
            console.log('Order must be approved before shipping - current status:', order.orderStatus);
            req.flash('error_msg', 'Order must be approved before it can be shipped');
        }
        
        res.redirect(`/seller/orders/${order._id}`);
    } catch (error) {
        console.error('Error updating shipping details:', error);
        req.flash('error_msg', 'Error updating shipping details');
        res.redirect(`/seller/orders/${req.params.id}`);
    }
});

// Mark order as delivered
router.post('/orders/:id/deliver', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        console.log('Marking order as delivered:', req.params.id);
        
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!order) {
            console.log('Order not found');
            req.flash('error_msg', 'Order not found');
            return res.redirect('/seller/orders');
        }
        
        // Get product IDs for this seller
        const sellerProducts = await Product.find({ seller: req.user._id }).select('_id');
        const sellerProductIds = sellerProducts.map(product => product._id.toString());
        
        // Check if seller is authorized to update this order
        const sellerItems = order.items.filter(item => 
            (item.seller && item.seller.toString() === req.user._id.toString()) || 
            (item.product && sellerProductIds.includes(item.product.toString()))
        );
        
        if (sellerItems.length === 0) {
            console.log('Seller not authorized to update this order');
            req.flash('error_msg', 'You are not authorized to update this order');
            return res.redirect('/seller/orders');
        }
        
        // Update order status to delivered
        if (order.orderStatus === 'in_transit') {
            order.orderStatus = 'delivered';
            order.updatedAt = Date.now();
            
            // Add email notification record
            order.emailNotifications.push({
                status: 'delivered',
                sentAt: new Date(),
                successful: true
            });
            
            await order.save();
            console.log('Order marked as delivered successfully');
            
            // Update seller performance metrics
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            let performance = await SellerPerformance.findOne({
                seller: req.user._id,
                period: 'monthly',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!performance) {
                performance = new SellerPerformance({
                    seller: req.user._id,
                    period: 'monthly',
                    startDate: monthStart,
                    endDate: monthEnd,
                    metrics: {
                        leadsAssigned: 0,
                        leadsContacted: 0,
                        leadsQualified: 0,
                        proposalsSent: 0,
                        salesClosed: 0,
                        totalRevenue: 0,
                        averageOrderValue: 0,
                        conversionRate: 0,
                        responseTime: 0
                    }
                });
            }
            
            // Calculate total amount from seller's items
            const sellerTotalAmount = sellerItems.reduce((total, item) => {
                return total + (item.price * item.quantity);
            }, 0);
            
            // Update metrics
            performance.metrics.salesClosed += 1;
            performance.metrics.totalRevenue += sellerTotalAmount;
            
            // Recalculate average order value
            if (performance.metrics.salesClosed > 0) {
                performance.metrics.averageOrderValue = 
                    performance.metrics.totalRevenue / performance.metrics.salesClosed;
            }
            
            // Calculate conversion rate if leads were assigned
            if (performance.metrics.leadsAssigned > 0) {
                performance.metrics.conversionRate = 
                    (performance.metrics.salesClosed / performance.metrics.leadsAssigned) * 100;
            }
            
            await performance.save();
            console.log(`Updated performance metrics for seller ${req.user._id}`);
            
            // Send email notification to customer
            try {
                await sendOrderStatusEmail(order, order.user);
                console.log('Delivery notification email sent to customer');
            } catch (emailError) {
                console.error('Error sending delivery notification email:', emailError);
                // Update the email notification record
                order.emailNotifications[order.emailNotifications.length - 1].successful = false;
                await order.save();
            }
            
            req.flash('success_msg', 'Order has been marked as delivered');
        } else {
            console.log('Order must be in transit before delivery - current status:', order.orderStatus);
            req.flash('error_msg', 'Order must be in transit before it can be marked as delivered');
        }
        
        res.redirect(`/seller/orders/${order._id}`);
    } catch (error) {
        console.error('Error marking order as delivered:', error);
        req.flash('error_msg', 'Error marking order as delivered');
        res.redirect('/seller/orders');
    }
});

// View all custom requests
router.get('/custom-requests', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const query = { status: 'open' };
        if (req.query.status) {
            query.status = req.query.status;
        }

        const requests = await CustomRequest.find(query)
            .populate('user', 'name email')
            .populate({
                path: 'bids',
                populate: { path: 'seller', select: 'name' }
            })
            .sort({ createdAt: -1 });

        res.render('seller/custom-requests', {
            user: req.user,
            title: 'Custom Requests',
            requests,
            query: req.query,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading custom requests:', error);
        req.flash('error_msg', 'Error loading custom requests');
        res.redirect('/seller/dashboard');
    }
});

// View custom request details
router.get('/custom-requests/:id', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const request = await CustomRequest.findById(req.params.id)
            .populate('user', 'name email')
            .populate({
                path: 'bids',
                populate: { path: 'seller', select: 'name' }
            });

        if (!request) {
            req.flash('error_msg', 'Custom request not found');
            return res.redirect('/seller/custom-requests');
        }

        // Check if the seller has already placed a bid
        const hasUserBid = request.bids.some(bid => bid.seller._id.toString() === req.user._id.toString());

        res.render('seller/custom-request-details', {
            user: req.user,
            title: request.title,
            request,
            hasUserBid,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading custom request details:', error);
        req.flash('error_msg', 'Error loading custom request details');
        res.redirect('/seller/custom-requests');
    }
});

// Place a bid on a custom request
router.post('/custom-requests/:id/bid', ensureAuthenticated, ensureSeller, async (req, res) => {
    try {
        const { amount, deliveryTime, proposal } = req.body;
        const requestId = req.params.id;

        const request = await CustomRequest.findById(requestId)
            .populate('bids');

        if (!request) {
            req.flash('error_msg', 'Custom request not found');
            return res.redirect('/seller/custom-requests');
        }

        if (request.status !== 'open') {
            req.flash('error_msg', 'This request is no longer open for bids');
            return res.redirect(`/seller/custom-requests/${requestId}`);
        }

        // Check if seller has already bid
        const existingBid = request.bids.find(bid => bid.seller.toString() === req.user._id.toString());
        if (existingBid) {
            req.flash('error_msg', 'You have already placed a bid on this request');
            return res.redirect(`/seller/custom-requests/${requestId}`);
        }

        // Create new bid
        const newBid = new Bid({
            seller: req.user._id,
            customRequest: requestId,
            amount: parseFloat(amount),
            deliveryTime: parseInt(deliveryTime),
            proposal,
            status: 'pending'
        });

        await newBid.save();

        // Add bid to custom request
        request.bids.push(newBid._id);
        await request.save();

        req.flash('success_msg', 'Your bid has been submitted successfully');
        res.redirect(`/seller/custom-requests/${requestId}`);
    } catch (error) {
        console.error('Error submitting bid:', error);
        req.flash('error_msg', 'Error submitting bid');
        res.redirect(`/seller/custom-requests/${req.params.id}`);
    }
});

module.exports = router; 