# Kavari Stores — production image
# Uses the Node base image (free to build and run on every free tier).
FROM node:20-alpine

WORKDIR /app

# No dependencies to install — the server uses only Node's standard library.
# Copy the application.
COPY server.js ./
COPY package.json ./
COPY index.html login.html admin.html ./
COPY store.js app.js admin.js ./
COPY styles.css admin.css ./
COPY assets ./assets
COPY data/seed.json ./data/seed.json

# The database lives on a mounted volume when one is provided.
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 8080
CMD ["node", "server.js"]
