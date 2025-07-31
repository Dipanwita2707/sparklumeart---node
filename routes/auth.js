const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const { sendOTP, sendPasswordResetEmail } = require('../utils/emailService');
const otpGenerator = require('otp-generator');
const activityTracker = require('../middleware/activityTracker');

// Register page
router.get('/register', (req, res) => {
    res.render('auth/register');
});

// Register handle
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            req.flash('error_msg', 'Email already registered');
            return res.redirect('/auth/register');
        }

        // Prevent admin registration through normal registration
        if (role === 'admin') {
            req.flash('error_msg', 'Admin registration is not allowed through this form');
            return res.redirect('/auth/register');
        }

        // Create new user
        user = new User({
            name,
            email,
            password,
            role: role || 'user'
        });

        // Generate OTP
        const otp = otpGenerator.generate(6, { digits: true });
        user.otp = {
            code: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        };

        await user.save();
        await sendOTP(email, otp);

        req.flash('success_msg', 'Please check your email for verification OTP');
        res.redirect('/auth/verify-email');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error in registration');
        res.redirect('/auth/register');
    }
});

// Verify email page
router.get('/verify-email', (req, res) => {
    res.render('auth/verify-email');
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/auth/verify-email');
        }

        if (!user.otp || user.otp.code !== otp || user.otp.expiresAt < Date.now()) {
            req.flash('error_msg', 'Invalid or expired OTP');
            return res.redirect('/auth/verify-email');
        }

        user.isVerified = true;
        user.otp = undefined;
        await user.save();

        req.flash('success_msg', 'Email verified successfully. Please login');
        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error in verification');
        res.redirect('/auth/verify-email');
    }
});

// Login page
router.get('/login', (req, res) => {
    res.render('auth/login');
});

// Login handle
router.post('/login', (req, res, next) => {
    console.log('Login attempt:', req.body.email); // Debug log
    passport.authenticate('local', async (err, user, info) => {
        if (err) {
            console.error('Passport error:', err); // Debug log
            return next(err);
        }
        if (!user) {
            console.log('Login failed:', info.message); // Debug log
            // Check if user exists in database
            const userExists = await User.findOne({ email: req.body.email });
            console.log('User exists in database:', userExists ? 'Yes' : 'No');
            if (userExists) {
                console.log('User details:', {
                    email: userExists.email,
                    role: userExists.role,
                    isVerified: userExists.isVerified,
                    isActive: userExists.isActive
                });
            }
            req.flash('error_msg', info.message);
            return res.redirect('/auth/login');
        }

        // Check if user is active
        if (!user.isActive) {
            req.flash('error_msg', 'Your account has been deactivated. Please contact support.');
            return res.redirect('/auth/login');
        }

        req.logIn(user, async (err) => {
            if (err) {
                console.error('Login error:', err); // Debug log
                return next(err);
            }
            console.log('Login successful:', {
                email: user.email,
                role: user.role,
                isVerified: user.isVerified,
                isActive: user.isActive
            }); // Debug log
            
            // Track login activity
            try {
                await activityTracker.trackActivity(req, {
                    activityType: 'login',
                    details: {
                        method: 'standard'
                    }
                });
            } catch (error) {
                console.error('Error tracking login activity:', error);
            }
            
            // Redirect based on user role
            if (user.role === 'admin') {
                return res.redirect('/admin/dashboard');
            } else if (user.role === 'seller') {
                return res.redirect('/seller/dashboard');
            } else if (user.role === 'psychologist') {
                return res.redirect('/psychologist/dashboard');
            } else {
                return res.redirect('/user/dashboard');
            }
        });
    })(req, res, next);
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password');
});

// Forgot password handle
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error_msg', 'User not found');
            return res.redirect('/auth/forgot-password');
        }

        const resetToken = require('crypto').randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        await user.save();
        await sendPasswordResetEmail(email, resetToken);

        req.flash('success_msg', 'Password reset link sent to your email');
        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error in password reset request');
        res.redirect('/auth/forgot-password');
    }
});

// Reset password page
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired');
            return res.redirect('/auth/forgot-password');
        }

        res.render('auth/reset-password', { token: req.params.token });
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error in password reset');
        res.redirect('/auth/forgot-password');
    }
});

// Reset password handle
router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error_msg', 'Password reset token is invalid or has expired');
            return res.redirect('/auth/forgot-password');
        }

        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        req.flash('success_msg', 'Password has been reset successfully');
        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        req.flash('error_msg', 'Error in password reset');
        res.redirect('/auth/forgot-password');
    }
});

// Logout handle
router.get('/logout', (req, res) => {
    // Track logout activity before logging out
    if (req.isAuthenticated()) {
        try {
            activityTracker.trackActivity(req, {
                activityType: 'logout',
                details: {
                    userId: req.user._id
                }
            });
        } catch (error) {
            console.error('Error tracking logout activity:', error);
        }
    }

    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        req.flash('success_msg', 'You are logged out');
        res.redirect('/auth/login');
    });
});

module.exports = router; 