const mongoose = require('mongoose');
const Cart = require('./models/Cart');


// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/sparklumeart')
    .then(() => {
        console.log('MongoDB Connected for cart fixing...');
        fixCarts();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function fixCarts() {
    try {
        // Find all carts
        const carts = await Cart.find({});
        
        console.log(`Found ${carts.length} carts to check`);
        
        let fixedCarts = 0;
        
        for (const cart of carts) {
            let cartModified = false;
            
            // Check each item in the cart
            for (const item of cart.items) {
                console.log('Checking item:', {
                    id: item._id,
                    product: item.product,
                    galleryItem: item.galleryItem,
                    quantity: item.quantity,
                    price: item.price
                });
                
                // If item has galleryItem but no product, copy galleryItem to product
                if (item.galleryItem && !item.product) {
                    console.log(`Fixing item ${item._id}: Copying galleryItem to product`);
                    item.product = item.galleryItem;
                    cartModified = true;
                }
            }
            
            // Save the cart if it was modified
            if (cartModified) {
                await cart.save();
                fixedCarts++;
                console.log(`Fixed cart ${cart._id}`);
            }
        }
        
        console.log(`Fixed ${fixedCarts} carts out of ${carts.length}`);
        console.log('Cart fixing complete');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing carts:', error);
        process.exit(1);
    }
} 