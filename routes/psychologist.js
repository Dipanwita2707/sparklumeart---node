const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const PsychometricTest = require('../models/PsychometricTest');
const User = require('../models/User');
const { ensureAuthenticated, ensurePsychologist } = require('../middleware/auth');

// Hardcoded psychologist credentials
// In a production environment, you'd use a proper database and user management system
const PSYCHOLOGIST_EMAIL = 'psychologist@example.com';
const PSYCHOLOGIST_PASSWORD = '$2a$10$YmVUbHZuTWN0bHpnMVp5MO6IoQuxo8w3WMtWYo/.NWMH0SLs1xfy2'; // hashed 'psychology123'

// Middleware to ensure psychologist is authenticated
const ensurePsychologistAuth = (req, res, next) => {
    if (req.session && req.session.isPsychologist) {
        return next();
    }
    res.redirect('/psychologist/login');
};

// Login page
router.get('/login', (req, res) => {
    if (req.session && req.session.isPsychologist) {
        return res.redirect('/psychologist/dashboard');
    }
    res.render('psychologist/login', { error: null });
});

// Login form submission
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Check if email matches
    if (email !== PSYCHOLOGIST_EMAIL) {
        return res.render('psychologist/login', { error: 'Invalid credentials' });
    }
    
    // Check if password matches (compare with bcrypt)
    const isMatch = await bcrypt.compare(password, PSYCHOLOGIST_PASSWORD);
    if (!isMatch) {
        return res.render('psychologist/login', { error: 'Invalid credentials' });
    }
    
    // Set up session
    req.session.isPsychologist = true;
    req.session.psychologistEmail = email;
    
    res.redirect('/psychologist/dashboard');
});

// Logout
router.get('/logout', (req, res) => {
    req.session.isPsychologist = false;
    req.session.psychologistEmail = null;
    res.redirect('/psychologist/login');
});

