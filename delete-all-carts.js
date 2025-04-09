const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery')
    .then(() => {
        console.log('MongoDB Connected for cart cleanup...');
        deleteAllCarts();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function deleteAllCarts() {
    try {
        // Get direct access to the carts collection
        const db = mongoose.connection.db;
        const result = await db.collection('carts').deleteMany({});
        
        console.log(`Deleted ${result.deletedCount} carts from the database`);
        console.log('All carts have been completely removed');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting carts:', error);
        process.exit(1);
    }
} 