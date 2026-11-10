FROM python:3.13-alpine
WORKDIR /app
COPY services /app/services
USER 10001:10001
EXPOSE 8081
CMD ["python3","-m","services.tiles.tile_service"]
