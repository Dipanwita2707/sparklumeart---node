require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const fixAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/art-gallery', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // First, let's check if any admin exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        console.log('Existing admin:', existingAdmin);

        // Delete any existing admin with the target email
        await User.deleteOne({ email: 'sourav11092202@gmail.com' });

        // Create new admin user with proper configuration
        const adminUser = new User({
            name: 'Admin User',
            email: 'sourav11092202@gmail.com',
            password: 'Admin@123',
            role: 'admin',
            isVerified: true
        });

        // Save the admin user
        await adminUser.save();

        // Verify the admin was created
        const savedAdmin = await User.findOne({ email: 'sourav11092202@gmail.com' });
        console.log('\nNew admin created:', {
            name: savedAdmin.name,
            email: savedAdmin.email,
            role: savedAdmin.role,
            isVerified: savedAdmin.isVerified,
            createdAt: savedAdmin.createdAt
        });

        console.log('\nAdmin credentials:');
        console.log('Email: sourav11092202@gmail.com');
        console.log('Password: Admin@123');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

fixAdmin(); 