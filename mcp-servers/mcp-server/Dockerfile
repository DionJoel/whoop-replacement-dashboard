# Minimales Docker-Image für den MCP-Server
FROM node:20-alpine

# Arbeitsverzeichnis
WORKDIR /app

# Abhängigkeiten installieren
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Quellcode kopieren
COPY . .

# Build (falls nicht bereits gebuildet)
RUN npm run build

# Port freigeben
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
    if (res.statusCode !== 200) process.exit(1); \
  }).on('error', () => process.exit(1))" || exit 1

# Startbefehl
CMD ["npm", "run", "start"]
