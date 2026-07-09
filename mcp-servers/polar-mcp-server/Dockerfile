# Polar MCP Server Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build if needed
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]