import { prisma } from '@/lib/prisma';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const RATE_LIMITED = { valid: false, status: 429, error: 'Rate limit exceeded. Try again in a minute.' } as const;

export async function validateApiKey(request: Request) {
  // Per-IP first, so guessing keys is throttled before any database lookup.
  if (!(await rateLimit('api-v1-ip', clientIp(request.headers), 120, 60)).ok) return RATE_LIMITED;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header. Use format: Bearer <API_KEY>' };
  }

  const key = authHeader.split(' ')[1];
  
  if (!key) {
    return { valid: false, error: 'No API key provided' };
  }

  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key }
    });

    if (!apiKeyRecord) {
      return { valid: false, error: 'Invalid API key' };
    }

    if (!apiKeyRecord.isActive) {
      return { valid: false, error: 'API key is revoked or inactive' };
    }

    if (!(await rateLimit('api-v1-key', apiKeyRecord.id, 60, 60)).ok) return RATE_LIMITED;

    // Increment usage asynchronously
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { 
        requestsCount: { increment: 1 },
        lastUsedAt: new Date()
      }
    }).catch(console.error);

    return { valid: true, apiKey: apiKeyRecord };
  } catch (err) {
    console.error('API key validation error:', err);
    return { valid: false, error: 'Internal server error during authentication' };
  }
}
