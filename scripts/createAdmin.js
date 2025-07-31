require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createAdmin = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect('mongodb+srv://sourav11092002:0qt05N7AG6CeNH5P@cluster0.q7gfpq4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Delete existing admin if exists
        await User.deleteOne({ email: 'sourav11092202@gmail.com' });

        // Create new admin user
        const adminUser = new User({
            name: 'Admin User',
            email: 'sourav11092202@gmail.com',
            password: 'Admin@123',
            role: 'admin',
            isVerified: true
        });

        // Save admin user (password will be hashed by the pre-save middleware)
        await adminUser.save();

        console.log('Admin user created successfully!');
        console.log('Email: sourav11092002@gmail.com');
        console.log('Password: Admin@123');
        console.log('Role: admin');
        console.log('Is Verified: true');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createAdmin(); 