# Usa una imagen base con soporte para Puppeteer (Chromium)
FROM ghcr.io/puppeteer/puppeteer:21.0.0

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de definición
COPY package.json package.json

# Instala las dependencias. Esto también crea el package-lock.json internamente.
RUN npm install

# Copia el código de la aplicación
COPY server.js .
COPY .dockerignore .

# Expone el puerto que usa la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]
