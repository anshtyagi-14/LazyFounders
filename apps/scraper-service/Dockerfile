FROM node:20 AS builder

WORKDIR /app

# Copy root configurations and workspace definitions
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and applications
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies for the entire workspace
RUN npm ci

# Generate Prisma client for discovery-service (often needed if there's shared code)
RUN npx prisma generate --schema=apps/discovery-service/prisma/schema.prisma || true

# Build the workspace
RUN npm run build --workspaces --if-present

# Prune dev dependencies

# Production stage using Microsoft's Playwright image (includes browsers)
FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy built packages
COPY --from=builder /app/packages ./packages

# Copy scraper-service
COPY --from=builder /app/apps/scraper-service/package.json ./apps/scraper-service/
COPY --from=builder /app/apps/scraper-service/dist ./apps/scraper-service/dist
COPY --from=builder /app/apps/scraper-service/node_modules ./apps/scraper-service/node_modules

# (Optional) Copy Prisma schema if scraper directly uses it, otherwise it relies on packages
COPY --from=builder /app/apps/discovery-service/prisma ./apps/discovery-service/prisma

EXPOSE 3002

# Playwright relies on root/pwuser. We'll run as root inside the container to avoid permissions issues with browser binaries in Jammy, 
# but if needed, we can switch to `pwuser`.

CMD ["node", "apps/scraper-service/dist/main.js"]
