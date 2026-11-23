#!/bin/bash
# Runs on the server: install deps, verify better-sqlite3 loads, build the frontend.
set -e
cd /var/www/ps-cfo
timeout 900 npm install --no-audit --no-fund 2>&1 | tail -15
node -e "const D=require('better-sqlite3'); const d=new D(':memory:'); console.log('sqlite ok', d.prepare('select sqlite_version() v').get().v)"
echo "--- build"
timeout 900 npm run build 2>&1 | tail -30
ls -la dist | head -20
