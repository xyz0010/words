#!/bin/bash

# 容器名称
CONTAINER_NAME="words-app"
# 镜像名称
IMAGE_NAME="words-image"

echo "=== 开始自动部署 ==="

# 1. 拉取最新代码
echo "[1/4] 正在拉取最新代码..."
git pull origin main

# 2. 构建新镜像
echo "[2/4] 正在构建 Docker 镜像..."
docker build -t $IMAGE_NAME .

# 3. 停止并删除旧容器
echo "[3/4] 正在清理旧容器..."
# 检查容器是否在运行
if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "停止运行中的容器..."
    docker stop $CONTAINER_NAME
fi
# 检查容器是否存在（即使已停止）
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "删除旧容器..."
    docker rm $CONTAINER_NAME
fi

# 4. 启动新容器
echo "[4/4] 正在启动新容器..."
# -d: 后台运行
# -p 80:80: 映射端口 (如果你的服务器端口不是80，请修改这里)
# --name: 指定容器名称
docker run -d -p 80:80 --name $CONTAINER_NAME $IMAGE_NAME

echo "=== 部署完成！ ==="
echo "你可以使用 'docker logs $CONTAINER_NAME' 查看运行日志"
