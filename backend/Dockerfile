FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
COPY tsconfig.json ./
RUN npm install -g tsx
EXPOSE 3000
CMD ["tsx", "src/index.ts"]
