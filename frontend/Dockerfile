FROM node:20-alpine AS base
WORKDIR /app

# install dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

# build
COPY . .
RUN npm run build || (npm install && npm run build)

# serve static
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=base /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["serve", "-s", "/usr/share/nginx/html", "-l", "80"]
