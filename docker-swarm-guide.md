# Docker Swarm and Container Orchestration Guide

## Introduction to Container Orchestration

Container orchestration is the automated management of containerized applications. It handles:
- Deployment
- Scaling
- Load balancing
- Service discovery
- Health monitoring

Docker Swarm is Docker's native orchestration tool that allows you to create and manage a cluster of Docker nodes.

## Docker Swarm Cluster

### Creating a Docker Swarm Cluster

1. Initialize Docker Swarm on the manager node:
   ```bash
   docker swarm init --advertise-addr <MANAGER-IP>
   ```

2. This command outputs a token for worker nodes to join the swarm.

3. On worker nodes, run:
   ```bash
   docker swarm join --token <TOKEN> <MANAGER-IP>:2377
   ```

4. To view nodes in the swarm:
   ```bash
   docker node ls
   ```

### Initializing Docker Swarm

The initialization process creates:
- A Raft consensus group among the managers
- A self-signed CA to secure node communications
- Internal overlay networks for control and data traffic

## Docker Networks

### Introduction to Docker Networks

Docker networks provide isolated communication paths between containers. By default, Docker Swarm creates:
- `ingress`: A special overlay network for load balancing among swarm nodes
- `docker_gwbridge`: A bridge network connecting overlay networks to host network

### Creating a Service with Custom Networks

1. Create an overlay network:
   ```bash
   docker network create --driver overlay app-network
   ```

2. Deploy services using this network:
   ```bash
   docker service create \
     --name api-service \
     --network app-network \
     --replicas 3 \
     --publish 3000:3000 \
     your-app-image
   ```

3. Services on the same overlay network can communicate by service name.

## Continuous Integration

### Introduction to Continuous Integration

Continuous Integration (CI) is the practice of automatically integrating code changes from multiple contributors into a single software project. The process includes:
- Automated building
- Testing
- Deployment

### CI/CD Pipeline for Docker Swarm

Our project uses GitHub Actions for CI/CD with the following workflow:
1. Push code to repository
2. GitHub Actions builds and tests the code
3. If tests pass, build a Docker image
4. Push the image to a registry
5. Deploy to Docker Swarm

## Project Implementation

Our project implements Docker Swarm and container orchestration as follows:

1. Docker Compose for defining multi-container applications
2. Docker Swarm for orchestrating containers across multiple nodes
3. Custom overlay networks for inter-service communication
4. CI/CD pipeline for automated testing and deployment

## Commands Cheat Sheet

### Docker Swarm
- Initialize: `docker swarm init`
- List nodes: `docker node ls`
- Leave swarm: `docker swarm leave --force`

### Docker Services
- Create: `docker service create --name my-service image:tag`
- List: `docker service ls`
- Scale: `docker service scale my-service=5`
- Remove: `docker service rm my-service`

### Docker Stack
- Deploy: `docker stack deploy -c docker-compose.yml my-stack`
- List services: `docker stack services my-stack`
- Remove: `docker stack rm my-stack`

### Docker Networks
- Create: `docker network create --driver overlay my-network`
- List: `docker network ls`
- Inspect: `docker network inspect my-network`
- Remove: `docker network rm my-network` 