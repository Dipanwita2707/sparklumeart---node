#!/bin/bash

# Build the Docker image
echo "Building Docker image..."
docker build -t app:latest .

# Deploy the service to Docker Swarm
echo "Deploying service to Docker Swarm..."
docker stack deploy -c docker-compose.yml app-stack

echo "Service deployed successfully!"
echo "Check the status with: docker service ls" 