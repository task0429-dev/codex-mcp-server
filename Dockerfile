# MCP Server Dockerfile for production deployment
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy compiled server and static control UI
COPY dist/ ./dist/
COPY control-ui/ ./control-ui/
COPY workspaces/ ./workspaces/

# Create data directories
RUN mkdir -p data/sessions data/memory data/logs

# Expose port for HTTP mode
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Default command (can be overridden)
CMD ["node", "dist/index-http.js"]
