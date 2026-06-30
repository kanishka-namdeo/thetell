#!/usr/bin/env pwsh
# The Tell - Development Startup Script (PowerShell)
# Starts PostgreSQL in Docker, runs migrations, seeds database, and launches dev servers

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting The Tell development environment..." -ForegroundColor Cyan

# Check Docker is running
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

# Start PostgreSQL container
Write-Host "`n📦 Starting PostgreSQL container..." -ForegroundColor Yellow
docker-compose up -d db

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start PostgreSQL container." -ForegroundColor Red
    exit 1
}

# Wait for database to be ready
Write-Host "`n⏳ Waiting for database to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
do {
    $attempt++
    Start-Sleep -Seconds 1
    $result = docker exec the_tell-db pg_isready -U thell_user -d the_tell 2>&1
    $ready = $result -match "accepting connections"
} while (-not $ready -and $attempt -lt $maxAttempts)

if (-not $ready) {
    Write-Host "❌ Database failed to start within timeout." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database is ready!" -ForegroundColor Green

# Load environment variables
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match "^(.+?)=(.*)$" -and $_ -notmatch "^#") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
        }
    }
} else {
    Write-Host "❌ .env file not found. Copy from .env.example and configure." -ForegroundColor Red
    exit 1
}

# Run Prisma migrations
Write-Host "`n🔄 Running database migrations..." -ForegroundColor Yellow
pnpm prisma migrate dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Migration failed." -ForegroundColor Red
    exit 1
}

# Seed database
Write-Host "`n🌱 Seeding database..." -ForegroundColor Yellow
pnpm prisma db seed

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Seed failed (may already be seeded)." -ForegroundColor Yellow
}

Write-Host "`n✅ Database setup complete!" -ForegroundColor Green

# Start backend server
Write-Host "`n🐍 Starting Python backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\.venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# Start frontend dev server
Write-Host "`n🎨 Starting Next.js frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "pnpm dev"

Write-Host "`n✨ Development environment is running!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "   Backend API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C to stop all services." -ForegroundColor Gray
