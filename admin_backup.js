const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Gallery = require('../models/Gallery');
const PaintingRequest = require('../models/PaintingRequest');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const Product = require('../models/Product');
const PsychometricTest = require('../models/PsychometricTest');
const Order = require('../models/Order');
const Lead = require('../models/Lead');
const SellerPerformance = require('../models/SellerPerformance');
const AILeadService = require('../services/aiLeadService');
const emailService = require('../services/emailService');
const CustomRequest = require('../models/CustomRequest');
const UserActivity = require('../models/UserActivity');
const EmailCampaign = require('../models/EmailCampaign');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create a directory for gallery uploads
const galleryUploadsDir = path.join(__dirname, '../public/uploads/gallery');
if (!fs.existsSync(galleryUploadsDir)) {
    fs.mkdirSync(galleryUploadsDir, { recursive: true });
}

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Default upload directory for normal uploads
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
    }
});

// Configure multer for gallery image upload
const galleryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, galleryUploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function(req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Gallery upload middleware
const galleryUpload = multer({ 
    storage: galleryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function(req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
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

// Admin dashboard - Protected route
router.get('/dashboard', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get counts for various entities
        const userCount = await User.countDocuments({ role: 'user' });
        const sellerCount = await User.countDocuments({ role: 'seller' });
        const orderCount = await Order.countDocuments();
        const productCount = await Product.countDocuments();
        
        // Get psychometric test statistics
        const testCount = await PsychometricTest.countDocuments();
        const reviewedTestsCount = await PsychometricTest.countDocuments({ status: 'reviewed' });
        const quotedTestsCount = await PsychometricTest.countDocuments({ 'adminQuote.budget': { $ne: null } });
        const approvedOrdersCount = await PsychometricTest.countDocuments({ 'order.approved': true });
        
        // Get pending painting requests count
        const pendingRequestsCount = await PaintingRequest.countDocuments({ status: 'pending' });
        const pendingProductsCount = await Product.countDocuments({ status: 'pending' });
        
        // Get recent orders
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email');
            
        // Get recent painting requests
        const recentRequests = await PaintingRequest.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('seller', 'name email');
            
        // Get recent gallery items
        const recentGallery = await Gallery.find()
            .sort({ createdAt: -1 })
            .limit(6);
            
        // Get recent product requests
        const recentProductRequests = await Product.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('seller', 'name email');
            
        // Calculate total revenue
        const orders = await Order.find({ paymentStatus: 'completed' });
        const totalRevenue = orders.reduce((total, order) => total + order.totalAmount, 0);
        
        // Get lead management data
        const leadCount = await Lead.countDocuments();
        const highPotentialLeadsCount = await Lead.countDocuments({ 
            interestLevel: { $in: ['high', 'very_high'] } 
        });
        const assignedLeadsCount = await Lead.countDocuments({ 
            assignedSeller: { $ne: null } 
        });
        const convertedLeadsCount = await Lead.countDocuments({ 
            status: 'converted' 
        });
        
        // Get high potential leads
        const highPotentialLeads = await Lead.find({ 
            interestLevel: { $in: ['high', 'very_high'] },
            status: { $nin: ['converted', 'lost'] }
        })
        .sort({ aiScore: -1 })
        .limit(5)
        .populate('user', 'name email')
        .populate('assignedSeller', 'name');
        
        // Get lead sources analytics
        const leadsBySource = await Lead.aggregate([
            {
                $group: {
                    _id: "$source",
                    count: { $sum: 1 },
                    avgScore: { $avg: "$aiScore" }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // Get seller performance data
        const period = 'monthly';
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
        
        // Get top performing sellers
        const topSellers = await SellerPerformance.find({
            period: period,
            startDate: { $gte: startOfMonth },
            endDate: { $lte: endOfMonth }
        })
        .sort({ performanceScore: -1 })
        .limit(5)
        .populate('seller', 'name email');
        
        // Calculate overall performance metrics
        let overallMetrics = {
            totalRevenue: 0,
            avgConversionRate: 0,
            avgOrderValue: 0,
            activeSellers: await User.countDocuments({ role: 'seller', isActive: true })
        };
        
        if (topSellers.length > 0) {
            // Calculate averages from existing seller performances
            overallMetrics.totalRevenue = topSellers.reduce((sum, perf) => sum + perf.metrics.totalRevenue, 0);
            
            const totalConversionRate = topSellers.reduce((sum, perf) => sum + perf.metrics.conversionRate, 0);
            overallMetrics.avgConversionRate = totalConversionRate / topSellers.length;
            
            const totalAvgOrderValue = topSellers.reduce((sum, perf) => sum + perf.metrics.averageOrderValue, 0);
            overallMetrics.avgOrderValue = totalAvgOrderValue / topSellers.length;
        }
        
        res.render('admin/dashboard', {
            user: req.user,
            currentPath: req.path,
            counts: {
                users: userCount,
                sellers: sellerCount,
                orders: orderCount,
                products: productCount,
                tests: testCount,
                reviewedTests: reviewedTestsCount,
                quotedTests: quotedTestsCount,
                approvedOrders: approvedOrdersCount,
                leads: leadCount,
                highPotentialLeads: highPotentialLeadsCount,
                assignedLeads: assignedLeadsCount,
                convertedLeads: convertedLeadsCount
            },
            stats: {
                requests: pendingRequestsCount,
                productRequests: pendingProductsCount
            },
            recentOrders,
            recentRequests,
            recentGallery,
            recentProductRequests,
            totalRevenue,
            // Lead management data
            highPotentialLeads,
            leadsBySource,
            // Seller performance data
            topSellers,
            sellerPerformanceMetrics: overallMetrics
        });
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        res.status(500).render('error', { 
            message: 'Error loading dashboard', 
            currentPath: req.path
        });
    }
});

// Manage users
router.get('/users', ensureAdmin, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } });
        res.render('admin/users', {
            user: req.user,
            currentPath: req.path,
            users,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error loading users');
        res.redirect('/admin/dashboard');
    }
});

// Gallery management
router.get('/gallery', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const galleryItems = await Gallery.find().sort({ createdAt: -1 });
        res.render('admin/gallery', {
            user: req.user,
            currentPath: req.path,
            title: 'Gallery Management',
            galleryItems,
            messages: req.flash()
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error loading gallery');
        res.redirect('/admin/dashboard');
    }
});

// Add new gallery item
router.post('/gallery/add', ensureAuthenticated, ensureAdmin, galleryUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'Please select an image');
            return res.redirect('/admin/gallery');
        }

        const newGalleryItem = new Gallery({
            image: `/uploads/gallery/${req.file.filename}`,
            artistName: req.body.artistName,
            createdDate: req.body.createdDate,
            description: req.body.description
        });

        await newGalleryItem.save();
        req.flash('success_msg', 'Gallery item added successfully');
        res.redirect('/admin/gallery');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error adding gallery item');
        res.redirect('/admin/gallery');
    }
});

// Update gallery item
router.post('/gallery/:id/update', ensureAuthenticated, ensureAdmin, galleryUpload.single('image'), async (req, res) => {
    try {
        const galleryItem = await Gallery.findById(req.params.id);
        if (!galleryItem) {
            req.flash('error_msg', 'Gallery item not found');
            return res.redirect('/admin/gallery');
        }

        // Update fields
        galleryItem.artistName = req.body.artistName;
        galleryItem.createdDate = req.body.createdDate;
        galleryItem.description = req.body.description;

        // Update image if new one is uploaded
        if (req.file) {
            // Delete old image file if it exists and is in the public directory
            const oldImagePath = path.join(__dirname, '../public', galleryItem.image);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
            galleryItem.image = `/uploads/gallery/${req.file.filename}`;
        }

        await galleryItem.save();
        req.flash('success_msg', 'Gallery item updated successfully');
        res.redirect('/admin/gallery');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error updating gallery item');
        res.redirect('/admin/gallery');
    }
});

// Delete gallery item
router.post('/gallery/:id/delete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const galleryItem = await Gallery.findById(req.params.id);
        if (!galleryItem) {
            req.flash('error_msg', 'Gallery item not found');
            return res.redirect('/admin/gallery');
        }

        // Delete image file
        const imagePath = path.join(__dirname, '../public', galleryItem.image);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        await galleryItem.deleteOne();
        req.flash('success_msg', 'Gallery item deleted successfully');
        res.redirect('/admin/gallery');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error deleting gallery item');
        res.redirect('/admin/gallery');
    }
});

// Update user status (active/inactive)
router.post('/users/:id/status', ensureAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        await User.findByIdAndUpdate(req.params.id, { isActive: isActive === 'on' });
        req.flash('success_msg', 'User status updated successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error updating user status');
        res.redirect('/admin/users');
    }
});

// Delete user
router.post('/users/:id/delete', ensureAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/users');
        }
        
        // Prevent deleting admin users
        if (user.role === 'admin') {
            req.flash('error_msg', 'Cannot delete admin users');
            return res.redirect('/admin/users');
        }

        await User.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'User deleted successfully');
        res.redirect('/admin/users');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error deleting user');
        res.redirect('/admin/users');
    }
});

// Redirecting /admin/painting-requests to /admin/requests for consistency
router.get('/painting-requests', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.redirect('/admin/requests');
});

// Redirecting /admin/painting-requests/:id to /admin/requests/:id
router.get('/painting-requests/:id', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.redirect(`/admin/requests/${req.params.id}`);
});

// View painting requests
router.get('/requests', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const requests = await PaintingRequest.find()
            .populate('seller', 'name email')
            .sort({ createdAt: -1 });
        
        res.render('admin/painting-requests', {
            user: req.user,
            currentPath: req.path,
            title: 'Painting Requests',
            requests: requests,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error loading painting requests');
        res.redirect('/admin/dashboard');
    }
});

