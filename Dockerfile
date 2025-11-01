FROM node:20-slim
WORKDIR /app
COPY server.js .
ENV PORT=8787
EXPOSE 8787
CMD ["node","server.js"]
