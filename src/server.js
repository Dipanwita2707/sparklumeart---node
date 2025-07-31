const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
const Redis = require('redis');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URL ;

logger.info(`Attempting to connect to MongoDB at: ${MONGODB_URI}`);

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => logger.info('MongoDB connected'))
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Connect to Redis
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_URL = `redis://${REDIS_HOST}:${REDIS_PORT}`;

logger.info(`Attempting to connect to Redis at: ${REDIS_URL}`);

const redisClient = Redis.createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis connection failed after 10 retries');
        return new Error('Redis connection failed');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

redisClient.connect()
  .then(() => logger.info('Redis connection established'))
  .catch(err => {
    logger.error('Redis connection error:', err);
    process.exit(1);
  });

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to SparklumeArt API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthy = mongoose.connection.readyState === 1 && redisClient.isOpen;
  if (healthy) {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(503).json({ 
      status: 'error', 
      message: 'Service unavailable',
      details: {
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        redis: redisClient.isOpen ? 'connected' : 'disconnected'
      }
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server is running on port ${PORT}`);
}); 