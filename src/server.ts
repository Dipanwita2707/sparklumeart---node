import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { connect } from 'mongoose';
import { createClient } from 'redis';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Connect to MongoDB
const connectDB = async () => {
  try {
    await connect(process.env.MONGODB_URL || 'mongodb://localhost:27017/sparklumeart');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Connect to Redis
const connectRedis = async () => {
  try {
    const redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();
    console.log('Redis connected');
  } catch (error) {
    console.error('Redis connection error:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await connectDB();
  await connectRedis();
  
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer(); 