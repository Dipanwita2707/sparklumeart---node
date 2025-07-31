import { MongoMemoryServer } from 'mongodb-memory-server';
import { connect, connection, disconnect } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const redisMock = require('redis-mock');

let mongoServer: MongoMemoryServer;

jest.setTimeout(300000);
// Mock Redis client
export const redisClient = redisMock.createClient();

// Setup function to run before tests
export const setupTestDB = async () => {
  try {
    mongoServer = await MongoMemoryServer.create({ binary: { version: '4.0.27' } });
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
    if (mongoServer) {
      await mongoServer.stop();
    }
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

// Dummy test to prevent Jest from failing due to no tests
if (process.env.NODE_ENV === 'test') {
  test('setup utilities should load', () => {
    expect(true).toBe(true);
  });
}
