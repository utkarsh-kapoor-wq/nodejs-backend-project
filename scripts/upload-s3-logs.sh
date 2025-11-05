#!/bin/bash

# Simple S3 log upload script
# Author: Shubhojit Mitra
# Description: Uploads all files from logs directory directly to S3 bucket

# Configuration
BUCKET_NAME="${AWS_S3_LOG_BUCKET_NAME}"
LOGS_DIR="../logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if logs directory exists
if [ ! -d "$LOGS_DIR" ]; then
    log_error "Logs directory not found: $LOGS_DIR"
    exit 1
fi

# Check if there are any files in logs directory
if [ -z "$(ls -A "$LOGS_DIR" 2>/dev/null)" ]; then
    log_warning "No files found in logs directory: $LOGS_DIR"
    exit 0
fi

# Main upload function
main() {
    echo
    log_info "=== Simple S3 Log Upload ==="
    log_info "Bucket: $BUCKET_NAME"
    log_info "Source: $LOGS_DIR"
    echo
    
    # Upload entire logs directory to S3 (WITHOUT --delete flag)
    log_info "Uploading logs directory to S3..."
    
    if aws s3 sync "$LOGS_DIR" "s3://$BUCKET_NAME" --quiet; then
        log_success "All files uploaded successfully!"
        
        # Show what was uploaded
        log_info "Files in S3 bucket:"
        aws s3 ls "s3://$BUCKET_NAME" --human-readable
        
    else
        log_error "Upload failed!"
        exit 1
    fi
    
    echo
    log_success "Upload completed!"
}

# Run the script
main