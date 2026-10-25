FROM alpine:3.20

RUN apk add --no-cache \
    bash \
    curl \
    docker-cli \
    docker-cli-compose \
    gzip \
    jq \
    tar \
    tzdata

COPY docker/updater.sh /usr/local/bin/updater.sh

RUN chmod 755 /usr/local/bin/updater.sh

ENTRYPOINT ["/bin/bash", "/usr/local/bin/updater.sh"]
