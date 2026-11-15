---
title: "\U0001F4E1 信号事件 - libevent源码深度解析系列（十三）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📡 信号事件

## 一、概述

libevent支持信号事件处理，允许在接收到特定信号时执行回调函数。这对于优雅地关闭服务器、重新加载配置等场景非常有用。

## 二、信号API

### 2.1 创建信号事件

```c
/* 创建信号事件（宏定义）
 * @param base  event_base
 * @param x     信号值
 * @param cb    回调函数
 * @param arg   回调参数
 */
#define evsignal_new(base, x, cb, arg) \
    event_new((base), (x), EV_SIGNAL|EV_PERSIST, (cb), (arg))

/* 分配信号事件到现有结构体 */
#define evsignal_assign(ev, base, x, cb, arg) \
    event_assign((ev), (base), (x), EV_SIGNAL|EV_PERSIST, (cb), (arg))
```

### 2.2 添加和删除

```c
/* 添加信号事件 */
#define evsignal_add(ev, tv) event_add((ev), (tv))

/* 删除信号事件 */
#define evsignal_del(ev) event_del(ev)
```

### 2.3 检查状态

```c
/* 检查信号事件是否pending */
#define evsignal_pending(ev, tv) event_pending((ev), EV_SIGNAL, (tv))

/* 检查信号事件是否已初始化 */
#define evsignal_initialized(ev) event_initialized(ev)
```

## 三、常用信号

| 信号 | 值 | 说明 |
|------|-----|------|
| SIGINT | 2 | 中断信号（Ctrl+C） |
| SIGTERM | 15 | 终止信号 |
| SIGUSR1 | 10 | 用户自定义信号1 |
| SIGUSR2 | 12 | 用户自定义信号2 |
| SIGHUP | 1 | 挂起信号（重载配置） |
| SIGPIPE | 13 | 管道破裂（通常忽略） |

## 四、基本示例

### 4.1 捕获SIGINT

```c
#include <stdio.h>
#include <signal.h>
#include <event2/event.h>

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Caught SIGINT (Ctrl+C), shutting down...\n");
    event_base_loopexit(base, NULL);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建信号事件
    struct event *signal_int = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(signal_int, NULL);
    
    printf("Press Ctrl+C to exit\n");
    
    event_base_dispatch(base);
    
    event_free(signal_int);
    event_base_free(base);
    
    printf("Server shutdown complete\n");
    return 0;
}
```

### 4.2 捕获多个信号

```c
#include <stdio.h>
#include <signal.h>
#include <event2/event.h>

static volatile int running = 1;

static void sigint_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Caught SIGINT, graceful shutdown...\n");
    event_base_loopexit(base, NULL);
}

static void sigterm_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Caught SIGTERM, immediate shutdown...\n");
    event_base_loopbreak(base);
}

static void sighup_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Caught SIGHUP, reloading configuration...\n");
    // 这里可以重新加载配置
}

static void sigusr1_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Caught SIGUSR1, custom action...\n");
    // 自定义操作
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建多个信号事件
    struct event *sigint = evsignal_new(base, SIGINT, sigint_cb, base);
    struct event *sigterm = evsignal_new(base, SIGTERM, sigterm_cb, base);
    struct event *sighup = evsignal_new(base, SIGHUP, sighup_cb, base);
    struct event *sigusr1 = evsignal_new(base, SIGUSR1, sigusr1_cb, base);
    
    event_add(sigint, NULL);
    event_add(sigterm, NULL);
    event_add(sighup, NULL);
    event_add(sigusr1, NULL);
    
    printf("Signal handlers installed:\n");
    printf("  SIGINT (Ctrl+C)  - Graceful shutdown\n");
    printf("  SIGTERM          - Immediate shutdown\n");
    printf("  SIGHUP           - Reload config\n");
    printf("  SIGUSR1          - Custom action\n");
    
    event_base_dispatch(base);
    
    event_free(sigint);
    event_free(sigterm);
    event_free(sighup);
    event_free(sigusr1);
    event_base_free(base);
    
    return 0;
}
```

## 五、忽略SIGPIPE

在网络编程中，当向已关闭的socket写入数据时，会触发SIGPIPE信号，默认行为是终止程序。通常需要忽略这个信号：

```c
#include <stdio.h>
#include <signal.h>
#include <event2/event.h>

static void ignore_sigpipe(void) {
    struct event_base *base = event_base_new();
    struct event *sigpipe = evsignal_new(base, SIGPIPE, NULL, NULL);
    event_add(sigpipe, NULL);
    
    // 或者直接使用系统调用
    signal(SIGPIPE, SIG_IGN);
    
    event_free(sigpipe);
    event_base_free(base);
}

// 更简单的方法
static void setup_signals(void) {
    // 忽略SIGPIPE
    signal(SIGPIPE, SIG_IGN);
}
```

## 六、完整服务器示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

#define PORT 8080

static struct event_base *g_base = NULL;
static int g_reload_config = 0;

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    evbuffer_add_buffer(output, input);
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        bufferevent_free(bev);
    }
}

static void accept_cb(struct evconnlistener *listener,
    evutil_socket_t fd, struct sockaddr *addr, int socklen, void *ctx) {
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

static void sigint_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nCaught SIGINT, shutting down gracefully...\n");
    event_base_loopexit(g_base, NULL);
}

static void sigterm_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nCaught SIGTERM, shutting down...\n");
    event_base_loopexit(g_base, NULL);
}

static void sighup_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nCaught SIGHUP, reloading configuration...\n");
    g_reload_config = 1;
    // 在实际应用中，这里可以重新读取配置文件
}

int main() {
    // 忽略SIGPIPE
    signal(SIGPIPE, SIG_IGN);
    
    g_base = event_base_new();
    
    // 设置信号处理
    struct event *sigint = evsignal_new(g_base, SIGINT, sigint_cb, NULL);
    struct event *sigterm = evsignal_new(g_base, SIGTERM, sigterm_cb, NULL);
    struct event *sighup = evsignal_new(g_base, SIGHUP, sighup_cb, NULL);
    
    event_add(sigint, NULL);
    event_add(sigterm, NULL);
    event_add(sighup, NULL);
    
    // 创建监听器
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(PORT);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    
    struct evconnlistener *listener = evconnlistener_new_bind(g_base,
        accept_cb, NULL, LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    if (!listener) {
        fprintf(stderr, "Failed to create listener\n");
        return 1;
    }
    
    printf("Server running on port %d\n", PORT);
    printf("Press Ctrl+C to shutdown\n");
    printf("Send SIGHUP to reload config (kill -HUP %d)\n", getpid());
    
    event_base_dispatch(g_base);
    
    printf("Cleaning up...\n");
    
    evconnlistener_free(listener);
    event_free(sigint);
    event_free(sigterm);
    event_free(sighup);
    event_base_free(g_base);
    
    printf("Server shutdown complete\n");
    return 0;
}
```

## 七、使用注意事项

| 注意事项 | 说明 |
|----------|------|
| **单event_base限制** | 每个进程只能有一个event_base监控信号 |
| **信号自动恢复** | libevent会自动恢复信号处理 |
| **EV_PERSIST** | 信号事件通常需要EV_PERSIST标志 |
| **SIGPIPE** | 网络编程中通常需要忽略SIGPIPE |
| **线程安全** | 信号处理函数中避免调用非异步安全函数 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
