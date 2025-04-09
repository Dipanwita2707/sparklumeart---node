const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureUser } = require('../middleware/auth');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const activityTracker = require('../middleware/activityTracker');
const User = require('../models/User');

// Shop home - Display all approved products
router.get('/', async (req, res) => {
    try {
        // Get approved products
        const products = await Product.find({ status: 'approved' })
            .sort({ createdAt: -1 });
        
        // Get cart if user is logged in and has 'user' role
        let cart = null;
        if (req.user && req.user.role === 'user') {
            cart = await Cart.findOne({ user: req.user._id })
                .populate({
                    path: 'items.product',
                    model: 'Product'
                });
                
            // Calculate cart total
            if (cart) {
                cart.totalQuantity = 0;
                cart.totalAmount = 0;
                
                cart.items.forEach(item => {
                    if (item.product) {
                        cart.totalQuantity += item.quantity;
                        cart.totalAmount += (item.price * item.quantity);
                    }
                });
            }
        }
        
        res.render('shop/index', {
            user: req.user,
            title: 'Shop',
            products: products,
            cart: cart,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading shop products:', error);
        req.flash('error_msg', 'Error loading products');
        res.redirect('/');
    }
});

// Product details
router.get('/product/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product || product.status !== 'approved') {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/shop');
        }
        
        // Track product view
        if (req.user) {
            try {
                await activityTracker.trackActivity(req, {
                    activityType: 'product_view',
                    details: {
                        productId: product._id,
                        productTitle: product.title,
                        category: product.category,
                        price: product.price
                    }
                });
            } catch (error) {
                console.error('Error tracking product view:', error);
            }
        }
        
        // Get cart if user is logged in and has 'user' role
        let cart = null;
        if (req.user && req.user.role === 'user') {
            cart = await Cart.findOne({ user: req.user._id })
                .populate({
                    path: 'items.product',
                    model: 'Product'
                });
                
            // Calculate cart total
            if (cart) {
                cart.totalQuantity = 0;
                cart.totalAmount = 0;
                
                cart.items.forEach(item => {
                    if (item.product) {
                        cart.totalQuantity += item.quantity;
                        cart.totalAmount += (item.price * item.quantity);
                    }
                });
            }
        }
        
        res.render('shop/product-details', {
            user: req.user,
            title: product.title,
            product: product,
            cart: cart,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error loading product details:', error);
        req.flash('error_msg', 'Error loading product details');
        res.redirect('/shop');
    }
});

