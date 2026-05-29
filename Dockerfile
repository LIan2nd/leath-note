# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
# Skip scripts to avoid prisma generate failing without schema
RUN npm ci --ignore-scripts

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables (required for Next.js build validation)
ARG DATABASE_URL
ARG AUTH_SECRET
ARG AUTH_GOOGLE_ID
ARG AUTH_GOOGLE_SECRET
ARG NEXT_PUBLIC_AI_PROVIDER
ARG NEXT_PUBLIC_AI_MODEL

ENV DATABASE_URL=$DATABASE_URL
ENV AUTH_SECRET=$AUTH_SECRET
ENV AUTH_GOOGLE_ID=$AUTH_GOOGLE_ID
ENV AUTH_GOOGLE_SECRET=$AUTH_GOOGLE_SECRET
ENV NEXT_PUBLIC_AI_PROVIDER=$NEXT_PUBLIC_AI_PROVIDER
ENV NEXT_PUBLIC_AI_MODEL=$NEXT_PUBLIC_AI_MODEL

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# Prisma generation
RUN npx prisma generate

# Build the project
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
