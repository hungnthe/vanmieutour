FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build

FROM nginx:stable-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

COPY index.html styles.css map-engine.js gis-layers.js data.js map-style.json ./
COPY --from=builder /app/app.bundle.js ./app.bundle.js
COPY vendor/ ./vendor/

# Copy only the assets used by the public map; research inputs and review-only
# GIS files stay out of the image.
COPY data/site-audit.csv ./data/site-audit.csv
COPY data/gis/manifest.json ./data/gis/manifest.json
COPY data/gis/roads.geojson data/gis/water.geojson ./data/gis/
COPY data/gis/railways-area.geojson data/gis/railways-context.geojson ./data/gis/
COPY data/gis/boundary.geojson data/gis/boundary-supplementary.geojson ./data/gis/
COPY data/model/manifest.json data/model/model_2.glb ./data/model/
