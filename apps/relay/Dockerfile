# The relay as a container (docker/compose.host.yml). Plain Node; the TypeScript runs with type stripping.
FROM node:22.23.3-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund
COPY src ./src
RUN mkdir data && chown node data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server.ts"]
