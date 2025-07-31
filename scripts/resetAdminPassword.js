require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const resetAdminPassword = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URL || 'mongodb+srv://sourav11092002:0qt05N7AG6CeNH5P@cluster0.q7gfpq4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Find admin user
        const adminUser = await User.findOne({ email: 'sourav11092202@gmail.com' });
        
        if (!adminUser) {
            console.log('Admin user not found!');
            process.exit(1);
        }

        // Set new password
        const newPassword = 'Admin@123';
        const salt = await bcrypt.genSalt(10);
        adminUser.password = await bcrypt.hash(newPassword, salt);

        // Save changes
        await adminUser.save();

        console.log('Admin password reset successfully!');
        console.log('Email: sourav11092202@gmail.com');
        console.log('New Password: Admin@123');
        console.log('Please try logging in with these credentials.');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

resetAdminPassword(); 