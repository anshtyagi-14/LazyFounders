FROM node:20 AS builder

WORKDIR /app

# Copy root configurations and workspace definitions
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and applications
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies for the entire workspace (robust against network drops)
RUN npm config set fetch-retry-maxtimeout 1200000 && \
    npm config set fetch-retries 5 && \
    npm ci --no-audit --no-fund --prefer-offline

# Generate Prisma client for discovery-service
RUN npx prisma generate --schema=apps/discovery-service/prisma/schema.prisma

# Build the workspace
RUN npm run build --workspaces --if-present

# Prune dev dependencies

# Production stage using Microsoft's Playwright image (includes browsers)
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy built packages
COPY --from=builder /app/packages ./packages

# Copy discovery-service
COPY --from=builder /app/apps/discovery-service/package.json ./apps/discovery-service/
COPY --from=builder /app/apps/discovery-service/dist ./apps/discovery-service/dist
COPY --from=builder /app/apps/discovery-service/node_module[s] ./apps/discovery-service/node_modules

COPY --from=builder /app/apps/discovery-service/prisma ./apps/discovery-service/prisma

EXPOSE 3001

CMD ["node", "apps/discovery-service/dist/main.js"]
