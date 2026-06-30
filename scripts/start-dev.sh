#!/bin/bash
# The Tell - Development Startup Script (Bash)
# Starts PostgreSQL in Docker, runs migrations, seeds database, and launches dev servers

set -e

echo "🚀 Starting The Tell development environment..."

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker."
    exit 1
fi

# Start PostgreSQL container
echo ""
echo "📦 Starting PostgreSQL container..."
docker-compose up -d db

# Wait for database to be ready
echo ""
echo "⏳ Waiting for database to be ready..."
max_attempts=30
attempt=0
until docker exec the_tell-db pg_isready -U thell_user -d the_tell > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo "❌ Database failed to start within timeout."
        exit 1
    fi
    sleep 1
done
echo "✅ Database is ready!"

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env file not found. Copy from .env.example and configure."
    exit 1
fi

# Run Prisma migrations
echo ""
echo "🔄 Running database migrations..."
pnpm prisma migrate dev

# Seed database
echo ""
echo "🌱 Seeding database..."
pnpm prisma db seed || echo "⚠️  Seed failed (may already be seeded)"

echo ""
echo "✅ Database setup complete!"

# Start backend server in background
echo ""
echo "🐍 Starting Python backend..."
(cd backend && source .venv/bin/activate && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

# Start frontend dev server in background
echo ""
echo "🎨 Starting Next.js frontend..."
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "✨ Development environment is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# Trap SIGINT and SIGTERM to clean up background processes
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for background processes
wait
