FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and workspace definitions
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and applications
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install dependencies for the entire workspace (with longer timeout and no audit to prevent EIDLETIMEOUT)
RUN npm config set fetch-retry-maxtimeout 1200000 && \
    npm config set fetch-retries 5 && \
    npm ci --no-audit --no-fund --prefer-offline

# Generate Prisma client
# Assuming the Prisma schema is located in one of these directories. 
# We'll generate it where it's used.
RUN npx prisma generate --schema=apps/api-dashboard/prisma/schema.prisma || true

# Build the workspace (Next.js will output to .next/standalone)
RUN npm run build --workspaces --if-present

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy standalone output from the builder
# Note: Next.js standalone mode automatically traces and copies required node_modules and local packages!
COPY --from=builder --chown=appuser:appgroup /app/apps/api-dashboard/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/apps/api-dashboard/.next/static ./apps/api-dashboard/.next/static
COPY --from=builder --chown=appuser:appgroup /app/apps/api-dashboard/public ./apps/api-dashboard/public

EXPOSE 3000

# Start the standalone Next.js server
CMD ["node", "apps/api-dashboard/server.js"]
