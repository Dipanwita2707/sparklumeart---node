/// <reference types="jest" />
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { setupTestDB, teardownTestDB, resetTestDB, redisMock } from './setup';

const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

describe('Server Integration Tests', () => {
  // Setup before all tests
  beforeAll(async () => {
    await setupTestDB();
  });

  // Cleanup after all tests
  afterAll(async () => {
    await teardownTestDB();
  });

  // Reset database between tests
  beforeEach(async () => {
    await resetTestDB();
  });

  describe('Health Check', () => {
    it('should return 200 and ok status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app).get('/non-existent');
      expect(response.status).toBe(404);
    });
  });

  describe('Security Headers', () => {
    it('should have security headers set by helmet', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });

  describe('Redis Connection', () => {
    it('should connect to redis mock', async () => {
      expect(redisMock.connected).toBe(true);
    });
  });
}); 