// View single painting request
router.get('/requests/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const request = await PaintingRequest.findById(req.params.id)
            .populate('seller', 'name email');
        
        if (!request) {
            req.flash('error_msg', 'Painting request not found');
            return res.redirect('/admin/requests');
        }
        
        res.render('admin/painting-request-detail', {
            user: req.user,
            title: 'Painting Request Detail',
            request: request,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading painting request details');
        res.redirect('/admin/requests');
    }
});

// Route to approve a painting request
router.post('/requests/:id/approve', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const requestId = req.params.id;
        // Find the painting request by ID
        const paintingRequest = await PaintingRequest.findById(requestId).populate('seller');
        if (!paintingRequest) {
            req.flash('error_msg', 'Painting request not found');
            return res.redirect('/admin/requests');
        }

        // Validate that the image file exists
        const imagePath = path.join(__dirname, '../public', paintingRequest.imageUrl);
        if (!fs.existsSync(imagePath)) {
            req.flash('error_msg', 'Image file not found. Cannot approve request.');
            return res.redirect('/admin/requests');
        }

        // Update the status to 'approved'
        paintingRequest.status = 'approved';
        await paintingRequest.save();

        // Add the painting to the gallery
        const newGalleryItem = new Gallery({
            image: paintingRequest.imageUrl,
            artistName: paintingRequest.title,
            description: paintingRequest.description,
            createdDate: paintingRequest.createdDate || new Date()
        });
        await newGalleryItem.save();

        req.flash('success_msg', 'Painting request approved successfully');
        res.redirect('/admin/requests');
    } catch (error) {
        console.error('Error approving painting request:', error);
        req.flash('error_msg', 'Error approving painting request: ' + error.message);
        res.redirect('/admin/requests');
    }
});

// Handle painting request (approve/reject)
router.post('/painting-requests/:id/handle', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        const request = await PaintingRequest.findById(req.params.id)
            .populate('seller', 'email name');
        
        if (!request) {
            req.flash('error_msg', 'Request not found');
            return res.redirect('/admin/painting-requests');
        }

        // If approving, validate that the image file exists
        if (status === 'approved') {
            const imagePath = path.join(__dirname, '../public', request.imageUrl);
            if (!fs.existsSync(imagePath)) {
                req.flash('error_msg', 'Image file not found. Cannot approve request.');
                return res.redirect('/admin/painting-requests');
            }
        }

        request.status = status;
        request.adminComment = adminComment;
        await request.save();

        // If approved, add to gallery
        if (status === 'approved') {
            const newGalleryItem = new Gallery({
                image: request.imageUrl,
                artistName: request.title,
                description: request.description,
                createdDate: request.createdDate || new Date()
            });
            await newGalleryItem.save();
        }

        // Send email notification to seller
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: request.seller.email,
                subject: `Your Painting Request has been ${status}`,
                html: `
                    <h2>Hello ${request.seller.name},</h2>
                    <p>Your painting request "${request.title}" has been <strong>${status}</strong>.</p>
                    ${adminComment ? `<p>Admin comment: ${adminComment}</p>` : ''}
                    ${status === 'approved' ? '<p>Your painting has been added to the gallery!</p>' : ''}
                    <p>Thank you for using our platform.</p>
                `
            };

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
            // Continue execution even if email fails
        }

        req.flash('success_msg', `Painting request ${status} successfully`);
        res.redirect('/admin/painting-requests');
    } catch (error) {
        console.error('Error handling painting request:', error);
        req.flash('error_msg', 'Error handling painting request: ' + error.message);
        res.redirect('/admin/painting-requests');
    }
});

// Product management
router.get('/products', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 }).populate('seller', 'name email');
        
        res.render('admin/products', {
            user: req.user,
            currentPath: req.path,
            title: 'Manage Products',
            products: products,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading products');
        res.redirect('/admin/dashboard');
    }
});

// Add product form
router.get('/products/add', ensureAuthenticated, ensureAdmin, (req, res) => {
    res.render('admin/add-product', {
        user: req.user,
        title: 'Add New Product',
        messages: {
            success: req.flash('success_msg'),
            error: req.flash('error_msg')
        }
    });
});

// Handle new product submission
router.post('/products/add', ensureAuthenticated, ensureAdmin, upload.single('image'), async (req, res) => {
    try {
        const { title, description, price, stock, artistName } = req.body;
        
        if (!req.file) {
            req.flash('error_msg', 'Please upload an image');
            return res.redirect('/admin/products/add');
        }

        // Make sure the file exists before continuing
        const filePath = path.join(__dirname, '../public', `/uploads/products/${req.file.filename}`);
        if (!fs.existsSync(filePath)) {
            req.flash('error_msg', 'Error saving image. Please try again.');
            return res.redirect('/admin/products/add');
        }

        const newProduct = new Product({
            seller: req.user._id,
            title,
            description,
            price: parseFloat(price),
            stock: parseInt(stock) || 1,
            artistName,
            image: `/uploads/products/${req.file.filename}`,
            status: 'approved' // Auto-approve admin-added products
        });

        await newProduct.save();
        req.flash('success_msg', 'Product added successfully');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error_msg', `Error adding product: ${error.message}`);
        res.redirect('/admin/products/add');
    }
});

// Product request approval
router.post('/products/:id/handle', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        const product = await Product.findById(req.params.id)
            .populate('seller', 'email name');
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }

        product.status = status;
        product.adminComment = adminComment || '';
        await product.save();

        // Send email notification to seller
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: product.seller.email,
                subject: `Your Product Request has been ${status}`,
                html: `
                    <h2>Hello ${product.seller.name},</h2>
                    <p>Your product "${product.title}" has been <strong>${status}</strong>.</p>
                    ${adminComment ? `<p>Admin comment: ${adminComment}</p>` : ''}
                    ${status === 'approved' ? '<p>Your product is now available in the shop!</p>' : ''}
                    <p>Thank you for using our platform.</p>
                `
            };

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
            // Continue execution even if email fails
        }

        req.flash('success_msg', `Product ${status} successfully`);
        res.redirect('/admin/products');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error handling product request');
        res.redirect('/admin/products');
    }
});

// Edit product page (admin)
router.get('/products/:id/edit', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        res.render('admin/edit-product', {
            user: req.user,
            title: 'Edit Product',
            product: product,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading product details');
        res.redirect('/admin/products');
    }
});

// Update product (admin)
router.post('/products/:id/update', ensureAuthenticated, ensureAdmin, productUpload.single('image'), async (req, res) => {
    try {
        const { title, artistName, description, price, stock, status } = req.body;
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        // Update basic details
        product.title = title;
        product.artistName = artistName;
        product.description = description;
        product.price = price;
        product.stock = stock;
        if (status) product.status = status;
        
        // Update image if provided
        if (req.file) {
            // Delete old image if exists and not a default image
            if (product.image && !product.image.includes('default')) {
                const oldImagePath = path.join(__dirname, '../public', product.image);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            product.image = `/uploads/products/${req.file.filename}`;
        }
        
        await product.save();
        
        req.flash('success_msg', 'Product updated successfully');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error updating product:', error);
        req.flash('error_msg', 'Error updating product: ' + error.message);
        res.redirect('/admin/products');
    }
});

// Delete product
router.post('/products/:id/delete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        // Delete image if exists and not a default image
        if (product.image && !product.image.includes('default')) {
            const imagePath = path.join(__dirname, '../public', product.image);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        await Product.findByIdAndDelete(req.params.id);
        
        req.flash('success_msg', 'Product deleted successfully');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error deleting product:', error);
        req.flash('error_msg', 'Error deleting product: ' + error.message);
        res.redirect('/admin/products');
    }
});

// View single product
router.get('/products/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('seller', 'name email');
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        res.render('admin/product-detail', {
            user: req.user,
            title: 'Product Detail',
            product: product,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        req.flash('error_msg', 'Error loading product details');
        res.redirect('/admin/products');
    }
});

// Approve product
router.post('/products/:id/approve', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        product.status = 'approved';
        await product.save();
        
        req.flash('success_msg', 'Product has been approved');
        res.redirect('/admin/products');
    } catch (error) {
        req.flash('error_msg', 'Error approving product');
        res.redirect('/admin/products');
    }
});

// Reject product
router.post('/products/:id/reject', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { adminComment } = req.body;
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/admin/products');
        }
        
        product.status = 'rejected';
        product.adminComment = adminComment;
        await product.save();
        
        req.flash('success_msg', 'Product has been rejected');
        res.redirect('/admin/products');
    } catch (error) {
        req.flash('error_msg', 'Error rejecting product');
        res.redirect('/admin/products');
    }
});

// Add new product (admin)
router.post('/products', ensureAuthenticated, ensureAdmin, productUpload.single('image'), async (req, res) => {
    try {
        const { title, artistName, description, price, stock } = req.body;
        
        // Validation
        if (!title || !artistName || !description || !price || !stock) {
            req.flash('error_msg', 'Please fill in all required fields');
            return res.redirect('/admin/products/add');
        }
        
        if (!req.file) {
            req.flash('error_msg', 'Please upload an image');
            return res.redirect('/admin/products/add');
        }
        
        // Create new product
        const newProduct = new Product({
            title,
            artistName,
            description,
            price,
            stock,
            image: `/uploads/products/${req.file.filename}`,
            status: 'approved' // Admin-added products are automatically approved
        });
        
        await newProduct.save();
        
        req.flash('success_msg', 'Product added successfully');
        res.redirect('/admin/products');
    } catch (error) {
        console.error('Error adding product:', error);
        req.flash('error_msg', 'Error adding product: ' + error.message);
        res.redirect('/admin/products/add');
    }
});

// Psychometric Tests Management

