require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const verifyAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/art-gallery', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // First, let's check all users in the database
        const allUsers = await User.find({});
        console.log('\nAll users in database:', allUsers.map(u => ({
            email: u.email,
            role: u.role,
            isVerified: u.isVerified
        })));

        // Find and update existing admin or create new one
        let adminUser = await User.findOne({ role: 'admin' });
        
        if (adminUser) {
            // Update existing admin
            adminUser.email = 'sourav11092002@gmail.com';
            adminUser.name = 'Admin User';
            adminUser.password = 'Admin@123';
            adminUser.isVerified = true;
            await adminUser.save();
            console.log('\nUpdated existing admin user');
        } else {
            // Create new admin
            adminUser = new User({
                name: 'Admin User',
                email: 'sourav11092002@gmail.com',
                password: 'Admin@123',
                role: 'admin',
                isVerified: true
            });
            await adminUser.save();
            console.log('\nCreated new admin user');
        }

        // Verify the admin
        const savedAdmin = await User.findOne({ email: 'sourav11092002@gmail.com' });
        console.log('\nAdmin details:', {
            name: savedAdmin.name,
            email: savedAdmin.email,
            role: savedAdmin.role,
            isVerified: savedAdmin.isVerified,
            createdAt: savedAdmin.createdAt
        });

        // Test password comparison
        const isMatch = await savedAdmin.comparePassword('Admin@123');
        console.log('\nPassword comparison test:', isMatch);

        console.log('\nAdmin credentials:');
        console.log('Email: sourav11092002@gmail.com');
        console.log('Password: Admin@123');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

verifyAdmin(); 