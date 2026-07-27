#!/bin/bash
# Start server in background
cd apps/discovery-service
npm start > server.log 2>&1 &
SERVER_PID=$!
echo "Server started with PID $SERVER_PID"

# Wait for server to be healthy
sleep 10

# Trigger crawl
echo "Triggering discovery pipeline..."
curl -sS -X POST http://localhost:3001/sources/414796d2-4aa4-4fbf-a0f1-1c1a9a831d55/discover

# Wait for pipeline to complete
echo "Waiting for pipeline to complete..."
sleep 60