// Get all psychologist-reviewed tests
router.get('/psychometric-tests', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Group tests by status 
        const tests = await PsychometricTest.find()
            .populate('user', 'name email')
            .sort({ createdAt: -1 });
        
        const testsByStatus = {
            reviewed: tests.filter(test => test.status === 'reviewed' && (!test.adminQuote || !test.adminQuote.budget)),
            quoted: tests.filter(test => test.adminQuote && test.adminQuote.budget && 
                (!test.order || !test.order.approved) && 
                test.status !== 'order_placed'),
            approved: tests.filter(test => 
                (test.order && test.order.approved && test.order.status === 'placed') || 
                test.status === 'order_placed'),
            inProgress: tests.filter(test => test.order && test.order.status === 'in_progress'),
            completed: tests.filter(test => test.order && test.order.status === 'completed')
        };
        
        res.render('admin/psychometric-tests', {
            user: req.user,
            currentPath: req.path,
            testsByStatus,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading psychometric tests:', error);
        req.flash('error_msg', 'Error loading tests');
        res.redirect('/admin/dashboard');
    }
});

// View single psychometric test
router.get('/psychometric-test/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        // Create an object of questions for easier rendering
        const questions = {
            color: [
                { 
                    id: 1, 
                    text: "Which color palette do you naturally gravitate towards in your living space?",
                    options: {
                        a: "Warm, earthy tones (browns, oranges, yellows)",
                        b: "Cool, calming shades (blues, greens, purples)",
                        c: "Neutral, minimal colors (whites, grays, beiges)",
                        d: "Bold, vibrant colors (reds, bright blues, yellows)"
                    }
                },
                { 
                    id: 2, 
                    text: "How do colors affect your mood at home?",
                    options: {
                        a: "I prefer energizing, stimulating colors",
                        b: "I need calming, soothing colors to relax",
                        c: "I like a balance of both energizing and calming colors",
                        d: "Colors don't significantly affect my mood"
                    }
                },
                { 
                    id: 3, 
                    text: "Which color would you prefer for a feature wall in your living room?",
                    options: {
                        a: "A warm terracotta or mustard yellow",
                        b: "A cool teal or sage green",
                        c: "A neutral gray or taupe",
                        d: "A bold red or royal blue"
                    }
                },
                { 
                    id: 4, 
                    text: "What color furniture do you prefer?",
                    options: {
                        a: "Warm wood tones (cherry, oak)",
                        b: "Cool-toned materials (gray, blue fabrics)",
                        c: "Neutral pieces (white, beige, light gray)",
                        d: "Statement pieces with pops of color"
                    }
                },
                { 
                    id: 5, 
                    text: "How would you describe your ideal color scheme for a bedroom?",
                    options: {
                        a: "Warm and cozy with amber lighting",
                        b: "Cool and serene with soft blue tones",
                        c: "Neutral and minimal with clean whites",
                        d: "Dramatic with deep, rich colors"
                    }
                }
            ],
            style: [
                { 
                    id: 6, 
                    text: "What kind of furniture style appeals to you most?",
                    options: {
                        a: "Traditional with classic details",
                        b: "Modern and sleek",
                        c: "Minimalist with clean lines",
                        d: "Eclectic mix of different styles"
                    }
                },
                { 
                    id: 7, 
                    text: "How important is symmetry in your home decor?",
                    options: {
                        a: "Very important - I prefer perfect balance",
                        b: "Somewhat important - I like general balance",
                        c: "Not important - I prefer asymmetrical arrangements",
                        d: "I never really think about symmetry"
                    }
                },
                { 
                    id: 8, 
                    text: "Which description best matches your ideal living room?",
                    options: {
                        a: "Formal and elegant with traditional furniture",
                        b: "Contemporary with sleek, modern pieces",
                        c: "Minimal with only essential items",
                        d: "Eclectic with unique, mixed pieces"
                    }
                },
                { 
                    id: 9, 
                    text: "When decorating a space, what's your approach?",
                    options: {
                        a: "Follow established design rules",
                        b: "Use current trends as inspiration",
                        c: "Focus on functionality first",
                        d: "Go with what feels right to me"
                    }
                },
                { 
                    id: 10, 
                    text: "What's your preference for wall decor?",
                    options: {
                        a: "Traditional framed artwork and mirrors",
                        b: "Modern abstract art or photography",
                        c: "Minimal - few or no wall decorations",
                        d: "Unique items like tapestries, plants, or collections"
                    }
                }
            ],
            personality: [
                { 
                    id: 11, 
                    text: "How often do you rearrange or refresh your living space?",
                    options: {
                        a: "Rarely - I prefer consistency",
                        b: "Occasionally - maybe once a year",
                        c: "Frequently - I enjoy changing things up",
                        d: "Whenever the mood strikes me"
                    }
                },
                { 
                    id: 12, 
                    text: "When hosting guests, what's most important to you?",
                    options: {
                        a: "Creating an impressive, formal atmosphere",
                        b: "Ensuring everyone's comfort and convenience",
                        c: "Having an organized, clean space",
                        d: "Creating a fun, unique experience"
                    }
                },
                { 
                    id: 13, 
                    text: "How would you describe your approach to organization?",
                    options: {
                        a: "Everything has a specific place",
                        b: "Generally organized with some flexibility",
                        c: "Organized chaos - I know where things are",
                        d: "I don't focus much on organization"
                    }
                },
                { 
                    id: 14, 
                    text: "How do you feel about incorporating trends into your home?",
                    options: {
                        a: "I prefer timeless designs over trends",
                        b: "I selectively adopt trends that match my style",
                        c: "I enjoy following current trends",
                        d: "I follow my own instincts regardless of trends"
                    }
                },
                { 
                    id: 15, 
                    text: "What role does your home play in your life?",
                    options: {
                        a: "A sanctuary for peace and relaxation",
                        b: "A functional space for daily activities",
                        c: "A place to entertain friends and family",
                        d: "A creative expression of my personality"
                    }
                }
            ]
        };
        
        res.render('admin/psychometric-test-details', {
            user: req.user,
            currentPath: '/admin/psychometric-tests',
            test,
            questions,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading test details:', error);
        req.flash('error_msg', 'Error loading test details');
        res.redirect('/admin/psychometric-tests');
    }
});

router.post('/psychometric-test/:id/quote', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { budget, description } = req.body;
        
        // Validate inputs
        if (!budget || isNaN(parseFloat(budget)) || !description) {
            req.flash('error_msg', 'Valid budget and description are required');
            return res.redirect(`/admin/psychometric-test/${req.params.id}`);
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        // Update test with admin quote
        test.adminQuote = {
            budget: parseFloat(budget),
            description,
            submittedAt: new Date()
        };
        
        await test.save();
        
        // Send email notification to user about the quote
        try {
            const user = await User.findById(test.user);
            if (user && user.email) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Your Home Decor Quote is Ready!',
                    html: `
                        <h2>Hello ${user.name},</h2>
                        <p>We're excited to share that your home decor quote is now ready!</p>
                        <h3>Quote Details:</h3>
                        <p><strong>Budget:</strong> ₹${parseFloat(budget).toLocaleString('en-IN')}</p>
                        <p><strong>Description:</strong></p>
                        <p>${description}</p>
                        <p>Please log in to your account to review and approve this quote.</p>
                        <p>Thank you for choosing our service.</p>
                        <p>Regards,<br>The Home Decor Team</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Error sending email notification:', emailError);
            // Continue execution even if email fails
        }
        
        req.flash('success_msg', 'Quote submitted successfully');
        res.redirect('/admin/psychometric-tests');
        
    } catch (err) {
        console.error('Error submitting quote:', err);
        req.flash('error_msg', 'Error submitting quote');
        res.redirect('/admin/psychometric-tests');
    }
});

router.post('/psychometric-test/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || !['in_progress', 'completed'].includes(status)) {
            req.flash('error_msg', 'Invalid status');
            return res.redirect(`/admin/psychometric-test/${req.params.id}`);
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        // Update order status and add timestamp
        test.order.status = status;
        
        // Record timestamp for status change
        if (status === 'in_progress') {
            test.order.startedAt = new Date();
            test.status = 'in_progress'; // Update main test status
        } else if (status === 'completed') {
            test.order.completedAt = new Date();
            test.status = 'completed'; // Update main test status
        }
        
        await test.save();
        
        // Send email notification to user about status change
        try {
            const user = await User.findById(test.user);
            if (user && user.email) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: `Your Home Decor Project Status: ${status.replace('_', ' ').toUpperCase()}`,
                    html: `
                        <h2>Hello ${user.name},</h2>
                        <p>We have an update about your home decor project!</p>
                        <p>Your project status has been updated to <strong>${status.replace('_', ' ').toUpperCase()}</strong>.</p>
                        ${status === 'completed' ? '<p>Please log in to view the completed project details and share your feedback!</p>' : ''}
                        <p>Thank you for choosing our service.</p>
                        <p>Regards,<br>The Home Decor Team</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Error sending email notification:', emailError);
            // Continue execution even if email fails
        }
        
        req.flash('success_msg', `Order status updated to ${status}`);
        res.redirect('/admin/psychometric-tests');
        
    } catch (err) {
        console.error('Error updating order status:', err);
        req.flash('error_msg', 'Error updating order status'); 
        res.redirect('/admin/psychometric-tests');
    }
});

// Route for uploading project photos
router.post('/psychometric-test/:id/photos', ensureAuthenticated, ensureAdmin, upload.single('projectPhoto'), async (req, res) => {
    try {
        console.log('File upload attempt:', req.file);
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        if (req.file) {
            // Log the absolute file path to verify
            const absolutePath = path.join(__dirname, '..', 'uploads', req.file.filename);
            const relativePath = `/uploads/${req.file.filename}`;
            console.log('Absolute file path:', absolutePath);
            console.log('Exists:', fs.existsSync(absolutePath));
            console.log('Relative path for URL:', relativePath);
            
            const photoUrl = relativePath;
            const description = req.body.photoDescription || '';
            
            // Add to project photos collection
            if (!test.projectPhotos) {
                test.projectPhotos = [];
            }
            
            test.projectPhotos.push({
                url: photoUrl,
                description: description,
                uploadedAt: new Date()
            });
            
            // Also add to order photos if it's an order
            if (test.order) {
                if (!test.order.photos) {
                    test.order.photos = [];
                }
                test.order.photos.push(photoUrl);
            }
            
            await test.save();
            
            req.flash('success_msg', 'Photo uploaded successfully');
        } else {
            req.flash('error_msg', 'Please select a photo to upload');
        }
        
        res.redirect(`/admin/psychometric-test/${req.params.id}`);
    } catch (err) {
        console.error('Error uploading photo:', err);
        req.flash('error_msg', 'Error uploading photo');
        res.redirect(`/admin/psychometric-test/${req.params.id}`);
    }
});

