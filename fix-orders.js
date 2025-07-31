const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connection established for fixing orders');
    fixOrders();
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

async function fixOrders() {
    try {
        // Get direct access to collections
        const db = mongoose.connection.db;
        const ordersCollection = db.collection('orders');
        const productsCollection = db.collection('products');

        // Fetch all orders
        const orders = await ordersCollection.find({}).toArray();
        console.log(`Found ${orders.length} orders to process`);

        if (orders.length === 0) {
            console.log('No orders found to fix.');
            process.exit(0);
        }

        let fixedOrders = 0;
        let totalItemsFixed = 0;

        // Process each order
        for (const order of orders) {
            console.log(`\nProcessing order: ${order._id}`);
            
            if (!order.items || order.items.length === 0) {
                console.log('  No items in this order, skipping');
                continue;
            }

            let orderModified = false;
            let itemsFixed = 0;

            // Check each item in the order
            for (const item of order.items) {
                if (!item.seller && item.product) {
                    console.log(`  Item missing seller field: ${item.product} (${item.title})`);
                    
                    try {
                        // Find the product to get its seller
                        const product = await productsCollection.findOne({ 
                            _id: mongoose.Types.ObjectId.createFromHexString(item.product.toString()) 
                        });
                        
                        if (product && product.seller) {
                            // Add the seller field to the item
                            item.seller = product.seller;
                            console.log(`  ✅ Added seller ID: ${product.seller} to item`);
                            orderModified = true;
                            itemsFixed++;
                        } else {
                            console.log(`  ❌ Could not find product or seller for item`);
                        }
                    } catch (error) {
                        console.log(`  Error getting product info: ${error.message}`);
                    }
                } else if (item.seller) {
                    console.log(`  Item already has seller field: ${item.seller}`);
                }
            }

            // Update the order if modified
            if (orderModified) {
                try {
                    const result = await ordersCollection.updateOne(
                        { _id: order._id },
                        { $set: { items: order.items } }
                    );
                    
                    console.log(`  ✅ Order updated: ${result.modifiedCount} document(s) modified`);
                    fixedOrders++;
                    totalItemsFixed += itemsFixed;
                } catch (updateError) {
                    console.error(`  Error updating order: ${updateError.message}`);
                }
            } else {
                console.log('  No changes needed for this order');
            }
        }

        console.log('\n---------- SUMMARY ----------');
        console.log(`Total orders processed: ${orders.length}`);
        console.log(`Orders fixed: ${fixedOrders}`);
        console.log(`Total items fixed: ${totalItemsFixed}`);
        
        console.log('\nNext steps:');
        console.log('1. Update seller routes to check both items.seller and items.product');
        console.log('2. Restart your application');
        
        process.exit(0);
    } catch (error) {
        console.error('Error fixing orders:', error);
        process.exit(1);
    }
} 