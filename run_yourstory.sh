#!/bin/bash
echo "Registering YourStory..."
curl -s -X POST http://localhost:3001/sources \
-H "Content-Type: application/json" \
-d '{
  "url": "https://yourstory.com",
  "baseUrl": "https://yourstory.com",
  "domain": "yourstory.com",
  "name": "YourStory",
  "category": "news",
  "priority": 5,
  "isActive": true
}' > source_response.json

SOURCE_ID=$(grep -o '"id":"[^"]*' source_response.json | cut -d'"' -f4)

if [ -z "$SOURCE_ID" ]; then
  echo "Failed to get Source ID"
  cat source_response.json
  exit 1
fi

echo "Triggering Discovery Engine for YourStory ($SOURCE_ID)..."
curl -sS -X POST http://localhost:3001/sources/$SOURCE_ID/discover

echo ""
echo "Waiting for Discovery pipeline to complete..."
while true; do
  if grep -q "Discovery pipeline completed successfully" apps/discovery-service/discovery.log; then
    break
  fi
  sleep 5
done

echo "Crawl Complete! Here are the stats:"
grep -A 10 "stats" apps/discovery-service/discovery.log | tail -n 12