// Route for deleting a project photo
router.post('/psychometric-test/:id/photos/:index/delete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        const photoIndex = parseInt(req.params.index);
        
        // Check if index is valid
        if (isNaN(photoIndex) || photoIndex < 0) {
            req.flash('error_msg', 'Invalid photo index');
            return res.redirect(`/admin/psychometric-test/${req.params.id}`);
        }
        
        // Handle projectPhotos collection
        if (test.projectPhotos && test.projectPhotos.length > photoIndex) {
            test.projectPhotos.splice(photoIndex, 1);
        }
        
        // Handle order photos
        if (test.order && test.order.photos && test.order.photos.length > photoIndex) {
            test.order.photos.splice(photoIndex, 1);
        }
        
        await test.save();
        
        req.flash('success_msg', 'Photo deleted successfully');
        res.redirect(`/admin/psychometric-test/${req.params.id}`);
        
    } catch (err) {
        console.error('Error deleting photo:', err);
        req.flash('error_msg', 'Error deleting photo');
        res.redirect(`/admin/psychometric-test/${req.params.id}`);
    }
});

// Orders management
router.get('/orders', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const orders = await Order.find()
            .sort({ createdAt: -1 })
            .populate('user', 'name email')
            .populate('items.product');
        
        res.render('admin/orders', {
            user: req.user,
            currentPath: req.path,
            title: 'Order Management',
            orders,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        req.flash('error_msg', 'Error loading orders');
        res.redirect('/admin/dashboard');
    }
});

// View single order
router.get('/orders/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.product');
        
        if (!order) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/admin/orders');
        }
        
        res.render('admin/order-detail', {
            user: req.user,
            currentPath: '/admin/orders',
            title: 'Order Detail',
            order,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading order details:', error);
        req.flash('error_msg', 'Error loading order details');
        res.redirect('/admin/orders');
    }
});

// Update order status
router.post('/orders/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id).populate('user', 'name email');
        
        if (!order) {
            req.flash('error_msg', 'Order not found');
            return res.redirect('/admin/orders');
        }
        
        // Update status
        order.orderStatus = status;
        await order.save();
        
        // Send email notification
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: order.user.email,
            subject: `Your Order #${order._id.toString().slice(-6)} Status Updated`,
            html: `
                <h2>Hello ${order.user.name},</h2>
                <p>Your order #${order._id.toString().slice(-6)} status has been updated to <strong>${status}</strong>.</p>
                <p>Thank you for shopping with us!</p>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        req.flash('success_msg', 'Order status updated successfully');
        res.redirect('/admin/orders');
    } catch (error) {
        console.error('Error updating order status:', error);
        req.flash('error_msg', 'Error updating order status');
        res.redirect('/admin/orders');
    }
});

// Sellers management
router.get('/sellers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const sellers = await User.find({ role: 'seller' });
        
        res.render('admin/sellers', {
            user: req.user,
            currentPath: req.path,
            title: 'Seller Management',
            sellers,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading sellers:', error);
        req.flash('error_msg', 'Error loading sellers');
        res.redirect('/admin/dashboard');
    }
});

// Route for completing an order and uploading photos
router.post('/psychometric-test/:id/complete', ensureAuthenticated, ensureAdmin, upload.array('photos', 5), async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        // Check if order exists and is placed
        if (!test.order || test.order.status !== 'placed') {
            req.flash('error_msg', 'Order is not yet placed or is already completed');
            return res.redirect(`/admin/psychometric-test/${req.params.id}`);
        }
        
        // Process uploaded photos
        const photoUrls = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                photoUrls.push(`/uploads/${file.filename}`);
            });
        }
        
        // Update order status and add photos
        test.order.status = 'completed';
        test.order.completedAt = new Date();
        test.order.photos = photoUrls;
        
        await test.save();
        
        // Send email notification to user about order completion
        try {
            const user = await User.findById(test.user);
            if (user && user.email) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD
                    }
                });
                
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: user.email,
                    subject: 'Your Home Decor Project is Complete!',
                    html: `
                        <h2>Hello ${user.name},</h2>
                        <p>We're excited to inform you that your home decor project has been completed!</p>
                        <p>Please log in to your account to view photos of the completed work and provide your feedback.</p>
                        <p>Thank you for choosing our service.</p>
                        <p>Regards,<br>The Home Decor Team</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
            }
        } catch (emailError) {
            console.error('Error sending email notification:', emailError);
            // Continue execution even if email fails
        }
        
        req.flash('success_msg', 'Order marked as completed and photos uploaded successfully');
        res.redirect('/admin/psychometric-tests');
        
    } catch (err) {
        console.error('Error completing order:', err);
        req.flash('error_msg', 'Error completing order');
        res.redirect('/admin/psychometric-tests');
    }
});

// Route for toggling public visibility of completed projects
router.post('/psychometric-test/:id/public-toggle', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { publicDisplay, publicDescription } = req.body;
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            req.flash('error_msg', 'Test not found');
            return res.redirect('/admin/psychometric-tests');
        }
        
        // Check if order is completed
        if (!test.order || test.order.status !== 'completed') {
            req.flash('error_msg', 'Only completed orders can be made public');
            return res.redirect(`/admin/psychometric-test/${req.params.id}`);
        }
        
        // Update public display settings
        test.order.publicDisplay = publicDisplay === 'on';
        
        // Update public description if provided
        if (publicDescription) {
            test.order.publicDescription = publicDescription;
        }
        
        await test.save();
        
        req.flash('success_msg', 'Public display settings updated successfully');
        res.redirect(`/admin/psychometric-test/${req.params.id}`);
        
    } catch (err) {
        console.error('Error updating public display settings:', err);
        req.flash('error_msg', 'Error updating public display settings');
        res.redirect('/admin/psychometric-tests');
    }
});

// AI Lead Management System Routes

// Lead dashboard
router.get('/leads', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Calculate lead metrics
        const totalLeads = await Lead.countDocuments();
        const highPotentialLeads = await Lead.countDocuments({ 
            $or: [
                { aiScore: { $gte: 80 } },
                { interestLevel: 'very_high' },
                { conversionProbability: { $gte: 80 } }
            ]
        });
        const assignedLeads = await Lead.countDocuments({ assignedSeller: { $ne: null } });
        const convertedLeads = await Lead.countDocuments({ status: 'converted' });
        
        // Get lead source metrics
        const leadsBySource = await Lead.aggregate([
            { $group: {
                _id: "$source",
                count: { $sum: 1 },
                avgScore: { $avg: "$aiScore" }
            }},
            { $sort: { count: -1 } }
        ]);
        
        // Get high priority leads
        const highPriorityLeads = await Lead.find({
            $or: [
                { priorityScore: { $gte: 80 } },
                { aiScore: { $gte: 80 } },
                { interestLevel: 'very_high' },
                { conversionProbability: { $gte: 80 } }
            ]
        })
        .sort({ priorityScore: -1, aiScore: -1 })
        .limit(5)
        .populate('user', 'name email')
        .populate('assignedSeller', 'name email');
        
        // Get recent leads
        const recentLeads = await Lead.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('user', 'name email')
            .populate('assignedSeller', 'name email');
            
        // Get leads needing follow-up today
        const followUpLeads = await AILeadService.getLeadsNeedingFollowUp();
        
        // Get stale leads (not contacted for 14+ days)
        const staleLeads = await AILeadService.identifyStaleLeads(14);
        
        res.render('admin/leads', {
            user: req.user,
            currentPath: req.path,
            title: 'AI Lead Management',
            metrics: {
                totalLeads,
                highPotentialLeads,
                assignedLeads,
                convertedLeads,
                leadsBySource
            },
            highPriorityLeads,
            recentLeads,
            followUpLeads,
            staleLeads,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading lead management dashboard:', error);
        req.flash('error_msg', 'Error loading lead management dashboard');
        res.redirect('/admin/dashboard');
    }
});

