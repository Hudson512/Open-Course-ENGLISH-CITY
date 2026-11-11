# Frontend: build the game with Vite, serve it with nginx. Build context is the repository root.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY client ./client
COPY shared ./shared
# the city viewer draws the map picture with the pack tools (tools/pack/preview.js)
COPY tools ./tools
RUN npm run build

FROM nginx:1.29-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