// Fix existing carts with galleryItem instead of product
router.get('/fix-carts', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Fixing carts for user:', req.user._id);
        
        // Get the user's cart
        const cart = await Cart.findOne({ user: req.user._id });
        
        if (!cart) {
            return res.json({ 
                success: true, 
                message: 'No cart found to fix' 
            });
        }
        
        // Log the cart items before fixing
        console.log('Cart items before fixing:', cart.items);
        
        // Fix cart items
        let modified = false;
        
        for (let i = 0; i < cart.items.length; i++) {
            // If an item has galleryItem but no product, copy galleryItem to product
            if (cart.items[i].galleryItem && !cart.items[i].product) {
                console.log(`Fixing item ${i}: Copying galleryItem to product`);
                cart.items[i].product = cart.items[i].galleryItem;
                modified = true;
            }
        }
        
        if (modified) {
            console.log('Cart was modified, saving changes');
            await cart.save();
            console.log('Cart fixed successfully');
            
            return res.json({
                success: true,
                message: 'Cart fixed successfully',
                cart: cart
            });
        } else {
            return res.json({
                success: true,
                message: 'No issues found in cart',
                cart: cart
            });
        }
    } catch (error) {
        console.error('Error fixing cart:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add to cart
router.post('/cart/add/:id', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        console.log('Adding to cart - User:', req.user._id);
        
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;
        
        console.log(`Adding product ${productId} to cart, quantity: ${quantity}`);
        
        // Get product to verify it exists and is approved
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log('Product not found');
            req.flash('error_msg', 'Product not found');
            return res.redirect('/shop');
        }
        
        if (product.status !== 'approved') {
            console.log(`Product found but status is ${product.status}`);
            req.flash('error_msg', 'This product is not available for purchase');
            return res.redirect('/shop');
        }
        
        // Check if quantity is valid
        if (quantity <= 0) {
            console.log('Invalid quantity (less than or equal to 0)');
            req.flash('error_msg', 'Please select a valid quantity');
            return res.redirect(`/shop/product/${productId}`);
        }
        
        if (quantity > product.stock) {
            console.log(`Requested quantity (${quantity}) exceeds available stock (${product.stock})`);
            req.flash('error_msg', `Sorry, only ${product.stock} items available in stock`);
            return res.redirect(`/shop/product/${productId}`);
        }
        
        // Track add to cart activity
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'add_to_cart',
                details: {
                    productId: product._id,
                    productTitle: product.title,
                    quantity: quantity,
                    price: product.price
                }
            });
        } catch (error) {
            console.error('Error tracking add to cart:', error);
        }
        
        // Find or create user's cart
        let cart = await Cart.findOne({ user: req.user._id });
        
        if (!cart) {
            console.log('Creating new cart for user');
            cart = new Cart({
                user: req.user._id,
                items: [],
                totalQuantity: 0,
                totalAmount: 0
            });
        }
        
        // Check if product is already in cart
        const existingItemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );
        
        if (existingItemIndex > -1) {
            console.log('Product already in cart, updating quantity');
            // Update quantity if product already in cart
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;
            
            // Check if the new quantity exceeds stock
            if (newQuantity > product.stock) {
                console.log(`New quantity (${newQuantity}) would exceed stock (${product.stock})`);
                req.flash('error_msg', `Cannot add more of this item. Maximum stock available is ${product.stock}`);
                return res.redirect(`/shop/product/${productId}`);
            }
            
            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            console.log('Adding new product to cart');
            // Add new item to cart
            cart.items.push({
                product: productId,
                quantity: quantity,
                price: product.price
            });
        }
        
        // Save cart (totals are calculated in the pre-save hook)
        console.log('Saving cart with updated items');
        await cart.save();
        
        console.log('Cart saved successfully');
        req.flash('success_msg', 'Product added to cart');
        
        // Redirect back to the page they came from
        const referer = req.get('Referer');
        res.redirect(referer || '/shop');
    } catch (error) {
        console.error('Error adding to cart:', error);
        req.flash('error_msg', 'Error adding to cart. Please try again.');
        res.redirect('/shop');
    }
});

// View cart
router.get('/cart', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        console.log('Viewing cart - User:', req.user._id);
        
        // Track cart view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'view_cart',
                details: {}
            });
        } catch (error) {
            console.error('Error tracking cart view:', error);
        }
        
        // Find cart and populate product details
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product');
        
        res.render('shop/cart', {
            title: 'Shopping Cart',
            user: req.user,
            cart: cart || { items: [], totalQuantity: 0, totalAmount: 0 },
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error viewing cart:', error);
        req.flash('error_msg', 'Error loading shopping cart');
        res.redirect('/shop');
    }
});

// Remove item from cart
router.post('/cart/remove/:id', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        const productId = req.params.id;
        console.log(`Removing product ${productId} from cart`);
        
        // Get product details for tracking
        const product = await Product.findById(productId);
        
        // Track remove from cart
        if (product) {
            try {
                await activityTracker.trackActivity(req, {
                    activityType: 'remove_from_cart',
                    details: {
                        productId: product._id,
                        productTitle: product.title
                    }
                });
            } catch (error) {
                console.error('Error tracking remove from cart:', error);
            }
        }
        
        const cart = await Cart.findOne({ user: req.user._id });
        
        if (!cart) {
            console.log('Cart not found');
            req.flash('error_msg', 'Cart not found');
            return res.redirect('/shop');
        }
        
        // Remove the item from cart
        const initialLength = cart.items.length;
        cart.items = cart.items.filter(item => 
            item.product.toString() !== productId
        );
        
        const itemsRemoved = initialLength - cart.items.length;
        console.log(`Removed ${itemsRemoved} item(s) from cart`);
        
        if (itemsRemoved === 0) {
            console.log('No items were removed from cart');
            req.flash('error_msg', 'Item not found in your cart');
            return res.redirect('/shop/cart');
        }
        
        // Save cart (totals are calculated in the pre-save hook)
        await cart.save();
        console.log('Cart updated after removal');
        
        req.flash('success_msg', 'Item removed from cart');
        res.redirect('/shop/cart');
    } catch (error) {
        console.error('Error removing item from cart:', error);
        req.flash('error_msg', 'Error removing item from cart');
        res.redirect('/shop/cart');
    }
});

