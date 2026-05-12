#!/bin/bash
max_retries=3
count=0
success=false

while [ $count -lt $max_retries ]; do
  echo "Attempt $((count+1)) to pull images..."
  output=$(docker compose pull 2>&1)
  echo "$output"
  if [[ $output == *"TLS handshake timeout"* ]]; then
    echo "TLS handshake timeout detected. Retrying..."
    ((count++))
    sleep 5
  elif [[ $? -eq 0 ]]; then
    echo "Pull successful."
    success=true
    break
  else
    echo "Pull failed with a different error."
    break
  fi
done

if [ "$success" = true ]; then
  echo "Starting containers..."
  docker compose up -d
  docker compose ps
  
  # Check for unhealthy or exited services
  services=$(docker compose ps --format json | jq -r '. | select(.Health != "healthy" and .State != "running") | .Name')
  if [ -n "$services" ]; then
    for service in $services; do
      echo "Logs for service $service:"
      docker compose logs --tail 120 "$service"
    done
  fi
else
  echo "Docker pull failed after $max_retries attempts or encountered a non-retryable error."
  exit 1
fi
