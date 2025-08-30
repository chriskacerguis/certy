FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY src ./src
COPY .env.example ./.env

EXPOSE 3000
CMD ["node", "src/app.js"]