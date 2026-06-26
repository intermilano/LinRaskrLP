FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY index.html style.css app.js ./public/

EXPOSE 3000

CMD ["node", "server.js"]
