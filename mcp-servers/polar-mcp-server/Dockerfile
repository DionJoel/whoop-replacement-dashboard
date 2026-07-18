# Polar MCP Server Dockerfile - HTTP Version
# Einfacher Dockerfile für den HTTP-Server

FROM node:20-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere Produktions-Dependencies (ohne prepare-Script)
RUN npm ci --only=production --ignore-scripts

# Kopiere Source Code
COPY . .

# Baue TypeScript
RUN npm run build

# Port freigeben
EXPOSE 3000

# Volume für Token-Persistenz
VOLUME ["/app/tokens.json"]

# Startbefehl - HTTP Server
CMD ["npm", "run", "start:http"]