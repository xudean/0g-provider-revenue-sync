#!/bin/sh
set -eu

echo "Waiting for MySQL and initializing schema..."
until node src/init-db.js; do
  echo "MySQL not ready yet, retrying in 3 seconds..."
  sleep 3
done

echo "Starting revenue sync service..."
exec node src/server.js
