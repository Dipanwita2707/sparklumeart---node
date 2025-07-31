# Create SSL directory
$sslDir = "nginx/ssl"
if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force
}

# Generate SSL certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
    -keyout "$sslDir/server.key" `
    -out "$sslDir/server.crt" `
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

Write-Host "SSL certificates generated successfully in $sslDir" 