// Decrease cart item quantity
router.post('/cart/decrease/:id', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        const productId = req.params.id;
        console.log(`Decreasing quantity for product ${productId} in cart`);
        
        const cart = await Cart.findOne({ user: req.user._id });
        
        if (!cart) {
            console.log('Cart not found');
            req.flash('error_msg', 'Cart not found');
            return res.redirect('/shop');
        }
        
        // Find the item in the cart
        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );
        
        if (itemIndex === -1) {
            console.log('Item not found in cart');
            req.flash('error_msg', 'Item not found in cart');
            return res.redirect('/shop/cart');
        }
        
        // Decrease quantity
        if (cart.items[itemIndex].quantity > 1) {
            console.log(`Decreasing quantity from ${cart.items[itemIndex].quantity} to ${cart.items[itemIndex].quantity - 1}`);
            cart.items[itemIndex].quantity -= 1;
        } else {
            // Remove if quantity becomes 0
            console.log('Quantity is 1, removing item from cart');
            cart.items.splice(itemIndex, 1);
        }
        
        // Save cart (totals are calculated in the pre-save hook)
        await cart.save();
        console.log('Cart updated after decreasing quantity');
        
        const referer = req.get('Referer');
        res.redirect(referer || '/shop/cart');
    } catch (error) {
        console.error('Error updating cart:', error);
        req.flash('error_msg', 'Error updating cart');
        res.redirect('/shop/cart');
    }
});

// Update cart item quantity
router.post('/cart/update/:id', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity);
        console.log(`Updating quantity for product ${productId} to ${quantity}`);
        
        if (isNaN(quantity) || quantity < 0) {
            console.log('Invalid quantity');
            req.flash('error_msg', 'Invalid quantity');
            return res.redirect('/shop/cart');
        }
        
        const cart = await Cart.findOne({ user: req.user._id });
        
        if (!cart) {
            console.log('Cart not found');
            req.flash('error_msg', 'Cart not found');
            return res.redirect('/shop');
        }
        
        // Find the item in the cart
        const itemIndex = cart.items.findIndex(item => 
            item.product.toString() === productId
        );
        
        if (itemIndex === -1) {
            console.log('Item not found in cart');
            req.flash('error_msg', 'Item not found in cart');
            return res.redirect('/shop/cart');
        }
        
        // If quantity is 0, remove the item
        if (quantity === 0) {
            console.log('Quantity is 0, removing item from cart');
            cart.items.splice(itemIndex, 1);
        } else {
            // Verify stock availability
            const product = await Product.findById(productId);
            if (!product || quantity > product.stock) {
                console.log(`Only ${product ? product.stock : 0} items available`);
                req.flash('error_msg', `Only ${product ? product.stock : 0} items available`);
                return res.redirect('/shop/cart');
            }
            
            // Update quantity
            console.log(`Updating quantity from ${cart.items[itemIndex].quantity} to ${quantity}`);
            cart.items[itemIndex].quantity = quantity;
        }
        
        // Save cart (totals are calculated in the pre-save hook)
        await cart.save();
        console.log('Cart updated with new quantities');
        
        req.flash('success_msg', 'Cart updated');
        res.redirect('/shop/cart');
    } catch (error) {
        console.error('Error updating cart:', error);
        req.flash('error_msg', 'Error updating cart');
        res.redirect('/shop/cart');
    }
});

