# Master script to run all components
$ErrorActionPreference = "Stop"

Write-Host "Starting SparklumeArt System..." -ForegroundColor Green

# Function to check if a command exists
function Test-CommandExists {
    param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try { if (Get-Command $command) { return $true } }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

# Check Git installation for OpenSSL
$gitPath = "C:\Program Files\Git\usr\bin\openssl.exe"
if (Test-Path $gitPath) {
    $env:Path += ";C:\Program Files\Git\usr\bin"
    Write-Host "Using OpenSSL from Git installation" -ForegroundColor Green
} else {
    Write-Host "ERROR: OpenSSL not found. Please install Git for Windows which includes OpenSSL" -ForegroundColor Red
    Write-Host "Download Git from: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

# Check prerequisites
$prerequisites = @("docker", "docker-compose", "node", "npm")
foreach ($prereq in $prerequisites) {
    if (-not (Test-CommandExists $prereq)) {
        Write-Host "ERROR: $prereq is not installed. Please install it first." -ForegroundColor Red
        exit 1
    }
}

# Create required directories if they don't exist
$directories = @(
    "nginx/ssl",
    "nginx/conf.d",
    "grafana/provisioning",
    "backups"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory: $dir" -ForegroundColor Yellow
    }
}

# Generate SSL certificates if they don't exist
if (-not (Test-Path "nginx/ssl/server.key") -or -not (Test-Path "nginx/ssl/server.crt")) {
    Write-Host "Generating SSL certificates..." -ForegroundColor Cyan
    .\generate-ssl.ps1
} else {
    Write-Host "SSL certificates already exist, skipping generation" -ForegroundColor Green
}

# Start the production environment
Write-Host "Starting production environment..." -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml up -d

# Check if services are running
Write-Host "Checking service status..." -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

# Display access information
Write-Host "`nSystem is running!" -ForegroundColor Green
Write-Host "`nAccess Points:" -ForegroundColor Yellow
Write-Host "Application: https://localhost" -ForegroundColor Cyan
Write-Host "Grafana Dashboard: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Prometheus Metrics: http://localhost:9090" -ForegroundColor Cyan
Write-Host "`nDefault Credentials:" -ForegroundColor Yellow
Write-Host "Grafana - Username: admin, Password: admin" -ForegroundColor Cyan

Write-Host "`nTo stop the system, run: docker-compose -f docker-compose.prod.yml down" -ForegroundColor Yellow 