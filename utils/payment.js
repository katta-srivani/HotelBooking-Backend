const Razorpay = require('razorpay');
const crypto = require('crypto');

let instance;

// Initialize Razorpay
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'your_key_id') {
  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// ------------------- CREATE ORDER -------------------
exports.createOrder = async (amount, currency = 'INR') => {
  try {
    if (!instance) {
      console.warn('⚠️ Razorpay not configured. Using mock order.');
      return {
        id: 'order_' + Math.random().toString(36).substr(2, 9),
        amount: amount * 100,
        currency,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    const options = {
      amount: amount * 100,
      currency,
      payment_capture: 1,
    };

    const order = await instance.orders.create(options);
    return order;

  } catch (error) {
    console.error("Razorpay error:", error);
    throw error;
  }
};

// ------------------- VERIFY PAYMENT -------------------
exports.verifyPayment = (order_id, payment_id, signature) => {

  if (!instance) {
    console.warn('⚠️ Mock verification enabled');
    return true;
  }

  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(order_id + '|' + payment_id)
    .digest('hex');

  return generated_signature === signature;
};