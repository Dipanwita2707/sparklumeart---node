const mongoose = require('mongoose');

// User ID to delete cart for
const USER_ID = '67ee203ff50a66449a1dba1e';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery')
    .then(() => {
        console.log('MongoDB Connected for cart deletion...');
        deleteUserCart();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function deleteUserCart() {
    try {
        // Get the raw MongoDB collection for Cart
        const cartCollection = mongoose.connection.collection('carts');
        
        // Delete the user's cart
        const result = await cartCollection.deleteOne({
            user: new mongoose.Types.ObjectId(USER_ID)
        });
        
        console.log('Cart deletion result:', result);
        
        if (result.deletedCount === 1) {
            console.log(`Successfully deleted cart for user ${USER_ID}`);
        } else {
            console.log(`No cart found for user ${USER_ID}`);
        }
        
        console.log('Cart deletion complete');
        process.exit(0);
    } catch (error) {
        console.error('Error deleting cart:', error);
        process.exit(1);
    }
} 