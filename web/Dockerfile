FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci
COPY . .
# Public values only (never secrets): `next build` inlines NEXT_PUBLIC_* and the CSP auth domain.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG FIREBASE_PROJECT_ID
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The standalone server serves public/ itself; without it the self-hosted fonts (§3.2) answer 404.
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
