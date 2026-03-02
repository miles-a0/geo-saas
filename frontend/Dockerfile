FROM node:20-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc-dev
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Builder
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS production
ENV NODE_ENV=production
RUN npm install -g serve
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["serve", "-s", "/usr/share/nginx/html", "-l", "80"]
