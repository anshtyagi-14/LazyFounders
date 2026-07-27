#!/bin/bash
echo "Waiting for Discovery pipeline to complete..."
while true; do
  if grep -q "Discovery pipeline completed successfully" apps/discovery-service/server.log; then
    break
  fi
  sleep 5
done

echo "Crawl Complete! Here are the stats:"
grep -A 10 "stats" apps/discovery-service/server.log | head -n 12

echo ""
echo "Newly extracted articles in the database:"
docker exec lazyfounders-postgres-1 psql -U lazyfounders -d lazyfounders -c "SELECT title, \"wordCount\" FROM scrape_results WHERE \"scrapedAt\" > NOW() - INTERVAL '10 minutes';"
