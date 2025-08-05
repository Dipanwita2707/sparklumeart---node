const express = require('express');
const router = express.Router();

const { ensureAuthenticated } = require('../middleware/auth');
const Gallery = require('../models/Gallery');
const PsychometricTest = require('../models/PsychometricTest');
const path = require('path');




// Home page
router.get('/', (req, res) => {
    res.render('index', {
        title: 'Welcome to Art Gallery'
    });
});

// Gallery page
router.get('/gallery', async (req, res) => {
    try {
        const galleryItems = await Gallery.find().sort({ createdAt: -1 });
        
        res.render('gallery', { 
            title: 'Art Gallery',
            galleryItems,
            currentPath: '/gallery'
        });
    } catch (error) {
        console.error('Error fetching gallery items:', error);
        res.render('gallery', {
            title: 'Art Gallery',
            galleryItems: [],
            currentPath: '/gallery'
        });
    }
});

// Home Decor Gallery page
router.get('/home-decor-gallery', async (req, res) => {
    try {
        // Find all completed projects that are marked for public display
        const projects = await PsychometricTest.find({
            'order.status': 'completed',
            'order.publicDisplay': true,
            'order.photos': { $exists: true, $ne: [] }
        })
        .populate('user', 'name')
        .select('user order.photos order.publicDescription order.completedAt userFeedback');
        
        // Format dates and validate data for display
        const formattedProjects = projects.map(project => {
            const projectObj = project.toObject();
            
            // Log what we found to help debug
            console.log('Project ID:', project._id);
            console.log('Has photos:', project.order && project.order.photos ? 'Yes' : 'No');
            if (project.order && project.order.photos) {
                console.log('Number of photos:', project.order.photos.length);
                console.log('Photo paths:', project.order.photos);
            }
            console.log('Completion date:', project.order && project.order.completedAt ? project.order.completedAt : 'Not set');
            
            // Ensure completion date is formatted
            if (projectObj.order && projectObj.order.completedAt) {
                try {
                    const date = new Date(projectObj.order.completedAt);
                    projectObj.order.formattedCompletedAt = date.toLocaleDateString();
                } catch (err) {
                    projectObj.order.formattedCompletedAt = 'Recently';
                }
            } else {
                projectObj.order.formattedCompletedAt = 'Recently';
            }
            
            return projectObj;
        });
        
        res.render('home-decor-gallery', { 
            title: 'Home Decor Gallery', 
            projects: formattedProjects,
            currentPath: '/home-decor-gallery'
        });
    } catch (err) {
        console.error('Error fetching gallery projects:', err);
        res.status(500).render('error', { 
            message: 'Error loading gallery', 
            error: { status: 500 } 
        });
    }
});

// Dashboard redirect based on role
router.get('/dashboard', ensureAuthenticated, (req, res) => {
    switch (req.user.role) {
        case 'admin':
            res.redirect('/admin/dashboard');
            break;
        case 'seller':
            res.redirect('/seller/dashboard');
            break;
        case 'psychologist':
            res.redirect('/psychologist/dashboard');
            break;
        case 'user':
            res.redirect('/user/dashboard');
            break;
        default:
            res.redirect('/');
    }
});

module.exports = router; 