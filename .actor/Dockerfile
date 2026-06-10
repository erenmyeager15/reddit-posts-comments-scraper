FROM apify/actor-node:20

COPY --chown=myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --include=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

COPY --chown=myuser . ./

RUN npm run build

CMD ["node", "dist/main.js"]
