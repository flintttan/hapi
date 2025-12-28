#!/bin/bash

# Configuration
API_URL="https://your-hapi-server.com/api"
USERNAME="test_user_$(date +%s)"
EMAIL="test_${USERNAME}@example.com"
PASSWORD="TestPassword123!"

echo "=========================================="
echo "HAPI Token Generation Script"
echo "=========================================="
echo ""

# Step 1: Register a new account
echo "Step 1: Registering new account..."
echo "Username: $USERNAME"
echo "Email: $EMAIL"
echo ""

REGISTER_RESPONSE=$(curl -s -X POST "${API_URL}/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${USERNAME}\",
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\"
  }")

echo "Registration Response:"
echo "$REGISTER_RESPONSE" | jq '.'
echo ""

# Extract JWT token from registration response
JWT_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token')

if [ "$JWT_TOKEN" == "null" ] || [ -z "$JWT_TOKEN" ]; then
    echo "❌ Registration failed. Response:"
    echo "$REGISTER_RESPONSE" | jq '.'
    exit 1
fi

echo "✅ Registration successful!"
echo "JWT Token: $JWT_TOKEN"
echo ""

# Step 2: Login with the account (verify credentials)
echo "Step 2: Logging in with credentials..."
echo ""

AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/auth" \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"${USERNAME}\",
    \"password\": \"${PASSWORD}\"
  }")

echo "Authentication Response:"
echo "$AUTH_RESPONSE" | jq '.'
echo ""

# Extract JWT token from auth response (should be the same or a new one)
NEW_JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.token')

if [ "$NEW_JWT_TOKEN" == "null" ] || [ -z "$NEW_JWT_TOKEN" ]; then
    echo "❌ Authentication failed. Response:"
    echo "$AUTH_RESPONSE" | jq '.'
    exit 1
fi

echo "✅ Login successful!"
echo "JWT Token: $NEW_JWT_TOKEN"
echo ""

# Use the newer token
JWT_TOKEN="$NEW_JWT_TOKEN"

# Step 3: Generate a CLI Token
echo "Step 3: Generating CLI Token..."
echo ""

CLI_TOKEN_RESPONSE=$(curl -s -X POST "${API_URL}/cli-tokens" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d "{
    \"name\": \"Generated via script at $(date +'%Y-%m-%d %H:%M:%S')\"
  }")

echo "CLI Token Generation Response:"
echo "$CLI_TOKEN_RESPONSE" | jq '.'
echo ""

# Extract CLI token
CLI_TOKEN=$(echo "$CLI_TOKEN_RESPONSE" | jq -r '.token')

if [ "$CLI_TOKEN" == "null" ] || [ -z "$CLI_TOKEN" ]; then
    echo "❌ CLI Token generation failed. Response:"
    echo "$CLI_TOKEN_RESPONSE" | jq '.'
    exit 1
fi

echo "✅ CLI Token generated successfully!"
echo ""
echo "=========================================="
echo "FINAL RESULTS"
echo "=========================================="
echo "Username: $USERNAME"
echo "Password: $PASSWORD"
echo "Email: $EMAIL"
echo ""
echo "JWT Token: $JWT_TOKEN"
echo ""
echo "🎉 CLI Token (use this for API calls):"
echo "$CLI_TOKEN"
echo ""
echo "=========================================="
echo ""
echo "To verify the token works, run:"
echo "curl -H \"Authorization: Bearer $CLI_TOKEN\" ${API_URL}/sessions"
echo ""
