---
title: "\U0001F50C TCP监听器 - libevent源码深度解析系列（九）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔌 TCP监听器

## 一、概述

evconnlistener是libevent提供的高级抽象，用于监听TCP连接。它封装了底层的socket创建、绑定、监听和接受连接的过程，使得开发者可以更方便地创建TCP服务端。

## 二、创建监听器

### 2.1 创建函数

```c
/* 创建监听器（已绑定socket）
 * @param base     event_base
 * @param cb       接受连接的回调函数
 * @param ptr      回调函数的参数
 * @param flags    选项标志
 * @param backlog  listen()的backlog参数，-1表示使用默认值
 * @param sa       绑定的地址
 * @param socklen  地址长度
 */
struct evconnlistener *evconnlistener_new_bind(struct event_base *base,
    evconnlistener_cb cb, void *ptr, unsigned flags, int backlog,
    const struct sockaddr *sa, int socklen);

/* 创建监听器（已有socket）
 * @param fd       已绑定的socket
 */
struct evconnlistener *evconnlistener_new(struct event_base *base,
    evconnlistener_cb cb, void *ptr, unsigned flags, int backlog,
    evutil_socket_t fd);

/* 释放监听器 */
void evconnlistener_free(struct evconnlistener *lev);
```

### 2.2 选项标志

```c
#define LEV_OPT_LEAVE_SOCKETS_BLOCKED  0x01  // 不设置非阻塞
#define LEV_OPT_CLOSE_ON_FREE          0x02  // 释放时关闭socket
#define LEV_OPT_CLOSE_ON_EXEC          0x04  // 设置FD_CLOEXEC
#define LEV_OPT_REUSEABLE              0x08  // 设置SO_REUSEADDR
#define LEV_OPT_THREADSAFE             0x10  // 线程安全
#define LEV_OPT_DISABLED               0x20  // 创建时禁用
#define LEV_OPT_DEFERRED_ACCEPT        0x40  // 延迟accept（Linux）
```

## 三、回调函数

### 3.1 回调函数类型

```c
/**
 * @param listener  监听器
 * @param fd        新连接的socket
 * @param addr      客户端地址
 * @param socklen   地址长度
 * @param userarg   用户参数
 */
typedef void (*evconnlistener_cb)(struct evconnlistener *listener,
    evutil_socket_t fd, struct sockaddr *addr, int socklen, void *userarg);
```

### 3.2 错误回调

```c
typedef void (*evconnlistener_errorcb)(struct evconnlistener *lis, void *ptr);

/* 设置错误回调 */
void evconnlistener_set_error_cb(struct evconnlistener *lev,
    evconnlistener_errorcb errorcb);
```

## 四、监听器操作

### 4.1 启用和禁用

```c
/* 启用监听器 */
int evconnlistener_enable(struct evconnlistener *lev);

/* 禁用监听器 */
int evconnlistener_disable(struct evconnlistener *lev);
```

### 4.2 获取信息

```c
/* 获取监听socket */
evutil_socket_t evconnlistener_get_fd(struct evconnlistener *lev);

/* 获取所属的event_base */
struct event_base *evconnlistener_get_base(struct evconnlistener *lev);
```

## 五、完整示例

### 5.1 回射服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

static const int PORT = 8080;

static void echo_read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    
    evbuffer_add_buffer(output, input);
}

static void echo_event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & BEV_EVENT_ERROR) {
        perror("Error from bufferevent");
    }
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        bufferevent_free(bev);
    }
}

static void accept_conn_cb(struct evconnlistener *listener,
    evutil_socket_t fd, struct sockaddr *address, int socklen, void *ctx) {
    
    printf("New connection: fd=%d\n", fd);
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, echo_read_cb, NULL, echo_event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

static void accept_error_cb(struct evconnlistener *listener, void *ctx) {
    struct event_base *base = evconnlistener_get_base(listener);
    int err = EVUTIL_SOCKET_ERROR();
    fprintf(stderr, "Got an error %d (%s) on the listener. Shutting down.\n",
            err, evutil_socket_error_to_string(err));
    event_base_loopexit(base, NULL);
}

static void signal_cb(evutil_socket_t sig, short events, void *user_data) {
    struct event_base *base = user_data;
    printf("Caught signal %d, shutting down.\n", sig);
    event_base_loopexit(base, NULL);
}

int main(int argc, char **argv) {
    struct event_base *base;
    struct evconnlistener *listener;
    struct event *signal_event;
    struct sockaddr_in sin;

    base = event_base_new();
    if (!base) {
        fprintf(stderr, "Could not initialize libevent!\n");
        return 1;
    }

    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(PORT);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);

    listener = evconnlistener_new_bind(base, accept_conn_cb, NULL,
        LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE, -1,
        (struct sockaddr*)&sin, sizeof(sin));
    
    if (!listener) {
        fprintf(stderr, "Could not create a listener!\n");
        return 1;
    }

    evconnlistener_set_error_cb(listener, accept_error_cb);

    signal_event = evsignal_new(base, SIGINT, signal_cb, (void*)base);
    if (!signal_event || event_add(signal_event, NULL) < 0) {
        fprintf(stderr, "Could not create/add a signal event!\n");
        return 1;
    }

    printf("Server listening on port %d\n", PORT);
    event_base_dispatch(base);

    evconnlistener_free(listener);
    event_free(signal_event);
    event_base_free(base);

    printf("Server shutdown complete\n");
    return 0;
}
```

### 5.2 编译运行

```bash
# 编译
gcc -o echo_server echo_server.c -levent

# 运行
./echo_server

# 测试
telnet 127.0.0.1 8080
# 或
nc 127.0.0.1 8080
```

## 六、多端口监听

```c
#include <stdio.h>
#include <string.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

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
    
    int port = *(int*)ctx;
    printf("Connection on port %d, fd=%d\n", port, fd);
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    struct event_base *base = event_base_new();
    
    int ports[] = {8080, 8081, 8082};
    struct evconnlistener *listeners[3];
    
    for (int i = 0; i < 3; i++) {
        struct sockaddr_in sin;
        memset(&sin, 0, sizeof(sin));
        sin.sin_family = AF_INET;
        sin.sin_port = htons(ports[i]);
        sin.sin_addr.s_addr = htonl(INADDR_ANY);
        
        listeners[i] = evconnlistener_new_bind(base, accept_cb, &ports[i],
            LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE, -1,
            (struct sockaddr*)&sin, sizeof(sin));
        
        printf("Listening on port %d\n", ports[i]);
    }
    
    event_base_dispatch(base);
    
    for (int i = 0; i < 3; i++) {
        evconnlistener_free(listeners[i]);
    }
    event_base_free(base);
    
    return 0;
}
```

## 七、使用注意事项

| 注意事项 | 说明 |
|----------|------|
| **backlog参数** | -1使用默认值128，高并发场景建议设置更大的值 |
| **SO_REUSEADDR** | 建议启用，允许端口重用 |
| **错误处理** | 必须设置错误回调，处理监听错误 |
| **资源释放** | 使用LEV_OPT_CLOSE_ON_FREE自动关闭socket |
| **线程安全** | 多线程环境下使用LEV_OPT_THREADSAFE |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
