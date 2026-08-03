import { prisma } from '@/lib/prisma';

export async function validateApiKey(request: Request) {
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
