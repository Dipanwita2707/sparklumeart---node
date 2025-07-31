const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/artgallery')
    .then(() => {
        console.log('MongoDB Connected for direct cart fixing...');
        directFixCarts();
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    });

async function directFixCarts() {
    try {
        // Get the raw MongoDB collection for Cart
        const cartCollection = mongoose.connection.collection('carts');
        
        // Update all cart items that have galleryItem but no product
        const result = await cartCollection.updateMany(
            { "items.galleryItem": { $exists: true }, "items.product": { $exists: false } },
            [
                {
                    $set: {
                        "items": {
                            $map: {
                                input: "$items",
                                as: "item",
                                in: {
                                    $cond: {
                                        if: { $and: [
                                            { $ifNull: ["$$item.galleryItem", false] }, 
                                            { $eq: [{ $ifNull: ["$$item.product", null] }, null] }
                                        ]},
                                        then: {
                                            _id: "$$item._id",
                                            product: "$$item.galleryItem",
                                            quantity: "$$item.quantity",
                                            price: "$$item.price"
                                        },
                                        else: "$$item"
                                    }
                                }
                            }
                        }
                    }
                }
            ]
        );
        
        console.log('Cart fixing result:', result);
        console.log('Direct cart fixing complete');
        
        // Also attempt to delete any broken carts
        const deleteResult = await cartCollection.deleteMany({
            "items": { 
                $elemMatch: { 
                    "product": { $exists: false } 
                } 
            }
        });
        
        console.log('Deleted broken carts result:', deleteResult);
        
        process.exit(0);
    } catch (error) {
        console.error('Error directly fixing carts:', error);
        process.exit(1);
    }
} 