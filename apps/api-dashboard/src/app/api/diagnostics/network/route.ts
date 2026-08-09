import { NextResponse } from 'next/server';
import net from 'net';

async function testConnection(host: string, port: number, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = '';

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      status = 'SUCCESS: Connection established!';
      socket.destroy();
      resolve(status);
    });

    socket.on('timeout', () => {
      status = 'ERROR (ETIMEDOUT): Connection timed out. This means the firewall (Security Group) is blocking the port, or the IP is unreachable (e.g. wrong IP).';
      socket.destroy();
      resolve(status);
    });

    socket.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') {
        status = 'ERROR (ECONNREFUSED): Connection refused. This means the firewall allowed the traffic, BUT NO CONTAINER is listening on that port! (Did you map Host Port to Container Port?)';
      } else {
        status = `ERROR (${err.code}): ${err.message}`;
      }
      resolve(status);
    });

    socket.connect(port, host);
  });
}

export async function GET() {
  try {
    const discoveryUrl = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3001';
    
    // Parse URL
    let host = 'localhost';
    let port = 3001;
    
    try {
      const parsed = new URL(discoveryUrl);
      host = parsed.hostname;
      port = parseInt(parsed.port || '80', 10);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid DISCOVERY_SERVICE_URL format', discoveryUrl });
    }

    const connectionTest = await testConnection(host, port);

    return NextResponse.json({
      targetUrl: discoveryUrl,
      parsedHost: host,
      parsedPort: port,
      connectionTestResult: connectionTest
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
