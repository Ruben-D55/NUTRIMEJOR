FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY src ./src
COPY database ./database
ENV NODE_ENV=production PORT=4009
USER node
EXPOSE 4009
CMD ["node", "src/index.js"]