// Checkout page
router.get('/checkout', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        // Track checkout page view
        try {
            await activityTracker.trackActivity(req, {
                activityType: 'begin_checkout',
                details: {}
            });
        } catch (error) {
            console.error('Error tracking checkout view:', error);
        }
        
        // Find cart and populate product details
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product');
        
        if (!cart || cart.items.length === 0) {
            req.flash('error_msg', 'Your cart is empty');
            return res.redirect('/shop/cart');
        }
        
        // Get user's addresses
        const user = await User.findById(req.user._id);
        
        res.render('shop/checkout', {
            title: 'Checkout',
            user: user,
            cart: cart,
            messages: {
                success: req.flash('success_msg'),
                error: req.flash('error_msg')
            }
        });
    } catch (error) {
        console.error('Error accessing checkout:', error);
        req.flash('error_msg', 'Error accessing checkout');
        res.redirect('/shop/cart');
    }
});

// Place order
router.post('/place-order', ensureAuthenticated, ensureUser, async (req, res) => {
    try {
        console.log('Processing order - User:', req.user._id);
        
        const { 
            firstName, lastName, email, address, city, 
            postalCode, country, phone, paymentMethod, terms 
        } = req.body;
        
        console.log('Order details received:', {
            firstName, lastName, email, address, city, 
            postalCode, country, phone, paymentMethod
        });
        
        // Validate input
        if (!firstName || !lastName || !email || !address || !city || 
            !postalCode || !country || !phone || !paymentMethod || !terms) {
            console.log('Missing required fields in order form');
            req.flash('error_msg', 'Please provide all required information');
            return res.redirect('/shop/checkout');
        }
        
        try {
            // Get user's cart
            const cart = await Cart.findOne({ user: req.user._id })
                .populate('items.product');
            
            if (!cart || cart.items.length === 0) {
                console.log('Cart is empty or not found');
                req.flash('error_msg', 'Your cart is empty');
                return res.redirect('/shop/cart');
            }
            
            console.log('Cart found with items:', {
                itemCount: cart.items.length,
                totalAmount: cart.totalAmount
            });
            
            // Check for invalid items in cart (product might have been deleted)
            const invalidItems = cart.items.filter(item => !item.product);
            if (invalidItems.length > 0) {
                console.log('Found invalid items in cart:', invalidItems);
                req.flash('error_msg', 'Some items in your cart are no longer available');
                return res.redirect('/shop/cart');
            }
            
            try {
                // Create new order object
                const orderItems = cart.items.map(item => ({
                    product: item.product._id,
                    title: item.product.title,
                    artistName: item.product.artist ? item.product.artist.name : 'Unknown Artist',
                    quantity: item.quantity,
                    price: item.price,
                    seller: item.product.seller
                }));
                
                console.log('Mapped order items:', orderItems.length);
                
                const orderData = {
                    user: req.user._id,
                    items: orderItems,
                    totalAmount: cart.totalAmount,
                    shippingAddress: {
                        firstName,
                        lastName,
                        email,
                        address,
                        city,
                        postalCode,
                        country,
                        phone
                    },
                    paymentMethod,
                    paymentStatus: paymentMethod === 'cash' ? 'pending' : 'paid',
                    orderStatus: 'processing'
                };
                
                console.log('Order data prepared:', {
                    userID: orderData.user,
                    itemCount: orderData.items.length,
                    totalAmount: orderData.totalAmount,
                    paymentMethod: orderData.paymentMethod,
                    paymentStatus: orderData.paymentStatus,
                    orderStatus: orderData.orderStatus
                });
                
                // Create new order
                const newOrder = new Order(orderData);
                
                console.log('Order object created, validating...');
                
                // Validate order before saving
                const validationError = newOrder.validateSync();
                if (validationError) {
                    console.error('Order validation error:', validationError);
                    req.flash('error_msg', 'Invalid order data: ' + validationError.message);
                    return res.redirect('/shop/checkout');
                }
                
                console.log('Order validated, saving to database...');
                
                // Save order to database
                await newOrder.save();
                console.log('Order saved successfully with ID:', newOrder._id);
                
                try {
                    // Track order placement success
                    await activityTracker.trackActivity(req, {
                        activityType: 'purchase',
                        details: {
                            orderId: newOrder._id,
                            orderAmount: cart.totalAmount,
                            itemCount: cart.items.length,
                            paymentMethod: paymentMethod,
                            products: cart.items.map(item => ({
                                id: item.product._id,
                                title: item.product.title,
                                quantity: item.quantity,
                                price: item.price
                            }))
                        }
                    });
                    console.log('Purchase activity tracked');
                } catch (trackError) {
                    console.error('Error tracking purchase:', trackError);
                    // Continue with order process even if tracking fails
                }
                
                try {
                    // Update product stocks
                    console.log('Updating product stock levels');
                    for (const item of cart.items) {
                        if (item.product) {
                            await Product.findByIdAndUpdate(
                                item.product._id,
                                { $inc: { stock: -item.quantity } }
                            );
                        }
                    }
                    console.log('Product stock levels updated');
                } catch (stockError) {
                    console.error('Error updating product stocks:', stockError);
                    // Continue with order process even if stock update fails
                }
                
                try {
                    // Clear cart
                    console.log('Clearing user cart');
                    await Cart.findOneAndDelete({ user: req.user._id });
                    console.log('User cart cleared');
                } catch (cartError) {
                    console.error('Error clearing cart:', cartError);
                    // Continue with order process even if cart clearing fails
                }
                
                console.log('Order process completed successfully');
                req.flash('success_msg', 'Order placed successfully');
                return res.redirect(`/user/orders/${newOrder._id}`);
                
            } catch (orderError) {
                console.error('Error creating or saving order:', orderError);
                req.flash('error_msg', 'Error creating order: ' + orderError.message);
                return res.redirect('/shop/checkout');
            }
        } catch (cartError) {
            console.error('Error retrieving cart:', cartError);
            req.flash('error_msg', 'Error retrieving your shopping cart: ' + cartError.message);
            return res.redirect('/shop/checkout');
        }
    } catch (error) {
        console.error('Error placing order (outer try/catch):', error);
        req.flash('error_msg', 'Error processing your order. Please try again. Details: ' + error.message);
        return res.redirect('/shop/checkout');
    }
});

