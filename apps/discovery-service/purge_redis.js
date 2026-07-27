const Redis = require('ioredis');
const redis = new Redis({ host: 'localhost', port: 6379 });

async function purgeDomain(domain) {
  let cursor = '0';
  let deletedCount = 0;

  do {
    const reply = await redis.scan(cursor, 'MATCH', `${domain}:*`, 'COUNT', 100);
    cursor = reply[0];
    const keys = reply[1];

    if (keys.length > 0) {
      const count = await redis.del(...keys);
      deletedCount += count;
    }
  } while (cursor !== '0');

  console.log(`Successfully deleted ${deletedCount} keys for domain: ${domain}`);
  redis.disconnect();
}

purgeDomain('inc42.com');
