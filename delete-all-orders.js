const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connection established for order cleanup');
    deleteAllOrders();
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

async function deleteAllOrders() {
    try {
        // Get direct access to the orders collection
        const db = mongoose.connection.db;
        const ordersCollection = db.collection('orders');
        
        // Count the existing orders
        const orderCount = await ordersCollection.countDocuments();
        console.log(`Found ${orderCount} orders in the database`);
        
        if (orderCount === 0) {
            console.log('No orders found to delete.');
            process.exit(0);
        }
        
        // Delete all orders
        const result = await ordersCollection.deleteMany({});
        console.log(`Successfully deleted ${result.deletedCount} orders from the database`);
        
        console.log('All orders have been completely removed');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting orders:', error);
        process.exit(1);
    }
} 