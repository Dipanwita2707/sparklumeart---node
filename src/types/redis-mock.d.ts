declare module 'redis-mock' {
  import { RedisClient } from 'redis';

  class RedisMock extends RedisClient {
    constructor(options?: any);
    connected: boolean;
  }

  export = RedisMock;
} 