# ---- Stage 1: build the React/Vite frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

# ---- Stage 2: build the Rust workspace (server + mcp binaries) ----
FROM rust:1-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates
COPY --from=frontend /app/web/dist ./apps/web/dist
RUN cargo build --release --bin pinemail --bin pinemail-mcp && \
    strip target/release/pinemail target/release/pinemail-mcp

# ---- Stage 3: minimal runtime image ----
FROM alpine:3.20
RUN apk add --no-cache tini && adduser -D -u 1000 pinemail
COPY --from=builder /app/target/release/pinemail /usr/local/bin/pinemail
COPY --from=builder /app/target/release/pinemail-mcp /usr/local/bin/pinemail-mcp
RUN mkdir -p /data && chown pinemail:pinemail /data
USER pinemail
ENV DB_PATH=/data/pinemail.db \
    HTTP_PORT=8025 \
    SMTP_PORT=1025 \
    BIND_ADDR=0.0.0.0
EXPOSE 1025 8025
VOLUME ["/data"]
ENTRYPOINT ["tini", "--", "/usr/local/bin/pinemail"]