// Dashboard
router.get('/dashboard', ensureAuthenticated, ensurePsychologist, async (req, res) => {
    try {
        // Fetch tests awaiting review (paid but not reviewed yet)
        const pendingTests = await PsychometricTest.find({ 
            status: { $in: ['paid', 'under_review'] } 
        }).populate('user', 'name email').sort({ paymentDate: 1 });
        
        // Fetch reviewed tests
        const reviewedTests = await PsychometricTest.find({ 
            status: 'reviewed' 
        }).populate('user', 'name email').sort({ 'psychologistFeedback.submittedAt': -1 });
        
        res.render('psychologist/dashboard', {
            pendingTests,
            reviewedTests,
            user: req.user,
            currentPath: '/psychologist/dashboard'
        });
    } catch (err) {
        console.error('Error fetching tests:', err);
        res.status(500).render('error', { 
            message: 'Error loading dashboard', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// View test details
router.get('/test/:id', ensureAuthenticated, ensurePsychologist, async (req, res) => {
    try {
        const test = await PsychometricTest.findById(req.params.id)
            .populate('user', 'name email');
        
        if (!test) {
            return res.status(404).render('error', { 
                message: 'Test not found', 
                error: { status: 404 } 
            });
        }
        
        // If status is paid, update to under_review
        if (test.status === 'paid') {
            test.status = 'under_review';
            await test.save();
        }
        
        // Create an object of questions for easier rendering
        const questions = {
            color: [
                { 
                    id: 1, 
                    text: "Which color palette do you naturally gravitate towards in your living space?",
                    options: {
                        'a': 'Warm colors (reds, oranges, yellows)',
                        'b': 'Cool colors (blues, greens, purples)',
                        'c': 'Neutral colors (beiges, grays, whites)',
                        'd': 'Bold, vibrant colors'
                    }
                },
                { 
                    id: 2, 
                    text: "How do colors affect your mood at home?",
                    options: {
                        'a': 'I prefer energizing, stimulating colors',
                        'b': 'I prefer calming, soothing colors',
                        'c': 'I like balanced, harmonious color schemes',
                        'd': 'I enjoy dramatic color contrasts'
                    }
                },
                { 
                    id: 3, 
                    text: "Which color would you prefer for a feature wall in your living room?",
                    options: {
                        'a': 'A rich, warm tone like terracotta or burgundy',
                        'b': 'A cool, calming shade like sage green or navy blue',
                        'c': 'A subtle neutral like taupe or light gray',
                        'd': 'A bold statement color like emerald or royal purple'
                    }
                },
                { 
                    id: 4, 
                    text: "What color furniture do you prefer?",
                    options: {
                        'a': 'Warm wood tones or rich upholstery colors',
                        'b': 'Cool-toned woods or blue/green upholstery',
                        'c': 'Neutral colors that blend with the space',
                        'd': 'Statement pieces in bold, contrasting colors'
                    }
                },
                { 
                    id: 5, 
                    text: "How would you describe your ideal color scheme for a bedroom?",
                    options: {
                        'a': 'Warm and cozy with amber lighting',
                        'b': 'Cool and serene with soft blue or green tones',
                        'c': 'Neutral and minimal with subtle accents',
                        'd': 'Rich and dramatic with deep, saturated colors'
                    }
                }
            ],
            style: [
                { 
                    id: 6, 
                    text: "What kind of furniture style appeals to you most?",
                    options: {
                        'a': 'Modern and sleek',
                        'b': 'Traditional and classic',
                        'c': 'Minimalist and functional',
                        'd': 'Eclectic mix of different styles'
                    }
                },
                { 
                    id: 7, 
                    text: "How important is symmetry in your home decor?",
                    options: {
                        'a': 'Very important, I prefer balanced, symmetrical arrangements',
                        'b': 'Somewhat important, but I like some variation',
                        'c': 'Not very important, I prefer functional placement',
                        'd': 'I prefer deliberate asymmetry for visual interest'
                    }
                },
                { 
                    id: 8, 
                    text: "Which description best matches your ideal living room?",
                    options: {
                        'a': 'Clean lines, open space, and contemporary fixtures',
                        'b': 'Comfortable furnishings with traditional detailing',
                        'c': 'Uncluttered space with only essential furniture',
                        'd': 'Unique pieces that tell a story, mixed patterns and textures'
                    }
                },
                { 
                    id: 9, 
                    text: "When decorating a space, what's your approach?",
                    options: {
                        'a': 'I follow current trends and design principles',
                        'b': 'I prefer timeless, classic elements',
                        'c': 'I keep it simple and focus on function over form',
                        'd': 'I collect pieces I love and create my own unique style'
                    }
                },
                { 
                    id: 10, 
                    text: "What's your preference for wall decor?",
                    options: {
                        'a': 'Large statement pieces or architectural elements',
                        'b': 'Traditional artwork in proper frames',
                        'c': 'Minimal decoration, perhaps one focal piece',
                        'd': 'Gallery walls with a mix of art, photos, and objects'
                    }
                }
            ],
            personality: [
                { 
                    id: 11, 
                    text: "How often do you rearrange or refresh your living space?",
                    options: {
                        'a': 'Frequently, I enjoy changing things up',
                        'b': 'Occasionally, when I feel the need for change',
                        'c': 'Rarely, once I have a functional setup',
                        'd': 'When inspired by new items or ideas'
                    }
                },
                { 
                    id: 12, 
                    text: "When hosting guests, what's most important to you?",
                    options: {
                        'a': 'Creating an impressive, styled space',
                        'b': 'Providing traditional comfort and hospitality',
                        'c': 'Having a clean, uncluttered environment',
                        'd': 'Creating a unique, memorable experience'
                    }
                },
                { 
                    id: 13, 
                    text: "How would you describe your approach to organization?",
                    options: {
                        'a': 'I prefer everything to be organized by design principles',
                        'b': 'I like orderly arrangements with some personal touches',
                        'c': 'I keep things minimal and precisely organized',
                        'd': 'I have my own organization system that may look chaotic to others'
                    }
                },
                { 
                    id: 14, 
                    text: "How do you feel about incorporating trends into your home?",
                    options: {
                        'a': 'I love following the latest trends',
                        'b': 'I select timeless pieces with occasional trendy accents',
                        'c': 'I focus on long-lasting quality over trends',
                        'd': 'I\'m more interested in unique pieces than what\'s trending'
                    }
                },
                { 
                    id: 15, 
                    text: "What role does your home play in your life?",
                    options: {
                        'a': 'It\'s a showcase of my taste and style',
                        'b': 'It\'s a comfortable haven for family traditions',
                        'c': 'It\'s a functional base for my activities',
                        'd': 'It\'s a creative expression of my personality'
                    }
                }
            ]
        };

        // Check if we need to convert from array format to map format
        if (Array.isArray(test.answers)) {
            // Create a new answers Map to use in the template
            const answersMap = {};
            test.answers.forEach(answer => {
                answersMap[`q${answer.questionId}`] = answer.answer;
            });
            test._doc.answersMap = answersMap;
        }
        
        res.render('psychologist/test-details', {
            test,
            questions,
            user: req.user,
            currentPath: '/psychologist/test'
        });
        
    } catch (err) {
        console.error('Error fetching test details:', err);
        res.status(500).render('error', { 
            message: 'Error loading test details', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// Submit feedback
router.post('/test/:id/feedback', ensureAuthenticated, ensurePsychologist, async (req, res) => {
    try {
        const { feedback } = req.body;
        
        if (!feedback || feedback.trim() === '') {
            return res.status(400).send('Feedback is required');
        }
        
        const test = await PsychometricTest.findById(req.params.id);
        
        if (!test) {
            return res.status(404).render('error', { 
                message: 'Test not found', 
                error: { status: 404 } 
            });
        }
        
        // Update test with feedback
        test.psychologistFeedback = {
            text: feedback,
            submittedAt: new Date(),
            psychologist: req.user.email
        };
        test.status = 'reviewed';
        
        await test.save();
        
        res.redirect('/psychologist/dashboard');
        
    } catch (err) {
        console.error('Error submitting feedback:', err);
        res.status(500).render('error', { 
            message: 'Error submitting feedback', 
            error: { status: 500, stack: err.stack } 
        });
    }
});

// Redirect login requests to the main auth login
router.get('/login', (req, res) => {
    res.redirect('/auth/login');
});

// Redirect logout requests to the main auth logout
router.get('/logout', (req, res) => {
    res.redirect('/auth/logout');
});

module.exports = router; 