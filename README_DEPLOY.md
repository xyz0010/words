# 阿里云 ECS 部署指南

本项目使用 Docker 和 Nginx 进行容器化部署。请按照以下步骤将项目部署到您的阿里云服务器。

## 1. 服务器环境准备

登录到您的 ECS 服务器，确保已安装 Docker 和 Git。

```bash
# 更新软件包
sudo apt-get update  # Ubuntu/Debian
# sudo yum update    # CentOS/Alibaba Cloud Linux

# 安装 Docker (如果未安装)
# Ubuntu/Debian:
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker

# CentOS/Alibaba Cloud Linux:
# sudo yum install -y docker
# sudo systemctl start docker
# sudo systemctl enable docker
```

## 2. 获取代码

在服务器上克隆您的 GitHub 仓库：

```bash
# 创建并进入项目目录
mkdir -p /opt/projects
cd /opt/projects

# 克隆仓库 (如果是私有仓库，需要配置 SSH key 或使用 HTTPS token)
git clone https://github.com/xyz0010/words.git
cd words
```

## 3. 构建并运行容器

在项目根目录（`Dockerfile` 所在目录）执行以下命令：

```bash
# 1. 构建 Docker 镜像
# 注意：不要忘记最后的点 (.)
docker build -t words-app .

# 2. 停止并删除旧容器（如果是更新部署）
docker stop words-container || true
docker rm words-container || true

# 3. 启动新容器
# -d: 后台运行
# -p 80:80: 将服务器的 80 端口映射到容器的 80 端口
# --name: 指定容器名称
# --restart always: 容器崩溃或重启后自动启动
docker run -d -p 80:80 --name words-container --restart always words-app
```

## 4. 验证部署

1.  确保阿里云 ECS 安全组规则已开放 **80** 端口（TCP）。
2.  在浏览器中访问您的服务器公网 IP 地址。

## 常见问题排查

-   **无法访问？**
    *   检查安全组规则是否开放 80 端口。
    *   检查容器是否正在运行：`docker ps`
    *   查看容器日志：`docker logs words-container`

-   **代码更新后如何重新部署？**
    ```bash
    cd /opt/projects/words
    git pull origin main
    docker build -t words-app .
    docker stop words-container
    docker rm words-container
    docker run -d -p 80:80 --name words-container --restart always words-app
    ```