// Reset cart - completely removes and recreates the cart
router.get('/reset-cart', ensureAuthenticated, async (req, res) => {
    try {
        console.log('Resetting cart for user:', req.user._id);
        
        // Find and log the current cart for debugging
        const oldCart = await Cart.findOne({ user: req.user._id });
        if (oldCart) {
            console.log('Old cart found:', {
                id: oldCart._id,
                itemCount: oldCart.items.length,
                items: oldCart.items.map(item => ({
                    product: item.product,
                    galleryItem: item.galleryItem,
                    quantity: item.quantity,
                    price: item.price
                }))
            });
        } else {
            console.log('No existing cart found');
        }
        
        // Delete the existing cart
        await Cart.findOneAndDelete({ user: req.user._id });
        console.log('Existing cart deleted');
        
        // Create a new empty cart
        const newCart = new Cart({
            user: req.user._id,
            items: []
        });
        
        await newCart.save();
        console.log('New empty cart created with ID:', newCart._id);
        
        req.flash('success_msg', 'Your cart has been reset');
        res.redirect('/shop');
    } catch (error) {
        console.error('Error resetting cart:', error);
        req.flash('error_msg', 'Error resetting cart');
        res.redirect('/shop');
    }
});

// Test route to diagnose cart issues
router.get('/test-cart', ensureAuthenticated, async (req, res) => {
    try {
        console.log('USER INFO:', {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isActive: req.user.isActive
        });
        
        // Try to get cart data without ensureUser middleware
        const cart = await Cart.findOne({ user: req.user._id });
        
        console.log('CART INFO:', cart ? {
            id: cart._id,
            itemCount: cart.items.length,
            items: cart.items.map(item => ({
                product: item.product,
                quantity: item.quantity,
                price: item.price
            }))
        } : 'No cart found');
        
        res.json({
            success: true,
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                isActive: req.user.isActive
            },
            cart: cart ? {
                id: cart._id,
                itemCount: cart.items.length,
                items: cart.items.map(item => ({
                    product: item.product,
                    quantity: item.quantity,
                    price: item.price
                }))
            } : null
        });
    } catch (error) {
        console.error('Error in test-cart route:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 