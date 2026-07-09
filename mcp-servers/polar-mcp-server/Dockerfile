# Polar MCP Server Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip prepare script since source files are not copied yet)
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]