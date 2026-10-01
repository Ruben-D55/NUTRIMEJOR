FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY database ./database
ENV NODE_ENV=production PORT=4007
USER node
EXPOSE 4007
CMD ["node", "src/index.js"]
