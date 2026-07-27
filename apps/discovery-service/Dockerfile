FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and workspace definitions
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and applications
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies for the entire workspace
RUN npm ci

# Generate Prisma client for discovery-service
RUN npx prisma generate --schema=apps/discovery-service/prisma/schema.prisma

# Build the workspace
RUN npm run build --workspaces --if-present

# Prune dev dependencies
RUN npm ci --omit=dev

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy workspace node_modules
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy built packages
COPY --from=builder --chown=appuser:appgroup /app/packages ./packages

# Copy discovery-service
COPY --from=builder --chown=appuser:appgroup /app/apps/discovery-service/package.json ./apps/discovery-service/
COPY --from=builder --chown=appuser:appgroup /app/apps/discovery-service/dist ./apps/discovery-service/dist
COPY --from=builder --chown=appuser:appgroup /app/apps/discovery-service/prisma ./apps/discovery-service/prisma

EXPOSE 3001

CMD ["node", "apps/discovery-service/dist/main.js"]
