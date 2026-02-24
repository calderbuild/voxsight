#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-gen-lang-client-0922333346}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="voxsight-backend"

echo "=== VoxSight Cloud Run Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check gcloud auth
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1 | grep -q .; then
  echo "ERROR: Not authenticated. Run: gcloud auth login"
  exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo "Enabling APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Check GEMINI_API_KEY
if [ -z "${GEMINI_API_KEY:-}" ]; then
  if [ -f backend/.env ]; then
    GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' backend/.env | cut -d= -f2)
  fi
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "ERROR: GEMINI_API_KEY not set. Export it or add to backend/.env"
  exit 1
fi

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source ./backend \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --timeout 300

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
WS_URL=$(echo "$SERVICE_URL" | sed 's|^https://|wss://|')

echo ""
echo "=== Deployment Complete ==="
echo "HTTP: $SERVICE_URL"
echo "WS:   $WS_URL"
echo ""
echo "Update extension/src/shared/constants.ts:"
echo "  export const BACKEND_URL = '$WS_URL';"
echo ""
echo "Then rebuild extension: cd extension && npm run build"
