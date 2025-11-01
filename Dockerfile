FROM node:20-slim
WORKDIR /app

# 只拷贝 package.json，避免找不到 package-lock.json 导致 COPY 失败
COPY package.json ./

# 提高超时 & 关闭审计；必要时用 legacy peer deps；用官方源或你就近的镜像源二选一
RUN npm config set fetch-retry-maxtimeout 180000 \
 && npm config set fetch-timeout 180000 \
 && npm install --omit=dev --no-audit --no-fund --legacy-peer-deps
# 如需国内镜像，可改为：\
# && npm install --omit=dev --no-audit --no-fund --legacy-peer-deps --registry=https://registry.npmmirror.com

# 再拷贝源码
COPY server.js .

ENV PORT=8787
EXPOSE 8787
CMD ["node","server.js"]