// View All Leads with Filtering
router.get('/leads/all', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        
        // Build filter query
        const query = {};
        const filterQuery = { ...req.query };
        
        // Apply filters
        if (filterQuery.source) query.source = filterQuery.source;
        if (filterQuery.interestLevel) query.interestLevel = filterQuery.interestLevel;
        if (filterQuery.status) query.status = filterQuery.status;
        
        // Handle seller filter
        if (filterQuery.sellerId) {
            if (filterQuery.sellerId === 'unassigned') {
                query.assignedSeller = null;
            } else {
                query.assignedSeller = filterQuery.sellerId;
            }
        }
        
        // Handle date range filter
        if (filterQuery.dateRange) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (filterQuery.dateRange === 'today') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                query.createdAt = { $gte: today, $lt: tomorrow };
            } else if (filterQuery.dateRange === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                query.createdAt = { $gte: yesterday, $lt: today };
            } else if (filterQuery.dateRange === 'lastWeek') {
                const lastWeek = new Date(today);
                lastWeek.setDate(lastWeek.getDate() - 7);
                query.createdAt = { $gte: lastWeek };
            } else if (filterQuery.dateRange === 'lastMonth') {
                const lastMonth = new Date(today);
                lastMonth.setDate(lastMonth.getDate() - 30);
                query.createdAt = { $gte: lastMonth };
            } else if (filterQuery.dateRange === 'lastQuarter') {
                const lastQuarter = new Date(today);
                lastQuarter.setDate(lastQuarter.getDate() - 90);
                query.createdAt = { $gte: lastQuarter };
            }
        }
        
        // Handle AI score filter
        if (filterQuery.minScore || filterQuery.maxScore) {
            query.aiScore = {};
            if (filterQuery.minScore) query.aiScore.$gte = parseInt(filterQuery.minScore);
            if (filterQuery.maxScore) query.aiScore.$lte = parseInt(filterQuery.maxScore);
        }
        
        // Handle search filter
        if (filterQuery.search) {
            const userIds = await User.find({
                $or: [
                    { name: { $regex: filterQuery.search, $options: 'i' } },
                    { email: { $regex: filterQuery.search, $options: 'i' } }
                ]
            }).distinct('_id');
            
            query.user = { $in: userIds };
        }
        
        // Sort options
        let sortOption = { createdAt: -1 }; // Default sort by newest
        if (filterQuery.sortBy) {
            switch (filterQuery.sortBy) {
                case 'oldest':
                    sortOption = { createdAt: 1 };
                    break;
                case 'scoreDesc':
                    sortOption = { aiScore: -1 };
                    break;
                case 'scoreAsc':
                    sortOption = { aiScore: 1 };
                    break;
                case 'conversionDesc':
                    sortOption = { conversionProbability: -1 };
                    break;
            }
        }
        
        // Get distinct values for filters
        const sources = await Lead.distinct('source');
        const interestLevels = await Lead.distinct('interestLevel');
        const statuses = await Lead.distinct('status');
        
        // Get sellers for the filter dropdown
        const sellers = await User.find({ role: 'seller', isActive: true }).select('name email');
        
        // Get total leads count for pagination
        const totalLeads = await Lead.countDocuments(query);
        const totalPages = Math.ceil(totalLeads / limit);
        
        // Get leads with pagination
        const leads = await Lead.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email')
            .populate('assignedSeller', 'name email');
        
        res.render('admin/leads-all', {
            user: req.user,
            currentPath: req.path,
            title: 'All Leads',
            leads,
            sellers,
            filters: {
                sources,
                interestLevels,
                statuses
            },
            query: filterQuery,
            pagination: {
                page,
                limit,
                totalPages
            },
            totalLeads,
            currentPage: page,
            totalPages,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading leads:', error);
        req.flash('error_msg', 'Error loading leads');
        res.redirect('/admin/leads');
    }
});

// View Single Lead Details
router.get('/leads/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .populate('user')
            .populate('assignedSeller', 'name email');
        
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }

        // Count user orders
        const userOrderCount = lead.user ?
            await Order.countDocuments({ user: lead.user._id }) :
            0;

        // Get user psychometric tests
        const userTests = lead.user ?
            await PsychometricTest.find({ user: lead.user._id }).sort({ createdAt: -1 }) :
            [];

        // Get user custom requests
        const userRequests = lead.user ?
            await PaintingRequest.find({ user: lead.user._id }).sort({ createdAt: -1 }) :
            [];
            
        // Get recent user activities
        const userActivities = lead.user ?
            await UserActivity.find({ user: lead.user._id })
                .sort({ createdAt: -1 })
                .limit(10) :
            [];
            
        // Get recommended actions for this lead
        let recommendedActions = [];
        
        // Base recommendations on lead status and engagement
        if (!lead.assignedSeller && lead.priorityScore >= 70) {
            recommendedActions.push({
                action: 'Assign to seller',
                reason: 'High priority lead needs assignment'
            });
        }
        
        if (lead.status === 'new' && lead.aiScore >= 60) {
            recommendedActions.push({
                action: 'Mark as contacted',
                reason: 'Lead has high AI score but hasn\'t been contacted'
            });
        }
        
        if (lead.status === 'contacted' && !lead.nextFollowUp) {
            recommendedActions.push({
                action: 'Set follow-up reminder',
                reason: 'Lead has been contacted but no follow-up is scheduled'
            });
        }
        
        if (lead.engagementMetrics && 
            lead.engagementMetrics.cartInteractions > 0 && 
            lead.status !== 'converted') {
            recommendedActions.push({
                action: 'Offer incentive',
                reason: 'Lead has cart activity but hasn\'t converted'
            });
        }

        res.render('admin/lead-detail', {
            user: req.user,
            title: 'Lead Details',
            lead,
            userOrderCount,
            userTests,
            userRequests,
            userActivities,
            recommendedActions,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading lead details:', error);
        req.flash('error_msg', 'Error loading lead details');
        res.redirect('/admin/leads');
    }
});

