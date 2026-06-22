# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build Next.js application
RUN pnpm build

# Pre-download NLP models during build to avoid cold start
# This downloads models to the cache directory that will be included in the final image
RUN node -e " \
  const { pipeline } = require('@huggingface/transformers'); \
  const models = [ \
    { task: 'text-classification', model: 'Xenova/fasttext-language-identification' }, \
    { task: 'text-classification', model: 'ProsusAI/finbert' }, \
    { task: 'token-classification', model: 'Xenova/bert-base-NER' }, \
    { task: 'feature-extraction', model: 'Xenova/all-MiniLM-L6-v2' }, \
    { task: 'zero-shot-classification', model: 'Xenova/bart-large-mnli' } \
  ]; \
  (async () => { \
    for (const { task, model } of models) { \
      console.log('Downloading model:', model); \
      try { \
        await pipeline(task, model); \
        console.log('✓ Downloaded:', model); \
      } catch (err) { \
        console.error('✗ Failed to download:', model, err.message); \
      } \
    } \
    console.log('Model download complete'); \
  })(); \
"

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV NLP_MODEL_CACHE_DIR=/app/.cache/transformers
ENV NLP_ALLOW_LOCAL_MODELS=true
ENV NLP_ALLOW_REMOTE_MODELS=true

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files and install production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma schema and generated client
COPY prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

# Copy pre-downloaded NLP models
COPY --from=builder /root/.cache/transformers /root/.cache/transformers

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Set hostname
ENV HOSTNAME "0.0.0.0"

# Start the application
CMD ["pnpm", "start"]
