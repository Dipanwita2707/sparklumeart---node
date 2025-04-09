const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connection established for order diagnosis');
    checkOrders();
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

async function checkOrders() {
    try {
        // Get direct access to collections
        const db = mongoose.connection.db;
        const ordersCollection = db.collection('orders');
        const productsCollection = db.collection('products');
        const usersCollection = db.collection('users');

        // Fetch all orders
        const orders = await ordersCollection.find({}).toArray();
        console.log(`Found ${orders.length} orders in the database`);

        if (orders.length === 0) {
            console.log('No orders found in the database.');
            process.exit(0);
        }

        // Check orders structure
        for (const order of orders) {
            console.log('\n---------- ORDER DETAILS ----------');
            console.log(`Order ID: ${order._id}`);
            console.log(`User ID: ${order.user}`);
            console.log(`Status: ${order.status}`);
            console.log(`Total Amount: ${order.totalAmount}`);
            console.log(`Created At: ${order.createdAt}`);
            
            // Check order items
            console.log('\nOrder Items:');
            if (!order.items || order.items.length === 0) {
                console.log('  No items in this order!');
                continue;
            }

            for (const [index, item] of order.items.entries()) {
                console.log(`\nItem ${index + 1}:`);
                console.log(`  Product ID: ${item.product}`);
                console.log(`  Product Title: ${item.title}`);
                console.log(`  Quantity: ${item.quantity}`);
                console.log(`  Price: ${item.price}`);
                
                // Check if seller field exists
                if (item.seller) {
                    console.log(`  Seller ID: ${item.seller}`);
                    
                    // Try to get seller info
                    try {
                        const seller = await usersCollection.findOne({ 
                            _id: mongoose.Types.ObjectId.createFromHexString(item.seller.toString()) 
                        });
                        console.log(`  Seller Name: ${seller ? seller.name : 'Not found'}`);
                    } catch (error) {
                        console.log(`  Error getting seller info: ${error.message}`);
                    }
                } else {
                    console.log('  ⚠️ NO SELLER ID ATTACHED TO THIS ITEM');
                    
                    // Try to find the product to get the seller
                    if (item.product) {
                        try {
                            const product = await productsCollection.findOne({ 
                                _id: mongoose.Types.ObjectId.createFromHexString(item.product.toString()) 
                            });
                            if (product && product.seller) {
                                console.log(`  Product's Seller ID: ${product.seller}`);
                                console.log(`  ⚠️ This seller ID should be attached to the order item`);
                            } else {
                                console.log('  ⚠️ Product not found or has no seller');
                            }
                        } catch (error) {
                            console.log(`  Error getting product info: ${error.message}`);
                        }
                    }
                }
            }
        }

        // Check seller query in routes
        console.log('\n---------- DIAGNOSIS ----------');
        console.log('1. Issue: Order items may be missing the seller field');
        console.log('2. Issue: The seller route may not correctly check for products belonging to the seller');
        console.log('3. Solution: Update seller orders route to find orders by product ID as well as seller ID');
        console.log('4. Solution: Create a fix script to add seller IDs to order items');
        
        process.exit(0);
    } catch (error) {
        console.error('Error checking orders:', error);
        process.exit(1);
    }
} 