// Update Lead Status
router.post('/leads/:id/status', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        const oldStatus = lead.status;
        lead.status = req.body.status;
        
        // If status changing to contacted, update last contact date
        if (req.body.status === 'contacted' && oldStatus !== 'contacted') {
            lead.lastContact = Date.now();
        }
        
        // Add note if provided
        if (req.body.note && req.body.note.trim() !== '') {
            lead.notes.push({
                text: `Status changed from ${oldStatus} to ${req.body.status}: ${req.body.note}`,
                addedBy: req.user._id
            });
        } else {
            lead.notes.push({
                text: `Status changed from ${oldStatus} to ${req.body.status}`,
                addedBy: req.user._id
            });
        }
        
        await lead.save();
        
        // Update seller performance if lead is assigned and status is important
        if (lead.assignedSeller && ['qualified', 'proposal', 'converted'].includes(req.body.status)) {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            let performance = await SellerPerformance.findOne({
                seller: lead.assignedSeller,
                period: 'monthly',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!performance) {
                performance = new SellerPerformance({
                    seller: lead.assignedSeller,
                    period: 'monthly',
                    startDate: monthStart,
                    endDate: monthEnd,
                    metrics: {
                        leadsAssigned: 0,
                        leadsContacted: 0,
                        leadsQualified: 0,
                        proposalsSent: 0,
                        salesClosed: 0
                    }
                });
            }
            
            // Update metrics based on new status
            if (req.body.status === 'qualified' && oldStatus !== 'qualified') {
                performance.metrics.leadsQualified++;
            } else if (req.body.status === 'proposal' && oldStatus !== 'proposal') {
                performance.metrics.proposalsSent++;
            } else if (req.body.status === 'converted' && oldStatus !== 'converted') {
                performance.metrics.salesClosed++;
            }
            
            await performance.save();
        }
        
        req.flash('success_msg', 'Lead status updated successfully');
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error updating lead status:', error);
        req.flash('error_msg', 'Error updating lead status');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Mark Lead as Contacted
router.post('/leads/:id/mark-contacted', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads/all');
        }
        
        lead.status = 'contacted';
        lead.lastContact = Date.now();
        lead.notes.push({
            text: 'Marked as contacted',
            addedBy: req.user._id
        });
        
        await lead.save();
        
        // Update seller performance if lead is assigned
        if (lead.assignedSeller) {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            let performance = await SellerPerformance.findOne({
                seller: lead.assignedSeller,
                period: 'monthly',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (performance) {
                performance.metrics.leadsContacted++;
                await performance.save();
            }
        }
        
        req.flash('success_msg', 'Lead marked as contacted');
        res.redirect('/admin/leads/all');
    } catch (error) {
        console.error('Error marking lead as contacted:', error);
        req.flash('error_msg', 'Error marking lead as contacted');
        res.redirect('/admin/leads/all');
    }
});

// Assign Seller to Lead
router.post('/leads/:id/assign', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        const oldSellerId = lead.assignedSeller ? lead.assignedSeller.toString() : null;
        lead.assignedSeller = req.body.sellerId || null;
        
        // Add note about assignment
        if (oldSellerId !== (req.body.sellerId || null)) {
            const newSellerInfo = req.body.sellerId ? 
                await User.findById(req.body.sellerId).select('name') : null;
            
            if (req.body.note && req.body.note.trim() !== '') {
                lead.notes.push({
                    text: `Assigned to ${newSellerInfo ? newSellerInfo.name : 'no one'}: ${req.body.note}`,
                    addedBy: req.user._id
                });
            } else {
                lead.notes.push({
                    text: `Assigned to ${newSellerInfo ? newSellerInfo.name : 'no one'}`,
                    addedBy: req.user._id
                });
            }
        }
        
        await lead.save();
        
        // Update seller performance metrics
        if (req.body.sellerId) {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            
            let performance = await SellerPerformance.findOne({
                seller: req.body.sellerId,
                period: 'monthly',
                startDate: { $lte: now },
                endDate: { $gte: now }
            });
            
            if (!performance) {
                performance = new SellerPerformance({
                    seller: req.body.sellerId,
                    period: 'monthly',
                    startDate: monthStart,
                    endDate: monthEnd,
                    metrics: {
                        leadsAssigned: 1,
                        leadsContacted: 0,
                        leadsQualified: 0,
                        proposalsSent: 0,
                        salesClosed: 0
                    }
                });
            } else {
                performance.metrics.leadsAssigned++;
            }
            
            await performance.save();
        }
        
        req.flash('success_msg', 'Lead assignment updated successfully');
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error assigning seller to lead:', error);
        req.flash('error_msg', 'Error assigning seller to lead');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Add Note to Lead
router.post('/leads/:id/notes', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        if (req.body.noteText && req.body.noteText.trim() !== '') {
            lead.notes.push({
                text: req.body.noteText,
                addedBy: req.user._id
            });
            
            await lead.save();
            req.flash('success_msg', 'Note added successfully');
        } else {
            req.flash('error_msg', 'Note cannot be empty');
        }
        
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error adding note to lead:', error);
        req.flash('error_msg', 'Error adding note');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Set Follow-up Date
router.post('/leads/:id/follow-up', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        lead.nextFollowUp = req.body.nextFollowUp || null;
        
        await lead.save();
        req.flash('success_msg', 'Follow-up date updated successfully');
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error setting follow-up date:', error);
        req.flash('error_msg', 'Error setting follow-up date');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Delete Lead
router.post('/leads/:id/delete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);
        
        req.flash('success_msg', 'Lead deleted successfully');
        res.redirect('/admin/leads');
    } catch (error) {
        console.error('Error deleting lead:', error);
        req.flash('error_msg', 'Error deleting lead');
        res.redirect('/admin/leads');
    }
});

// Seller Performance Dashboard
router.get('/seller-performance', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const period = req.query.period || 'monthly';
        let periodText, startDate, endDate;
        
        // Set date range based on period
        const now = new Date();
        
        switch (period) {
            case 'weekly':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                endDate = new Date(now);
                periodText = 'Weekly (Last 7 days)';
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                periodText = `Monthly (${startDate.toLocaleString('default', { month: 'long' })})`;
                break;
            case 'quarterly':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
                periodText = `Quarterly (Q${quarter + 1})`;
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                periodText = `Yearly (${now.getFullYear()})`;
                break;
        }
        
        // Get performance metrics for all sellers in the period
        const sellerPerformance = await SellerPerformance.find({
            period,
            startDate: { $gte: startDate },
            endDate: { $lte: endDate }
        }).populate('seller', 'name email');
        
        // Get top performers
        const topPerformers = [...sellerPerformance]
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .slice(0, 5);
        
        // Calculate overall metrics
        const activeSellers = await User.countDocuments({ role: 'seller', isActive: true });
        
        let totalRevenue = 0;
        let totalConversionRate = 0;
        let totalOrderValue = 0;
        let validPerformanceCount = 0;
        
        sellerPerformance.forEach(perf => {
            if (perf.metrics.totalRevenue > 0) {
                totalRevenue += perf.metrics.totalRevenue;
                totalOrderValue += perf.metrics.averageOrderValue || 0;
                totalConversionRate += perf.metrics.conversionRate || 0;
                validPerformanceCount++;
            }
        });
        
        const overallMetrics = {
            totalRevenue: totalRevenue,
            avgConversionRate: validPerformanceCount > 0 ? totalConversionRate / validPerformanceCount : 0,
            avgOrderValue: validPerformanceCount > 0 ? totalOrderValue / validPerformanceCount : 0,
            activeSellers
        };
        
        // Get AI-generated insights from all seller performance records
        const aiInsights = [];
        sellerPerformance.forEach(perf => {
            if (perf.aiInsights && perf.aiInsights.length > 0) {
                aiInsights.push(...perf.aiInsights);
            }
        });
        
        // Get most common improvement areas
        const improvementAreasMap = new Map();
        sellerPerformance.forEach(perf => {
            if (perf.improvementAreas && perf.improvementAreas.length > 0) {
                perf.improvementAreas.forEach(area => {
                    improvementAreasMap.set(area, (improvementAreasMap.get(area) || 0) + 1);
                });
            }
        });
        
        const areasForImprovement = [...improvementAreasMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(entry => entry[0]);
        
        res.render('admin/seller-performance', {
            user: req.user,
            currentPath: req.path,
            title: 'Seller Performance',
            period,
            periodText,
            sellerPerformance,
            topPerformers,
            overallMetrics,
            aiInsights,
            areasForImprovement,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading seller performance:', error);
        req.flash('error_msg', 'Error loading seller performance data');
        res.redirect('/admin/dashboard');
    }
});

// View Individual Seller Performance
router.get('/seller-performance/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const seller = await User.findById(req.params.id);
        if (!seller || seller.role !== 'seller') {
            req.flash('error_msg', 'Seller not found');
            return res.redirect('/admin/seller-performance');
        }
        
        const period = req.query.period || 'monthly';
        let periodText, startDate, endDate;
        
        // Set date range based on period
        const now = new Date();
        
        switch (period) {
            case 'weekly':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                endDate = new Date(now);
                periodText = 'Weekly (Last 7 days)';
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                periodText = `Monthly (${startDate.toLocaleString('default', { month: 'long' })})`;
                break;
            case 'quarterly':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
                periodText = `Quarterly (Q${quarter + 1})`;
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                periodText = `Yearly (${now.getFullYear()})`;
                break;
        }
        
        // Get seller's performance for the period
        const performance = await SellerPerformance.findOne({
            seller: req.params.id,
            period,
            startDate: { $gte: startDate },
            endDate: { $lte: endDate }
        });
        
        // Get active leads assigned to the seller
        const activeLeads = await Lead.find({
            assignedSeller: req.params.id,
            status: { $nin: ['converted', 'lost'] }
        })
        .sort({ aiScore: -1 })
        .populate('user', 'name email');
        
        // Get converted leads by the seller
        const convertedLeads = await Lead.find({
            assignedSeller: req.params.id,
            status: 'converted'
        })
        .sort({ updatedAt: -1 })
        .populate('user', 'name email');
        
        // Get orders handled by the seller (if applicable to your system)
        const orders = await Order.find({
            assignedSeller: req.params.id,
            orderStatus: { $nin: ['cancelled'] }
        })
        .sort({ createdAt: -1 })
        .populate('user', 'name email');
        
        res.render('admin/seller-performance-detail', {
            user: req.user,
            currentPath: req.path,
            title: `Performance - ${seller.name}`,
            seller,
            period,
            periodText,
            performance,
            activeLeads,
            convertedLeads,
            orders,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading seller performance details:', error);
        req.flash('error_msg', 'Error loading seller performance details');
        res.redirect('/admin/seller-performance');
    }
});

// Export Seller Performance Reports
router.get('/seller-performance/reports', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const period = req.query.period || 'monthly';
        let periodText, startDate, endDate;
        
        // Set date range based on period
        const now = new Date();
        
        switch (period) {
            case 'weekly':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                endDate = new Date(now);
                periodText = 'Weekly (Last 7 days)';
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                periodText = `Monthly (${startDate.toLocaleString('default', { month: 'long' })})`;
                break;
            case 'quarterly':
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
                periodText = `Quarterly (Q${quarter + 1})`;
                break;
            case 'yearly':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                periodText = `Yearly (${now.getFullYear()})`;
                break;
        }
        
        // Get all performance records for the period
        const performances = await SellerPerformance.find({
            period,
            startDate: { $gte: startDate },
            endDate: { $lte: endDate }
        }).populate('seller', 'name email');
        
        // Process report format (CSV, PDF, etc.)
        // For simplicity, we'll redirect to the performance dashboard
        // In a real implementation, you'd generate a downloadable report here
        
        req.flash('success_msg', 'Report generated successfully');
        res.redirect('/admin/seller-performance');
    } catch (error) {
        console.error('Error generating performance report:', error);
        req.flash('error_msg', 'Error generating performance report');
        res.redirect('/admin/seller-performance');
    }
});

// AI Lead Management Section - Add this near the other admin routes
// User Activity Analysis
router.get('/user-activity', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const UserActivity = require('../models/UserActivity');
        const User = require('../models/User');
        const UserBehaviorAnalyzer = require('../services/userBehaviorAnalyzer');
        
        // Get users with most activity
        const userActivityCounts = await UserActivity.aggregate([
            { $group: { _id: '$user', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 }
        ]);
        
        // Get user details
        const userIds = userActivityCounts.map(item => item._id);
        const users = await User.find({ _id: { $in: userIds } });
        
        // Get top potential users
        const topPotentialUsers = await UserBehaviorAnalyzer.getTopPotentialUsers(10);
        
        // Get activity statistics
        const totalActivities = await UserActivity.countDocuments();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayActivities = await UserActivity.countDocuments({ createdAt: { $gte: todayStart } });
        
        // Get recent activities
        const recentActivities = await UserActivity.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('user', 'name email')
            .populate({
                path: 'targetId',
                model: 'Product',
                select: 'title price'
            });
            
        // Get activity types distribution
        const activityTypeDistribution = await UserActivity.aggregate([
            { $group: { _id: '$activityType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.render('admin/user-activity', {
            user: req.user,
            currentPath: req.path,
            userActivityCounts: userActivityCounts.map(item => {
                const userObj = users.find(u => u._id.toString() === item._id.toString());
                return {
                    user: userObj || { name: 'Unknown User', email: 'unknown' },
                    count: item.count
                };
            }),
            topPotentialUsers,
            stats: {
                totalActivities,
                todayActivities,
                activityTypeDistribution
            },
            recentActivities
        });
    } catch (err) {
        console.error('Error loading user activity dashboard:', err);
        req.flash('error_msg', 'Error loading user activity dashboard');
        res.redirect('/admin/dashboard');
    }
});

// User Activity Detail View
router.get('/user-activity/:userId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const UserActivity = require('../models/UserActivity');
        const User = require('../models/User');
        const UserBehaviorAnalyzer = require('../services/userBehaviorAnalyzer');
        const Product = require('../models/Product');
        const Order = require('../models/Order');
        
        const userId = req.params.userId;
        
        // Get user details
        const user = await User.findById(userId);
        
        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/admin/user-activity');
        }
        
        // Get activity timeframe from query or default to 30 days
        const timeframe = parseInt(req.query.timeframe) || 30;
        
        // Get user behavior analysis
        const analysis = await UserBehaviorAnalyzer.analyzeUserBehavior(userId, { timeframe });
        
        // Get recent activities
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);
        
        const activities = await UserActivity.find({
            user: userId,
            createdAt: { $gte: startDate, $lte: endDate }
        })
        .sort({ createdAt: -1 })
        .limit(100);
        
        // Get product details for viewed products
        const productIds = analysis.topProducts.map(p => p.id);
        const products = await Product.find({ _id: { $in: productIds } });
        
        // Get user's orders
        const orders = await Order.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(10);
        
        // Get activity type distribution
        const activityTypeCounts = {};
        activities.forEach(activity => {
            activityTypeCounts[activity.activityType] = (activityTypeCounts[activity.activityType] || 0) + 1;
        });
        
        // Get user's lead status
        const Lead = require('../models/Lead');
        const lead = await Lead.findOne({ user: userId })
            .populate('assignedSeller', 'name email');
        
        res.render('admin/user-activity-detail', {
            user: req.user,
            currentPath: req.path,
            targetUser: user,
            analysis,
            activities,
            products,
            orders,
            activityTypeCounts,
            lead,
            timeframe
        });
    } catch (err) {
        console.error('Error loading user activity details:', err);
        req.flash('error_msg', 'Error loading user activity details');
        res.redirect('/admin/user-activity');
    }
});

