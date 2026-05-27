# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run the application with Node.js
FROM node:20-alpine
WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy server script and package files
COPY server.js ./
COPY server ./server
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Ensure data directory exists for server-side wordbook storage
RUN mkdir -p /app/data

# Expose port 80
EXPOSE 80

# Start server
CMD ["node", "server.js"]
