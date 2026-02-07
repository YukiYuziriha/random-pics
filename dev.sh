#!/bin/bash

# Kill existing processes on port 3000 and build watcher
lsof -ti:3000 | xargs kill -9 2>/dev/null
pkill -f "bun build.*--watch" 2>/dev/null

# Start build watcher in background
bun run build:watch &
BUILD_PID=$!

# Start server in background
bun ./server.ts &
SERVER_PID=$!

# Wait a bit for them to start
sleep 2

# On exit, kill background processes
trap "kill $BUILD_PID $SERVER_PID 2>/dev/null" EXIT

# Keep script running
wait
