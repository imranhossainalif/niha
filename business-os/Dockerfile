# One image for both the web app and the worker (docker-compose picks the command).
FROM node:22-alpine AS base
RUN apk add --no-cache openssl python3 py3-openpyxl postgresql-client tzdata
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx next build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/backups && chown -R app:app /app/backups /app/.next
USER app
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start"]
