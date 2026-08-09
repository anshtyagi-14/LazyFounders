FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and workspace definitions
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and applications
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies for the entire workspace
RUN npm ci

# Generate Prisma client for discovery-service (the schema lives here)
RUN npx prisma generate --schema=apps/discovery-service/prisma/schema.prisma || true

# Build the workspace
RUN npm run build --workspaces --if-present

# Prune dev dependencies

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

# Copy categorization-service
COPY --from=builder --chown=appuser:appgroup /app/apps/categorization-service/package.json ./apps/categorization-service/
COPY --from=builder --chown=appuser:appgroup /app/apps/categorization-service/dist ./apps/categorization-service/dist

COPY --from=builder --chown=appuser:appgroup /app/apps/discovery-service/prisma ./apps/discovery-service/prisma

EXPOSE 3003

CMD ["node", "apps/categorization-service/dist/main.js"]
