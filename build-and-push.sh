#!/bin/bash
set -e

# Update these variables with your actual AWS details!
AWS_REGION="ap-south-1"
AWS_ACCOUNT_ID="248746142729"
CLUSTER_NAME="lazyfounders-cluster"

# Array of services to build, push, and deploy
# Format: "directory_name:ecr_repository_name:ecs_service_name"
SERVICES=(
  "api-dashboard:lf-api-dashboard:lf-api-dashboard-task-service"
  # "discovery-service:lf-discovery-service:lf-discovery-service-task-service"
  # "categorization-service:lf-categorization-service:lf-categorization-service-task-service"
  # "scraper-service:lf-scraper-service:lf-scraper-service-task-service"
  # "intelligence-service:lf-intelligence-service:lf-intelligence-service-task-service"
  # "publishing-service:lf-publishing-service:lf-publishing-service-task-service"
)

echo "Logging in to AWS ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

for entry in "${SERVICES[@]}"; do
  IFS=':' read -r APP_DIR REPO_NAME SERVICE_NAME <<< "$entry"
  
  echo "=========================================="
  echo "Building $APP_DIR..."
  echo "=========================================="
  docker build -t $REPO_NAME:latest -f apps/$APP_DIR/Dockerfile .
  
  echo "Tagging image..."
  docker tag $REPO_NAME:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:latest
  
  echo "Pushing image to ECR..."
  docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:latest
  
  # Note: To force deploy, uncomment the lines below
  # echo "Forcing new ECS deployment for $SERVICE_NAME..."
  # aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment
done

echo "✅ All services built and pushed successfully!"
