require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// Passport config
require('./config/passport')(passport);

// Database connection
const MONGODB_URI = process.env.MONGODB_URL ;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB Connected...');
    
    // Initialize scheduler service
    const schedulerService = require('./services/schedulerService');
    schedulerService.startAll(); // Start all scheduled tasks
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit process on database connection error
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const healthy = mongoose.connection.readyState === 1;
    if (healthy) {
        res.status(200).json({ 
            status: 'ok',
            database: 'connected',
            uptime: process.uptime()
        });
    } else {
        res.status(503).json({ 
            status: 'error',
            message: 'Service unavailable',
            database: 'disconnected'
        });
    }
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        message: "Welcome to SparklumeArt API",
        version: "1.0.0",
        status: "running",
        endpoints: {
            health: "/api/health"
        }
    });
});

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set("layout extractScripts", true);
app.set("layout extractStyles", true);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Flash messages
app.use(flash());

// Global variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    
    // Set a default currentPath based on the request URL
    res.locals.currentPath = req.path;
    
    next();
});

// Cart middleware for authenticated users
app.use(async (req, res, next) => {
    if (req.isAuthenticated() && req.user && req.user.role === 'user') {
        try {
            const Cart = require('./models/Cart');
            const cart = await Cart.findOne({ user: req.user._id })
                .populate('items.product');
            
            res.locals.cart = cart || { items: [], totalQuantity: 0, totalAmount: 0 };
        } catch (error) {
            console.error('Error loading cart:', error);
            res.locals.cart = { items: [], totalQuantity: 0, totalAmount: 0 };
        }
    }
    next();
});

// Import routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const sellerRoutes = require('./routes/seller');
const adminRoutes = require('./routes/admin');
const customRequestRoutes = require('./routes/customRequests');
const psychologistRoutes = require('./routes/psychologist');
const shopRoutes = require('./routes/shop');

// Import user activity tracking middleware
const activityTracker = require('./middleware/activityTracker');

// User Activity Tracking - must be after session and auth middleware
app.use(activityTracker.init);

// Add activity tracking to routes
app.use((req, res, next) => {
    // Store the original end method
    const originalEnd = res.end;
    
    // Override the end method
    res.end = function(chunk, encoding) {
        // Call the original end method
        originalEnd.call(this, chunk, encoding);
        
        // Track the page view after response is sent
        if (req.method === 'GET' && !req.path.startsWith('/admin') && !req.xhr) {
            activityTracker.trackPageView(req, res, () => {});
        }
    };
    
    // Handle search
    if (req.method === 'GET' && req.query.q) {
        activityTracker.trackSearch(req, res, () => {});
    }
    
    next();
});

// Routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/seller', sellerRoutes);
app.use('/admin', adminRoutes);
app.use('/custom-requests', customRequestRoutes);
app.use('/customRequests', customRequestRoutes);
app.use('/psychologist', psychologistRoutes);
app.use('/shop', shopRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 