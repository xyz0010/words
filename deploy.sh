#!/bin/bash

# 遇到错误立即退出
set -e

echo "=========================================="
echo "   开始部署 Words 应用到阿里云 ECS"
echo "=========================================="

# 1. 检查并安装 Docker
if ! command -v docker &> /dev/null; then
    echo "[1/4] 检测到未安装 Docker，正在自动安装..."
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y docker.io git
    elif [ -f /etc/redhat-release ]; then
        # CentOS/Alibaba Cloud Linux
        yum install -y docker git
        systemctl start docker
        systemctl enable docker
    else
        echo "错误: 无法自动识别操作系统，请手动安装 Docker 和 Git。"
        exit 1
    fi
else
    echo "[1/4] Docker 已安装，跳过安装步骤。"
fi

# 2. 准备代码目录
WORK_DIR="/opt/words"
if [ -d "$WORK_DIR" ]; then
    echo "[2/4] 检测到项目目录已存在，正在更新代码..."
    cd "$WORK_DIR"
    git pull origin main
else
    echo "[2/4] 正在克隆代码仓库..."
    git clone https://github.com/xyz0010/words.git "$WORK_DIR"
    cd "$WORK_DIR"
fi

# 3. 构建 Docker 镜像
echo "[3/4] 正在构建 Docker 镜像 (这可能需要几分钟)..."
docker build -t words-app .

# 4. 运行容器
echo "[4/4] 正在启动服务..."
# 停止旧容器
docker stop words-container 2>/dev/null || true
docker rm words-container 2>/dev/null || true
# 启动新容器
docker run -d -p 80:80 --name words-container --restart always words-app

echo "=========================================="
echo "   ✅ 部署成功！"
echo "   请在浏览器访问您的服务器 IP 地址。"
echo "=========================================="
