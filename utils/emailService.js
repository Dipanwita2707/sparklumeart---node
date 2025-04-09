const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

const sendOTP = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Email Verification OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a90e2; text-align: center;">Email Verification</h2>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; text-align: center;">
                        <p style="font-size: 18px; margin-bottom: 20px;">Your verification code is:</p>
                        <div style="background-color: #4a90e2; color: white; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; display: inline-block;">
                            ${otp}
                        </div>
                        <p style="margin-top: 20px; color: #666;">This code will expire in 10 minutes.</p>
                        <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('OTP email sent successfully');
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw error;
    }
};

const sendPasswordResetEmail = async (email, resetToken) => {
    try {
        const resetUrl = `${process.env.BASE_URL}/auth/reset-password/${resetToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a90e2; text-align: center;">Password Reset Request</h2>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                        <p style="font-size: 16px; margin-bottom: 20px;">You requested to reset your password. Click the button below to proceed:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" style="background-color: #4a90e2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
                        <p style="color: #666; font-size: 14px;">If you didn't request this password reset, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('Password reset email sent successfully');
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error;
    }
};

const sendOrderStatusEmail = async (order, user) => {
    try {
        // Format the status for display
        const statusDisplay = {
            'processing': 'Processing',
            'approved': 'Approved',
            'in_transit': 'Shipped',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled'
        };

        // Create appropriate messaging based on order status
        let statusMessage = '';
        let actionMessage = '';

        switch(order.orderStatus) {
            case 'processing':
                statusMessage = 'We have received your order and it is being processed.';
                actionMessage = 'Our team is preparing your items for shipment.';
                break;
            case 'approved':
                statusMessage = 'Your order has been approved and is ready for shipping.';
                actionMessage = 'Your items will be shipped soon.';
                break;
            case 'in_transit':
                statusMessage = 'Your order has been shipped and is on its way!';
                actionMessage = `Your tracking number is: <strong>${order.trackingNumber || 'Not available'}</strong>`;
                if (order.estimatedDeliveryDate) {
                    const date = new Date(order.estimatedDeliveryDate).toLocaleDateString();
                    actionMessage += `<br>Estimated delivery date: <strong>${date}</strong>`;
                }
                break;
            case 'delivered':
                statusMessage = 'Your order has been delivered. Thank you for shopping with us!';
                actionMessage = 'We hope you enjoy your purchase. If you have any issues, please contact our customer support.';
                break;
            case 'cancelled':
                statusMessage = 'Your order has been cancelled.';
                actionMessage = 'If you did not request this cancellation, please contact our customer support immediately.';
                break;
            default:
                statusMessage = `Order status: ${order.orderStatus}`;
                actionMessage = 'Thank you for your order.';
        }

        // Format order items for email
        const itemsList = order.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.price.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `Order ${order._id.toString().substring(0, 8)} - ${statusDisplay[order.orderStatus]}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a90e2; text-align: center;">Order Update</h2>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                        <p style="font-size: 16px;">Hello ${user.name},</p>
                        <p style="font-size: 16px;">${statusMessage}</p>
                        <p style="font-size: 16px;">${actionMessage}</p>
                        
                        <div style="margin: 30px 0; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
                            <div style="background-color: #4a90e2; color: white; padding: 10px 15px;">
                                <h3 style="margin: 0;">Order Summary</h3>
                            </div>
                            <div style="padding: 15px;">
                                <p><strong>Order ID:</strong> ${order._id.toString().substring(0, 8)}...</p>
                                <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
                                <p><strong>Status:</strong> ${statusDisplay[order.orderStatus]}</p>
                                
                                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                                    <thead>
                                        <tr style="background-color: #f2f2f2;">
                                            <th style="padding: 10px; text-align: left;">Product</th>
                                            <th style="padding: 10px; text-align: center;">Quantity</th>
                                            <th style="padding: 10px; text-align: right;">Price</th>
                                            <th style="padding: 10px; text-align: right;">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsList}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colspan="3" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
                                            <td style="padding: 10px; text-align: right; font-weight: bold;">$${order.totalAmount.toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        
                        <p style="margin-top: 30px;">Thank you for shopping with us!</p>
                        <p style="color: #666; font-size: 14px;">If you have any questions about your order, please contact our customer service team.</p>
                    </div>
                </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`Order status email sent for order ${order._id}, status: ${order.orderStatus}`);
        return result;
    } catch (error) {
        console.error('Error sending order status email:', error);
        throw error;
    }
};

async function sendDeliveryDateEmail(email, { requestTitle, deliveryDate, sellerName }) {
    const formattedDate = new Date(deliveryDate).toLocaleDateString();
    const subject = `Delivery Date Update for ${requestTitle}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4a90e2; text-align: center;">Delivery Date Update</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                <p>Hello,</p>
                <p>The seller ${sellerName} has provided a tentative delivery date for your custom request "${requestTitle}".</p>
                <p><strong>Tentative Delivery Date:</strong> ${formattedDate}</p>
                <p>You will receive another notification when the item is shipped.</p>
                <p>Thank you for using our service!</p>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject,
            html
        });
        console.log('Delivery date email sent successfully');
    } catch (error) {
        console.error('Error sending delivery date email:', error);
        throw error;
    }
}

async function sendShippingUpdateEmail(email, { requestTitle, trackingId, billNumber, sellerName }) {
    const subject = `Shipping Update for ${requestTitle}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4a90e2; text-align: center;">Shipping Update</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px;">
                <p>Hello,</p>
                <p>Great news! Your custom request "${requestTitle}" has been shipped by ${sellerName}.</p>
                <p><strong>Bill Number:</strong> ${billNumber}</p>
                <p><strong>Tracking ID:</strong> ${trackingId}</p>
                <p>You can use this tracking ID to monitor your shipment's progress.</p>
                <p>Thank you for using our service!</p>
            </div>
        </div>
    `;

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject,
            html
        });
        console.log('Shipping update email sent successfully');
    } catch (error) {
        console.error('Error sending shipping update email:', error);
        throw error;
    }
}

module.exports = {
    sendOTP,
    sendPasswordResetEmail,
    sendOrderStatusEmail,
    sendDeliveryDateEmail,
    sendShippingUpdateEmail
}; 