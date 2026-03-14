FROM node:20-alpine

WORKDIR /app

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY lifeflow/package.json .
RUN npm install --production

COPY lifeflow/ .

RUN mkdir -p data uploads

EXPOSE 3000

CMD ["node", "server.js"]