// User Activity Data API - for charts
router.get('/api/user-activity/:userId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const UserActivity = require('../models/UserActivity');
        const userId = req.params.userId;
        const timeframe = parseInt(req.query.timeframe) || 30;
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);
        
        // Get daily activity counts
        const dailyActivity = await UserActivity.aggregate([
            {
                $match: {
                    user: require('mongoose').Types.ObjectId(userId),
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: { 
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Get activity by type
        const activityByType = await UserActivity.aggregate([
            {
                $match: {
                    user: require('mongoose').Types.ObjectId(userId),
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$activityType',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // Get session durations
        const sessionDurations = await UserActivity.aggregate([
            {
                $match: {
                    user: require('mongoose').Types.ObjectId(userId),
                    createdAt: { $gte: startDate, $lte: endDate },
                    timeSpent: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: '$session',
                    totalDuration: { $sum: '$timeSpent' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { totalDuration: -1 } },
            { $limit: 20 }
        ]);
        
        res.json({
            dailyActivity,
            activityByType,
            sessionDurations
        });
    } catch (err) {
        console.error('Error fetching user activity data:', err);
        res.status(500).json({ error: 'Error fetching user activity data' });
    }
});

/**
 * Lead Summary Route
 * Displays summarized lead performance with email tracking metrics
 */
router.get('/lead-summary', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Get timeframe from query or default to 30 days
        const timeframe = req.query.timeframe ? parseInt(req.query.timeframe) : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - timeframe);

        // Get all leads within timeframe
        const leads = await Lead.find({
            createdAt: { $gte: startDate }
        }).populate('user').populate('assignedSeller');

        // Calculate summary metrics
        const summary = {
            totalLeads: leads.length,
            highPotentialLeads: leads.filter(lead => lead.aiScore >= 70).length,
            conversionRate: leads.length > 0 
                ? Math.round((leads.filter(lead => lead.status === 'converted').length / leads.length) * 100) 
                : 0,
            averageScore: leads.length > 0 
                ? Math.round(leads.reduce((sum, lead) => sum + lead.aiScore, 0) / leads.length) 
                : 0
        };

        // Calculate email metrics
        const leadsWithEmails = leads.filter(lead => 
            lead.emailTracking && lead.emailTracking.lastSent
        );
        
        const totalEmails = leadsWithEmails.length;
        const totalOpens = leadsWithEmails.filter(lead => 
            lead.emailTracking.opens && lead.emailTracking.opens.length > 0
        ).length;
        
        const totalClicks = leadsWithEmails.filter(lead => 
            lead.emailTracking.clicks && lead.emailTracking.clicks.length > 0
        ).length;
        
        const convertedAfterEmail = leadsWithEmails.filter(lead => 
            lead.status === 'converted' && 
            lead.emailTracking.lastSent < lead.lastContact
        ).length;

        const emailMetrics = {
            totalEmails,
            totalOpens,
            totalClicks,
            openRate: totalEmails > 0 ? Math.round((totalOpens / totalEmails) * 100) : 0,
            clickRate: totalOpens > 0 ? Math.round((totalClicks / totalOpens) * 100) : 0,
            conversionCount: convertedAfterEmail,
            conversionRate: totalEmails > 0 ? Math.round((convertedAfterEmail / totalEmails) * 100) : 0
        };

        // Get lead distribution by score 
        const scoreDist = {
            low: leads.filter(lead => lead.aiScore < 31).length,
            medium: leads.filter(lead => lead.aiScore >= 31 && lead.aiScore <= 60).length,
            high: leads.filter(lead => lead.aiScore >= 61 && lead.aiScore <= 80).length,
            veryHigh: leads.filter(lead => lead.aiScore > 80).length
        };

        // Get lead distribution by status
        const statusDist = {
            new: leads.filter(lead => lead.status === 'new').length,
            contacted: leads.filter(lead => lead.status === 'contacted').length,
            qualified: leads.filter(lead => lead.status === 'qualified').length,
            proposal: leads.filter(lead => lead.status === 'proposal').length,
            converted: leads.filter(lead => lead.status === 'converted').length,
            lost: leads.filter(lead => lead.status === 'lost').length
        };

        // Create behavior summary by interest level
        const interestLevels = ['very_high', 'high', 'medium', 'low', 'very_low'];
        const behaviorSummary = interestLevels.map(level => {
            const levelLeads = leads.filter(lead => lead.interestLevel === level);
            
            // Skip if no leads in this category
            if (levelLeads.length === 0) return null;
            
            // Get all behavior patterns for this level
            const allPatterns = levelLeads.flatMap(lead => 
                lead.behaviorPatterns?.map(p => p.type) || []
            );
            
            // Count pattern frequency
            const patternCounts = {};
            allPatterns.forEach(pattern => {
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            });
            
            // Sort patterns by frequency and get top 3
            const commonPatterns = Object.entries(patternCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([pattern]) => pattern.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
            
            // Get recommended actions
            const allActions = levelLeads.flatMap(lead => lead.recommendedActions || []);
            const actionCounts = {};
            allActions.forEach(action => {
                actionCounts[action] = (actionCounts[action] || 0) + 1;
            });
            
            // Get top 3 recommended actions
            const recommendedActions = Object.entries(actionCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([action]) => action);
            
            // Calculate email open rate for this level
            const levelEmailsSent = levelLeads.filter(lead => 
                lead.emailTracking && lead.emailTracking.lastSent
            ).length;
            
            const levelEmailsOpened = levelLeads.filter(lead => 
                lead.emailTracking && lead.emailTracking.opens && lead.emailTracking.opens.length > 0
            ).length;
            
            const emailOpenRate = levelEmailsSent > 0 
                ? Math.round((levelEmailsOpened / levelEmailsSent) * 100) 
                : 0;
            
            return {
                interestLevel: level,
                count: levelLeads.length,
                averageScore: Math.round(levelLeads.reduce((sum, lead) => sum + lead.aiScore, 0) / levelLeads.length),
                commonPatterns: commonPatterns.length > 0 ? commonPatterns : ['No common patterns'],
                recommendedActions: recommendedActions.length > 0 ? recommendedActions : ['No recommendations'],
                emailOpenRate
            };
        }).filter(Boolean); // Remove null entries

        // Get recent email interactions
        const recentEmails = await Promise.all(
            leads
                .filter(lead => lead.emailTracking && lead.emailTracking.lastSent)
                .sort((a, b) => new Date(b.emailTracking.lastSent) - new Date(a.emailTracking.lastSent))
                .slice(0, 10)
                .map(async lead => {
                    const opened = lead.emailTracking.opens && lead.emailTracking.opens.length > 0;
                    const firstOpenDate = opened ? lead.emailTracking.opens[0].timestamp : null;
                    const openCount = lead.emailTracking.opens ? lead.emailTracking.opens.length : 0;
                    const clickCount = lead.emailTracking.clicks ? lead.emailTracking.clicks.length : 0;
                    
                    return {
                        userId: lead.user._id,
                        userName: lead.user.name,
                        sentDate: lead.emailTracking.lastSent,
                        opened,
                        firstOpenDate,
                        openCount,
                        clickCount,
                        leadScore: lead.aiScore
                    };
                })
        );

        res.render('admin/lead-summary', {
            title: 'Lead Performance Summary',
            user: req.user,
            timeframe,
            summary,
            emailMetrics,
            scoreDist,
            statusDist,
            behaviorSummary,
            recentEmails
        });
    } catch (error) {
        console.error('Error loading lead summary:', error);
        req.flash('error_msg', 'Error loading lead summary');
        res.redirect('/admin/dashboard');
    }
});

/**
 * Email Campaign Route
 * Create and send email campaigns to leads
 */
router.post('/email-campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const {
            campaignName,
            targetLeads,
            minScore,
            maxScore,
            leadStatus,
            interestLevel,
            emailSubject,
            emailContent,
            includeTracking,
            scheduleEmail,
            scheduledDate
        } = req.body;

        // Build query for target leads
        let query = {};
        
        // Filter based on target selection
        if (targetLeads === 'high') {
            query.aiScore = { $gte: 70 };
        } else if (targetLeads === 'medium') {
            query.aiScore = { $gte: 40, $lt: 70 };
        } else if (targetLeads === 'low') {
            query.aiScore = { $lt: 40 };
        } else if (targetLeads === 'custom') {
            if (minScore) query.aiScore = { ...query.aiScore, $gte: parseInt(minScore) };
            if (maxScore) query.aiScore = { ...query.aiScore, $lte: parseInt(maxScore) };
            if (leadStatus) query.status = leadStatus;
            if (interestLevel) query.interestLevel = interestLevel;
        }

        // Get leads matching the query
        const leads = await Lead.find(query).populate('user');

        if (leads.length === 0) {
            req.flash('error_msg', 'No leads match the selected criteria');
            return res.redirect('/admin/lead-summary');
        }

        // Prepare recipients data
        const recipients = leads.map(lead => ({
            lead: lead._id,
            user: lead.user._id,
            email: lead.user.email,
            sent: false,
            delivered: false
        }));

        // Create campaign record
        const campaign = new EmailCampaign({
            name: campaignName,
            subject: emailSubject,
            content: emailContent,
            targetCriteria: JSON.stringify(query),
            totalLeads: leads.length,
            status: scheduleEmail ? 'scheduled' : 'sending',
            scheduledDate: scheduleEmail ? new Date(scheduledDate) : null,
            sentBy: req.user._id,
            recipients
        });

        // Save campaign to database
        const savedCampaign = await campaign.save();

        // If not scheduled, send emails immediately
        if (!scheduleEmail) {
            let successCount = 0;

            for (const [index, lead] of leads.entries()) {
                try {
                    if (lead.user && lead.user.email) {
                        // Personalize content
                        const personalizedContent = emailContent.replace(/{{name}}/g, lead.user.name);
                        
                        // Create email data
                        const emailData = {
                            subject: emailSubject,
                            content: personalizedContent,
                            trackingEnabled: includeTracking === 'on',
                            leadId: lead._id,
                            campaignId: savedCampaign._id
                        };
                        
                        // Send email
                        const emailSent = await emailService.sendCustomEmail(lead.user.email, emailData);
                        
                        if (emailSent) {
                            // Update recipient status
                            campaign.recipients[index].sent = true;
                            campaign.recipients[index].sentAt = new Date();
                            campaign.recipients[index].delivered = true;
                            successCount++;
                        }
                    }
                } catch (emailError) {
                    console.error(`Error sending email to lead ${lead._id}:`, emailError);
                }
            }

            // Update campaign status
            campaign.status = 'sent';
            campaign.sentDate = new Date();
            await campaign.save();

            req.flash('success_msg', `Campaign sent to ${successCount} leads`);
        } else {
            req.flash('success_msg', `Campaign scheduled for ${new Date(scheduledDate).toLocaleString()}`);
        }

        res.redirect('/admin/lead-summary');
    } catch (error) {
        console.error('Error creating email campaign:', error);
        req.flash('error_msg', 'Error creating email campaign');
        res.redirect('/admin/lead-summary');
    }
});

/**
 * Campaign List Route
 * Displays all email campaigns
 */
router.get('/email-campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaigns = await EmailCampaign.find()
            .populate('sentBy', 'name')
            .sort({ createdAt: -1 });

        res.render('admin/email-campaigns', {
            title: 'Email Campaigns',
            user: req.user,
            campaigns
        });
    } catch (error) {
        console.error('Error loading email campaigns:', error);
        req.flash('error_msg', 'Error loading email campaigns');
        res.redirect('/admin/dashboard');
    }
});

/**
 * Campaign Detail Route
 * Displays email campaign details and metrics
 */
router.get('/email-campaigns/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id)
            .populate('sentBy', 'name')
            .populate('recipients.lead')
            .populate('recipients.user', 'name email');

        if (!campaign) {
            req.flash('error_msg', 'Campaign not found');
            return res.redirect('/admin/email-campaigns');
        }

        res.render('admin/email-campaigns/details', {
            title: 'Campaign Details',
            user: req.user,
            campaign
        });
    } catch (error) {
        console.error('Error loading campaign details:', error);
        req.flash('error_msg', 'Error loading campaign details');
        res.redirect('/admin/email-campaigns');
    }
});

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

