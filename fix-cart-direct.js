const mongoose = require('mongoose');


// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URL )
    .then(() => {
        console.log('MongoDB Connected for cart fixing...');
        fixCartDirect();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function fixCartDirect() {
    try {
        // Direct access to the MongoDB collection
        const db = mongoose.connection.db;
        const cartsCollection = db.collection('carts');
        
        // Find the problematic cart for user ID 67ee203ff50a66449a1dba1e
        const userId = mongoose.Types.ObjectId.createFromHexString('67ee203ff50a66449a1dba1e');
        const cart = await cartsCollection.findOne({ user: userId });
        
        if (!cart) {
            console.log('No cart found for this user');
            process.exit(0);
        }
        
        console.log('Original cart:', JSON.stringify(cart, null, 2));
        
        // Check if cart needs fixing
        let needsFixing = false;
        const updatedItems = cart.items.map(item => {
            if (item.galleryItem && !item.product) {
                needsFixing = true;
                console.log(`Fixing item: ${item._id} - Copying galleryItem to product`);
                return {
                    ...item,
                    product: item.galleryItem
                };
            }
            return item;
        });
        
        if (needsFixing) {
            // Update the cart directly
            const result = await cartsCollection.updateOne(
                { _id: cart._id },
                { $set: { items: updatedItems } }
            );
            
            console.log('Update result:', result);
            console.log('Cart fixed successfully!');
        } else {
            console.log('Cart does not need fixing');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error fixing cart:', error);
        process.exit(1);
    }
} 