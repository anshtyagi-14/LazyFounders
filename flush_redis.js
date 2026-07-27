const Redis = require('ioredis');
const redis = new Redis();
redis.flushdb().then(() => {
  console.log('Flushed Redis');
  process.exit(0);
});
