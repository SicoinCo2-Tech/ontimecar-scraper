# Usa una imagen base de Node.js, mucho más ligera y sin navegadores
FROM node:18-slim

# Establece el directorio de trabajo
WORKDIR /app

# Agregamos una línea para asegurarnos de que el package.json no esté en caché
ARG CACHE_BUST=1

# Copia los archivos de definición
COPY package.json package.json
COPY package-lock.json package-lock.json

# Instala las dependencias
RUN npm install

# Copia el código de la aplicación
COPY server.js .
COPY .dockerignore .

# Expone el puerto que usa la aplicación
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "server.js"]
