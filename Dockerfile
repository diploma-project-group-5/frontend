# syntax=docker/dockerfile:1

# ── збірка ──
# версії закріплено до патча й digest: збірка в різні дні дає той самий Node/nginx
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# VITE_* вшиваються в збірку; значення за замовчуванням підходять для шлюзу platform
ARG VITE_KEYCLOAK_URL=/idp
ARG VITE_KEYCLOAK_REALM=lad
ARG VITE_KEYCLOAK_CLIENT_ID=web
ARG VITE_API_BASE=/api/v1
RUN npm run build

# ── віддача статики ──
FROM nginxinc/nginx-unprivileged:1.29.8-alpine3.23@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
