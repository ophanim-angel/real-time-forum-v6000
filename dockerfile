
FROM golang:1.22-alpine AS builder


RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app

ENV CGO_ENABLED=1

COPY go.mod go.sum ./
RUN go mod download

COPY . .


RUN go build -ldflags="-w -s" -o forum-exe main.go

FROM alpine:3.19


RUN apk add --no-cache ca-certificates sqlite-libs && \
    rm -rf /var/cache/apk/*

WORKDIR /root/


COPY --from=builder /app/forum-exe .
COPY --from=builder /app/frontend ./frontend

RUN mkdir -p ./database

EXPOSE 8080


CMD ["./forum-exe"]