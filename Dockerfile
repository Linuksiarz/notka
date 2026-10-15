# syntax=docker/dockerfile:1

# The Node.js the frontend is built with; any current release works (`--build-arg NODE_VERSION=26`).
ARG NODE_VERSION=24

# ---------------------------------------------------------------------------- frontend build
FROM node:${NODE_VERSION}-alpine AS frontend-build

# pnpm comes from npm, which every Node.js image has. Corepack is not used: Node.js stopped shipping
# it with version 25, and an image built on a newer Node would otherwise have no pnpm at all.
ARG PNPM_VERSION=11.9.0
RUN npm install --global "pnpm@${PNPM_VERSION}"
WORKDIR /build/frontend

# Install dependencies first so the layer survives source-only changes.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm run build

# ----------------------------------------------------------------------------- backend build
FROM eclipse-temurin:21-jdk AS backend-build

WORKDIR /build

COPY gradlew gradlew
COPY gradle/ gradle/
COPY settings.gradle.kts build.gradle.kts gradle.properties ./
COPY backend/build.gradle.kts backend/build.gradle.kts

# Warm the dependency cache before copying sources.
RUN chmod +x gradlew && ./gradlew :backend:dependencies --no-daemon --quiet

COPY backend/src backend/src
RUN ./gradlew :backend:shadowJar --no-daemon

# ------------------------------------------------------------------------------------ runtime
FROM eclipse-temurin:21-jre

# Debian-based on purpose: the bundled SQLite native library is built for glibc.
# `curl` is only needed by the container health check.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system notka \
    && useradd --system --gid notka --home-dir /app --shell /usr/sbin/nologin notka

WORKDIR /app

COPY --from=backend-build /build/backend/build/libs/notka-backend-all.jar /app/notka.jar
COPY --from=frontend-build /build/frontend/dist /app/static

RUN mkdir -p /data && chown -R notka:notka /app /data

USER notka

ENV NOTKA_PORT=8080 \
    NOTKA_HOST=0.0.0.0 \
    NOTKA_DB_PATH=/data/notka.db \
    NOTKA_STATIC_DIR=/app/static

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/bin/sh", "-c", "curl -fsS http://127.0.0.1:${NOTKA_PORT}/api/health || exit 1"]

# Exit on OutOfMemoryError so the restart policy brings back a working process instead of a
# half-dead one.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/notka.jar"]
