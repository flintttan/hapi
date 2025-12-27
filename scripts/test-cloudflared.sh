#!/bin/bash
# Test script for cloudflared tunnel

echo "Testing HAPI server accessibility..."
echo ""

# Check if server is running
if curl -s http://localhost:3006/ > /dev/null; then
    echo "✅ HAPI server is running at http://localhost:3006"
else
    echo "❌ HAPI server is NOT accessible at http://localhost:3006"
    echo "Please start the server with: docker-compose up -d"
    exit 1
fi

echo ""
echo "Server is ready for cloudflared tunnel!"
echo ""
echo "To create a temporary public tunnel, run:"
echo "  cloudflared tunnel --url http://localhost:3006"
echo ""
echo "The tunnel URL will be displayed in the output."
echo "You can then configure this URL as WEBAPP_URL in your .env file."
