FROM node:16.18.0
COPY . app
WORKDIR /app
RUN npm install
CMD ["node","app"]

# EXPOSE 22