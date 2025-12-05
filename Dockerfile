# 使用轻量级 Node.js 镜像
# Node 20+ required for jsdom/webidl-conversions (ArrayBuffer.prototype.resizable)
FROM node:20-slim

# 安装 Puppeteer 所需的系统依赖
# 这些是运行 Headless Chrome 必不可少的库
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制 package.json 并安装依赖
# 设置 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true 因为我们已经安装了 google-chrome-stable
# 但为了兼容性，还是让 puppeteer 下载它匹配的 chromium 比较稳妥，或者配置 executablePath
# 这里我们不跳过下载，确保 puppeteer 能用自带的 chromium
COPY package.json package-lock.json ./
RUN npm ci

# 复制源代码
COPY . .

# 创建数据目录并设置权限
# Puppeteer 建议不要用 root 运行，所以我们切换到 node 用户
RUN mkdir -p /app/data /app/puppeteer_data \
    && chown -R node:node /app

USER node

# 暴露端口
EXPOSE 4000

# 设置环境变量
# 在 Docker 中默认开启 Headless
ENV PUPPETEER_HEADLESS=true
ENV PORT=4000

# 启动命令
CMD ["npm", "start"]
