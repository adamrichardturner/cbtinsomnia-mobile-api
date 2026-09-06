#!/bin/sh
set -eu

echo "waiting for database..."
retries=60
until node docker/wait-for-db.mjs; do
  retries=$((retries - 1))
  if [ "$retries" -le 0 ]; then
    echo "database did not become ready in time" >&2
    exit 1
  fi
  sleep 1
done

echo "running migrations..."
npx tsx ./node_modules/knex/bin/cli.js migrate:latest --knexfile knexfile.ts

echo "starting API on :${PORT:-4001}"
exec node dist/server.js
