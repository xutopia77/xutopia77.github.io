---
title: "\U0001F6E0️ 安装与编译 - libevent源码深度解析系列（二）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🛠️ 安装与编译

## 一、下载源码

进入 [libevent 官方网站](https://libevent.org/) 下载最新稳定版本。

![下载页面](https://imgbed.xutopia.top/image-assets/4087a823bdd772afac17769229c4609b.png)

这里选择最新版本 [libevent-2.1.12-stable.tar.gz](https://github.com/libevent/libevent/releases/download/release-2.1.12-stable/libevent-2.1.12-stable.tar.gz) 下载。下载后传入到linux服务器中。

## 二、编译脚本

直接编写一个shell编译脚本进行编译，方便编译参数设置。

```shell
#!/bin/bash
# 获取当前目录
cur_dir=`pwd`

# 解压libevent
tar -xzf libevent-2.1.12-stable.tar.gz

# 进入源码目录
cd libevent-2.1.12-stable

# 生成configure文件
./autogen.sh 

# 配置编译选项
# --prefix=$cur_dir/libevent_build 设置编译安装路径
# --enable-shared=no 不编译动态库
# --enable-static=yes 编译静态库
# --disable-openssl 不启用openssl
./configure --prefix=$cur_dir/libevent_build \
            --enable-shared=no \
            --enable-static=yes \
            --disable-openssl

# 编译安装
make -j
make install
```

## 三、执行编译

```shell
chmod +x build.sh
./build.sh
```

等待编译完成后，可以看到当前路径中内容如下：

```shell
ls -hlt
total 1.1M
drwxr-xr-x  5 xutopia xutopia 4.0K Sep  6 22:50 libevent_build
drwxr-xr-x 13 xutopia xutopia 4.0K Sep  6 22:50 libevent-2.1.12-stable
-rwxr-xr-x  1 xutopia xutopia  558 Sep  6 22:50 build.sh
-rw-r--r--r--  1 xutopia xutopia 1.1M Sep  6 22:41 libevent-2.1.12-stable.tar.gz
```

## 四、程序验证

编译完成后，可以通过编译一个简单的示例程序来验证 `libevent` 是否正确安装。

### 4.1 测试代码

```c
/**
 * @brief 测试验证libevent程序
 *          编译测试程序
 *          gcc main.c -I./libevent_build/include -o main -L./libevent_build/lib -levent
 */
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <event2/event.h>

static void timer_callback(evutil_socket_t fd, short event, void *arg) {
    printf("Timer run!\n");
}

int main() {
    struct event_base *base;
    struct event *timer;

    base = event_base_new();
    if (!base) {
        fprintf(stderr, "Failed to create event base\n");
        return 1;
    }

    timer = event_new(base, -1, EV_PERSIST, timer_callback, base);
    if (!timer) {
        fprintf(stderr, "Failed to create timer event\n");
        event_base_free(base);
        return 1;
    }

    // 设置定时器时间为 2 秒
    struct timeval delay = {2, 0};
    event_add(timer, &delay);

    // 启动事件循环
    event_base_dispatch(base);

    // 清理资源
    event_free(timer);
    event_base_free(base);

    return 0;
}
```

### 4.2 编译命令

```shell
gcc main.c -I./libevent_build/include -o main -L./libevent_build/lib -levent
```

### 4.3 运行结果

```shell
# ./main 
Timer run!
Timer run!
Timer run!
```

## 五、编译产物说明

| 库文件 | 说明 |
|--------|------|
| `libevent_core` | 所有核心的事件和缓冲功能，包含了所有的 event_base、evbuffer、bufferevent和工具函数 |
| `libevent_extra` | 定义了程序可能需要，也可能不需要的协议特定功能，包括 HTTP、DNS和 RPC |
| `libevent` | 这个库因为历史原因而存在，它包含 libevent_core和 libevent_extra的内容 |
| `libevent_pthreads` | 添加基于 pthread可移植线程库的线程和锁定实现 |
| `libevent_openssl` | 为使用 bufferevent和 OpenSSL进行加密的通信提供支持 |

---

## 六、Windows平台安装

### 6.1 使用vcpkg安装

```powershell
# 安装vcpkg（如果尚未安装）
git clone https://github.com/Microsoft/vcpkg.git
cd vcpkg
.\bootstrap-vcpkg.bat

# 安装libevent
.\vcpkg install libevent:x64-windows
.\vcpkg integrate install
```

### 6.2 使用CMake编译

```powershell
# 下载源码
git clone https://github.com/libevent/libevent.git
cd libevent

# 创建构建目录
mkdir build && cd build

# 配置和编译
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
cmake --install . --prefix ./install
```

### 6.3 Visual Studio配置

在Visual Studio项目中配置libevent：

```xml
<!-- 包含目录 -->
C:\libevent\include

<!-- 库目录 -->
C:\libevent\lib

<!-- 链接库 -->
libevent.lib
ws2_32.lib
```

### 6.4 Windows测试代码

```c
#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#endif

#include <stdio.h>
#include <event2/event.h>

int main() {
#ifdef _WIN32
    WSADATA wsa_data;
    WSAStartup(MAKEWORD(2, 2), &wsa_data);
#endif

    struct event_base *base = event_base_new();
    if (base) {
        printf("libevent initialized successfully!\n");
        printf("Using method: %s\n", event_base_get_method(base));
        event_base_free(base);
    }

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
```

---

## 七、macOS平台安装

### 7.1 使用Homebrew安装

```bash
# 安装libevent
brew install libevent

# 查看安装信息
brew info libevent
```

### 7.2 使用MacPorts安装

```bash
sudo port install libevent
```

### 7.3 源码编译（macOS）

```bash
# 下载源码
curl -O https://github.com/libevent/libevent/releases/download/release-2.1.12-stable/libevent-2.1.12-stable.tar.gz
tar -xzf libevent-2.1.12-stable.tar.gz
cd libevent-2.1.12-stable

# 配置和编译
./configure --prefix=/usr/local/libevent
make -j$(sysctl -n hw.ncpu)
sudo make install
```

### 7.4 macOS编译测试程序

```bash
gcc main.c -I/usr/local/include -L/usr/local/lib -levent -o main
./main
```

---

## 八、常见安装问题

| 问题 | 解决方案 |
|------|----------|
| `openssl/ssl.h not found` | 安装OpenSSL开发包：`apt install libssl-dev` |
| `event2/event.h not found` | 检查include路径是否正确配置 |
| `undefined reference to event_base_new` | 添加链接选项 `-levent` |
| Windows下WSA错误 | 确保调用 `WSAStartup()` 初始化 |
| macOS下找不到库 | 设置 `DYLD_LIBRARY_PATH` 或使用 `install_name_tool` |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
