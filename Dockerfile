# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm (pinned version)
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Set model cache dir to location outside /app BEFORE any operations
# This prevents models from being cached in node_modules during build
ENV HF_HOME=/root/.cache/huggingface
ENV TRANSFORMERS_CACHE=/root/.cache/huggingface
ENV NLP_MODEL_CACHE_DIR=/root/.cache/huggingface

# Install dependencies
RUN pnpm install --frozen-lockfile

# Clean any cached models that might have been downloaded during install
RUN rm -rf node_modules/@huggingface/transformers/.cache || true

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build Next.js application (standalone output)
RUN pnpm build

# Pre-download critical NLP models (embeddings + language ID)
# Other models (NER, finbert, bart-large-mnli) download on first use at runtime
RUN node -e " \
  const { pipeline, env } = require('@huggingface/transformers'); \
  env.cacheDir = '/root/.cache/huggingface'; \
  const models = [ \
    { task: 'feature-extraction', model: 'Xenova/all-MiniLM-L6-v2' }, \
    { task: 'text-classification', model: 'Xenova/fasttext-language-identification' } \
  ]; \
  (async () => { \
    for (const { task, model } of models) { \
      console.log('Downloading model:', model); \
      try { \
        await pipeline(task, model); \
        console.log('Done:', model); \
      } catch (err) { \
        console.error('Failed:', model, err.message); \
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

# Copy standalone output (includes minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and generated client (needed for migrations)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy pre-downloaded NLP models
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Strip non-CPU onnxruntime binaries (CUDA, DirectML, CoreML)
# Docker typically runs on Linux x64 with CPU only
# In standalone mode, onnxruntime-node is nested under .pnpm
RUN find node_modules -path "*/onnxruntime-node/bin/napi-v3/cuda" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -path "*/onnxruntime-node/bin/napi-v3/dml" -type d -exec rm -rf {} + 2>/dev/null || true && \
    find node_modules -path "*/onnxruntime-node/bin/napi-v3/coreml" -type d -exec rm -rf {} + 2>/dev/null || true

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
CMD ["node", "server.js"]
