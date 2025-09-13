FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .


FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production

EXPOSE 3002 

CMD ["node", "dist/app.js"]