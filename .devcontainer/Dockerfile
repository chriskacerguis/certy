FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:22

RUN apt-get update && apt-get upgrade -y && \
  apt-get install -y \
  jq

RUN npm install -g \
  hostile \
  @go-task/cli \
  @nestjs/cli

RUN echo "alias t=\"task\"" >> /home/node/.bashrc