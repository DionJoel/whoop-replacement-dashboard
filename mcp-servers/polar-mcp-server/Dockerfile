# Polar MCP Server Dockerfile - HTTP Version
# Einfacher Dockerfile für den HTTP-Server

FROM node:20-alpine

WORKDIR /app

# Kopiere package files
COPY package*.json ./

# Installiere ALLE Dependencies (inkl. devDependencies für Build)
RUN npm ci

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