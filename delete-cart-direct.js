const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery')
    .then(() => {
        console.log('MongoDB Connected for cart deletion...');
        deleteCartDirect();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function deleteCartDirect() {
    try {
        // Direct access to the MongoDB collection
        const db = mongoose.connection.db;
        const cartsCollection = db.collection('carts');
        
        // Delete the cart for user ID 67ee203ff50a66449a1dba1e
        const userId = mongoose.Types.ObjectId.createFromHexString('67ee203ff50a66449a1dba1e');
        
        const result = await cartsCollection.deleteOne({ user: userId });
        
        if (result.deletedCount === 1) {
            console.log('Cart deleted successfully!');
        } else {
            console.log('No cart found for this user');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error deleting cart:', error);
        process.exit(1);
    }
} 