#!/bin/bash

# Initialize Docker Swarm
echo "Initializing Docker Swarm..."
docker swarm init

# Create the overlay network
echo "Creating overlay network..."
docker network create --driver overlay app-network

echo "Docker Swarm initialized successfully!"
echo "To add a worker to this swarm, run the command shown above on the worker node." 