// New Campaign Form - IMPORTANT: This route must be defined BEFORE the :id route
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

// Email Campaign Details - Use the more complete implementation with calculated metrics
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

// Send Campaign Now
router.post('/email-campaigns/:id/send', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        
        if (!campaign) {
            req.flash('error_msg', 'Campaign not found');
            return res.redirect('/admin/email-campaigns');
        }
        
        if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
            req.flash('error_msg', 'This campaign cannot be sent now');
            return res.redirect(`/admin/email-campaigns/${req.params.id}`);
        }
        
        // Update campaign status
        campaign.status = 'sending';
        campaign.sentDate = new Date();
        await campaign.save();
        
        // Send campaign asynchronously
        const emailService = require('../services/emailService');
        emailService.sendCampaign(campaign._id)
            .then(() => {
                console.log(`Campaign ${campaign._id} sent successfully`);
            })
            .catch(err => {
                console.error(`Error sending campaign ${campaign._id}:`, err);
            });
        
        req.flash('success_msg', 'Campaign sending initiated');
        res.redirect(`/admin/email-campaigns/${req.params.id}`);
    } catch (error) {
        console.error('Error sending campaign:', error);
        req.flash('error_msg', 'Failed to send campaign: ' + error.message);
        res.redirect('/admin/email-campaigns');
    }
});

// Cancel Scheduled Campaign
router.post('/email-campaigns/:id/cancel', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const campaign = await EmailCampaign.findById(req.params.id);
        
        if (!campaign) {
            req.flash('error_msg', 'Campaign not found');
            return res.redirect('/admin/email-campaigns');
        }
        
        if (campaign.status !== 'scheduled') {
            req.flash('error_msg', 'Only scheduled campaigns can be cancelled');
            return res.redirect(`/admin/email-campaigns/${req.params.id}`);
        }
        
        campaign.status = 'cancelled';
        await campaign.save();
        
        req.flash('success_msg', 'Campaign cancelled successfully');
        res.redirect('/admin/email-campaigns');
    } catch (error) {
        console.error('Error cancelling campaign:', error);
        req.flash('error_msg', 'Failed to cancel campaign');
        res.redirect('/admin/email-campaigns');
    }
});

// Update Follow-Up
router.post('/leads/:id/follow-up', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        const { followUpDate, reminderType } = req.body;
        
        // Set follow-up date and reminder settings
        lead.nextFollowUp = new Date(followUpDate);
        lead.followUpReminder = {
            enabled: true,
            reminderType: reminderType || 'notification',
            reminderSent: false
        };
        
        // Add note
        lead.notes.push({
            text: `Follow-up scheduled for ${new Date(followUpDate).toLocaleString()}`,
            type: 'follow_up',
            addedBy: req.user._id
        });
        
        await lead.save();
        
        req.flash('success_msg', 'Follow-up scheduled successfully');
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error scheduling follow-up:', error);
        req.flash('error_msg', 'Error scheduling follow-up');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Mark Follow-Up Complete
router.post('/leads/:id/follow-up-complete', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        // Update last contact date
        lead.lastContact = new Date();
        
        // Clear follow-up
        lead.followUpReminder.reminderSent = true;
        
        // Add note
        const noteText = req.body.note ? 
            `Follow-up completed: ${req.body.note}` : 
            'Follow-up marked as completed';
            
        lead.notes.push({
            text: noteText,
            type: 'follow_up',
            addedBy: req.user._id
        });
        
        await lead.save();
        
        // Schedule next follow-up if requested
        if (req.body.scheduleNext === 'yes') {
            // Default to 7 days from now
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + 7);
            
            lead.nextFollowUp = nextDate;
            lead.followUpReminder = {
                enabled: true,
                reminderType: lead.followUpReminder.reminderType || 'notification',
                reminderSent: false
            };
            
            lead.notes.push({
                text: `Next follow-up automatically scheduled for ${nextDate.toLocaleString()}`,
                type: 'follow_up',
                addedBy: req.user._id
            });
            
            await lead.save();
        }
        
        req.flash('success_msg', 'Follow-up marked as completed');
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error completing follow-up:', error);
        req.flash('error_msg', 'Error completing follow-up');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// Recalculate all lead priority scores
router.post('/leads/recalculate-priorities', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const updatedCount = await AILeadService.recalculateAllPriorityScores();
        
        req.flash('success_msg', `Successfully recalculated priority scores for ${updatedCount} leads`);
        res.redirect('/admin/leads');
    } catch (error) {
        console.error('Error recalculating priority scores:', error);
        req.flash('error_msg', 'Error recalculating priority scores');
        res.redirect('/admin/leads');
    }
});

// View stale leads
router.get('/leads/stale/:days', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const days = parseInt(req.params.days) || 14;
        const staleLeads = await AILeadService.identifyStaleLeads(days);
        
        res.render('admin/stale-leads', {
            user: req.user,
            currentPath: req.path,
            title: `Stale Leads (${days}+ days)`,
            staleLeads,
            daysThreshold: days,
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Error loading stale leads:', error);
        req.flash('error_msg', 'Error loading stale leads');
        res.redirect('/admin/leads');
    }
});

// Process recommended action
router.post('/leads/:id/process-recommendation', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) {
            req.flash('error_msg', 'Lead not found');
            return res.redirect('/admin/leads');
        }
        
        const { action } = req.body;
        
        switch (action) {
            case 'assign_seller':
                // Redirect to assign seller modal
                return res.redirect(`/admin/leads/${req.params.id}?openModal=assignSeller`);
                
            case 'mark_contacted':
                // Mark as contacted
                lead.status = 'contacted';
                lead.lastContact = new Date();
                lead.notes.push({
                    text: 'Marked as contacted (from recommendation)',
                    addedBy: req.user._id
                });
                await lead.save();
                req.flash('success_msg', 'Lead marked as contacted');
                break;
                
            case 'schedule_followup':
                // Redirect to follow-up modal
                return res.redirect(`/admin/leads/${req.params.id}?openModal=followUp`);
                
            case 'offer_incentive':
                // Add note about incentive
                lead.notes.push({
                    text: 'Recommended to offer incentive due to cart activity',
                    addedBy: req.user._id
                });
                await lead.save();
                req.flash('success_msg', 'Incentive recommendation noted');
                break;
                
            default:
                req.flash('error_msg', 'Unknown action');
        }
        
        res.redirect(`/admin/leads/${req.params.id}`);
    } catch (error) {
        console.error('Error processing recommendation:', error);
        req.flash('error_msg', 'Error processing recommendation');
        res.redirect(`/admin/leads/${req.params.id}`);
    }
});

// API endpoint to get all active sellers
router.get('/api/sellers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const sellers = await User.find({ role: 'seller', isActive: true })
            .select('name email')
            .sort({ name: 1 });
        
        res.json(sellers);
    } catch (error) {
        console.error('Error fetching sellers:', error);
        res.status(500).json({ error: 'Error fetching sellers' });
    }
});

module.exports = router; 