# Deployment approach 2: container (nginx serving the static build).
# NOT built or run during development (no Docker in that environment) — verify on your host before relying on it.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional build flags, e.g. --build-arg VITE_LLM_PROXY_URL=https://proxy.example
ARG VITE_LLM_PROXY_URL=
ARG VITE_TALK_INCLUDE_DRAFTS=false
ARG VITE_TALK_AGE_GATE=false
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
