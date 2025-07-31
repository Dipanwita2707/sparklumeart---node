# Local CI/CD Pipeline Script
$ErrorActionPreference = "Stop"

# Configuration
$DOCKER_COMPOSE_FILE = "docker-compose.yml"
$DOCKER_COMPOSE_PROD_FILE = "docker-compose.prod.yml"
$NODE_ENV = "production"
$SCALE_FACTOR = 3  # Number of instances to scale to
$LOG_FILE = "cicd.log"
$BACKUP_DIR = ".\backups"
$HEALTH_CHECK_RETRIES = 5
$HEALTH_CHECK_INTERVAL = 10

# Logging function
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path $LOG_FILE -Value $logMessage
}

# Function to check if a command exists
function Test-CommandExists {
    param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try { if (Get-Command $command) { return $true } }
    catch { return $false }
    finally { $ErrorActionPreference = $oldPreference }
}

# Backup function
function Backup-CurrentState {
    Write-Log "Creating backup of current state..." "INFO"
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupPath = Join-Path -Path $BACKUP_DIR -ChildPath "backup_$timestamp"
    
    if (-not (Test-Path $BACKUP_DIR)) {
        New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    }
    
    # Create backup directory
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    
    # Backup docker-compose files
    if (Test-Path $DOCKER_COMPOSE_FILE) {
        Copy-Item -Path $DOCKER_COMPOSE_FILE -Destination $backupPath -Force
    }
    if (Test-Path $DOCKER_COMPOSE_PROD_FILE) {
        Copy-Item -Path $DOCKER_COMPOSE_PROD_FILE -Destination $backupPath -Force
    }
    
    # Backup environment files
    if (Test-Path ".env") {
        Copy-Item -Path ".env" -Destination $backupPath -Force
    }
    
    Write-Log "Backup created at $backupPath" "INFO"
}

# Cleanup function
function Cleanup {
    Write-Log "Cleaning up resources..." "WARN"
    try {
        if (Test-Path $DOCKER_COMPOSE_FILE) {
            docker-compose -f $DOCKER_COMPOSE_FILE down --volumes --remove-orphans
        }
        docker system prune -f
        Write-Log "Cleanup completed successfully" "INFO"
    }
    catch {
        Write-Log "Error during cleanup: $_" "ERROR"
    }
}

# Health check function
function Test-ServiceHealth {
    param (
        [string]$ServiceUrl,
        [int]$Retries = $HEALTH_CHECK_RETRIES,
        [int]$Interval = $HEALTH_CHECK_INTERVAL
    )
    
    for ($i = 0; $i -lt $Retries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $ServiceUrl -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Log "Health check passed for $ServiceUrl" "INFO"
                return $true
            }
        }
        catch {
            Write-Log "Health check attempt $($i + 1) failed: $_" "WARN"
            Start-Sleep -Seconds $Interval
        }
    }
    Write-Log "Health check failed after $Retries attempts" "ERROR"
    return $false
}

# Error handling
trap {
    Write-Log "Error occurred: $_" "ERROR"
    Cleanup
    exit 1
}

# Start pipeline
Write-Log "Starting Local CI/CD Pipeline..." "INFO"

# Check prerequisites
$prerequisites = @("docker", "docker-compose", "node", "npm")
foreach ($prereq in $prerequisites) {
    if (-not (Test-CommandExists $prereq)) {
        Write-Log "$prereq is not installed. Please install it first." "ERROR"
        exit 1
    }
}

# Create backup
Backup-CurrentState

# 1. Continuous Integration Phase
Write-Log "Starting CI Phase..." "INFO"

Write-Log "Installing dependencies..." "INFO"
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Log "Failed to install dependencies" "ERROR"
    exit 1
}

Write-Log "Running linting..." "INFO"
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Log "Linting failed" "ERROR"
    exit 1
}

Write-Log "Running tests..." "INFO"
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Log "Tests failed" "ERROR"
    exit 1
}

# 2. Build Phase
Write-Log "Starting Build Phase..." "INFO"
Write-Log "Building Docker images..." "INFO"
docker-compose -f $DOCKER_COMPOSE_FILE build
if ($LASTEXITCODE -ne 0) {
    Write-Log "Docker build failed" "ERROR"
    exit 1
}

# 3. Deployment Phase
Write-Log "Starting Deployment Phase..." "INFO"

# Create production docker-compose file with scaling
$dockerComposeContent = Get-Content $DOCKER_COMPOSE_FILE -Raw
$dockerComposeContent = $dockerComposeContent -replace 'build: \.', 'build: .\n    deploy:\n      replicas: ' + $SCALE_FACTOR
$dockerComposeContent | Set-Content $DOCKER_COMPOSE_PROD_FILE

# Start services with scaling
Write-Log "Starting services with $SCALE_FACTOR replicas..." "INFO"
docker-compose -f $DOCKER_COMPOSE_PROD_FILE up -d
if ($LASTEXITCODE -ne 0) {
    Write-Log "Failed to start services" "ERROR"
    exit 1
}

# 4. Health Check Phase
Write-Log "Starting Health Check Phase..." "INFO"

# Check main application
if (-not (Test-ServiceHealth "http://localhost:3000/health")) {
    Write-Log "Application health check failed" "ERROR"
    Cleanup
    exit 1
}

# Final status
Write-Log "CI/CD Pipeline completed successfully!" "INFO"
Write-Log "Application is running at http://localhost:3000" "INFO"

# Display service status
Write-Log "Current service status:" "INFO"
docker-compose -f $DOCKER_COMPOSE_PROD_FILE ps 