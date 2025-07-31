module.exports = {
    ensureAuthenticated: function(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error_msg', 'Please log in to view this resource');
        res.redirect('/auth/login');
    },
    ensureAdmin: function(req, res, next) {
        if (req.isAuthenticated() && req.user.role === 'admin') {
            return next();
        }
        req.flash('error_msg', 'Access denied. Admin only.');
        res.redirect('/dashboard');
    },
    ensureSeller: function(req, res, next) {
        if (req.isAuthenticated() && req.user.role === 'seller' && req.user.isActive) {
            return next();
        }
        req.flash('error_msg', 'Access denied. Seller only or account is inactive.');
        res.redirect('/dashboard');
    },
    ensureUser: function(req, res, next) {
        console.log('In ensureUser middleware. User: ', req.user ? {
            id: req.user._id,
            role: req.user.role,
            isActive: req.user.isActive
        } : 'not authenticated');
        
        if (!req.isAuthenticated()) {
            console.log('User not authenticated');
            req.flash('error_msg', 'Please log in to access this resource.');
            return res.redirect('/auth/login');
        }
        
        if (req.user.role !== 'user') {
            console.log(`User role is ${req.user.role}, not 'user'`);
            req.flash('error_msg', 'Only regular users can access the shopping features.');
            return res.redirect('/dashboard');
        }
        
        if (!req.user.isActive) {
            console.log('User account is not active');
            req.flash('error_msg', 'Your account is inactive. Please contact support.');
            return res.redirect('/dashboard');
        }
        
        console.log('User authorized to proceed');
        return next();
    },
    ensurePsychologist: function(req, res, next) {
        if (req.isAuthenticated() && req.user.role === 'psychologist' && req.user.isActive) {
            return next();
        }
        req.flash('error_msg', 'Access denied. Psychologist only or account is inactive.');
        res.redirect('/dashboard');
    }
}; 