const mongoose = require('mongoose');
const User = require('../models/User');

// MongoDB connection string - adjust as needed
const MONGO_URI = 'mongodb://localhost:27017/art-gallery';

// Psychologist details
const psychologistData = {
    name: 'Psychologist',
    email: 'dipanwitakundu2707@gmail.com',
    password: 'pass',
    role: 'psychologist',
    isVerified: true,
    isActive: true
};

async function seedPsychologist() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('Connected to MongoDB');
        
        // Check if psychologist already exists
        const existingUser = await User.findOne({ email: psychologistData.email });
        
        if (existingUser) {
            console.log('Psychologist user already exists, updating password...');
            // Update password
            existingUser.password = psychologistData.password;
            await existingUser.save();
            console.log('Password updated successfully');
            mongoose.connection.close();
            return;
        }
        
        // Create new psychologist user
        const user = new User(psychologistData);
        
        await user.save();
        
        console.log('Psychologist user created successfully!');
        
        // Close MongoDB connection
        mongoose.connection.close();
        
    } catch (error) {
        console.error('Error seeding psychologist user:', error);
        mongoose.connection.close();
    }
}

// Run the seed function
seedPsychologist(); 