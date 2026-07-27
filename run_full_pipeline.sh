#!/bin/bash
echo "Triggering Discovery Engine..."
curl -sS -X POST http://localhost:3001/sources/414796d2-4aa4-4fbf-a0f1-1c1a9a831d55/discover

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

echo ""
echo "Checking newly scraped articles in PostgreSQL:"
docker exec lazyfounders-postgres-1 psql -U lazyfounders -d lazyfounders -c "SELECT title FROM scrape_results WHERE scraped_at > NOW() - INTERVAL '5 minutes';"
