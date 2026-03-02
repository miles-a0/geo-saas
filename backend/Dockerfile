FROM node:20-alpine AS builder
WORKDIR /app

# install deps
COPY package*.json ./
RUN npm install --omit=dev || npm install

# build
COPY . .
RUN npm run build || (npm install && npm run build)

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
RUN mkdir -p /app/reports /app/uploads && chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
