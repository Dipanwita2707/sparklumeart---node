import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, connection, disconnect } from 'mongoose';
import RedisMock from 'redis-mock';

let mongoServer: MongoMemoryServer;

// Mock Redis client
export const redisMock = new RedisMock();

// Setup function to run before tests
export const setupTestDB = async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await connect(mongoUri);
  } catch (error) {
    console.error('Test DB Setup Error:', error);
    throw error;
  }
};

// Teardown function to run after tests
export const teardownTestDB = async () => {
  try {
    if (connection.db) {
      await connection.dropDatabase();
    }
    await disconnect();
    await mongoServer.stop();
  } catch (error) {
    console.error('Test DB Teardown Error:', error);
    throw error;
  }
};

// Reset function to run between tests
export const resetTestDB = async () => {
  try {
    if (!connection.db) {
      throw new Error('Database connection not established');
    }
    const collections = await connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Test DB Reset Error:', error);
    throw error;
  }
}; 