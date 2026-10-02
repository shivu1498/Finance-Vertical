#!/usr/bin/env bash
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies, this only happens once..."
  npm install
fi
echo "Starting StalkingStocks..."
npm start
