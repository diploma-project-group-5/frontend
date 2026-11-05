# syntax=docker/dockerfile:1

# ── збірка ──
FROM node:24-alpine AS build
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
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
