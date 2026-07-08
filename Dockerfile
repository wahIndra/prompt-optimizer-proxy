FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Ensure data directory exists for SQLite
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start in foreground for Docker
CMD ["npm", "start"]
