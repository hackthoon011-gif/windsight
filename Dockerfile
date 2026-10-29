FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=http://127.0.0.1:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

EXPOSE 8080

CMD ["npx", "wrangler", "--cwd", "./", "dev", "--ip", "0.0.0.0", "--port", "8080"]

