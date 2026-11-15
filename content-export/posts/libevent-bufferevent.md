---
title: "\U0001F4E4 bufferevent详解 - libevent源码深度解析系列（七）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📊 bufferevent详解

## 一、概述

在libevent中，bufferevent是一个高级抽象，它封装了底层的I/O事件和缓冲区管理，使得开发者可以更方便地处理网络I/O操作。bufferevent提供了一种机制，允许应用程序在数据可读或可写时得到通知，而不需要手动处理底层的I/O事件。

bufferevent内部有两个缓冲区：一个用于读取数据，一个用于写入数据。当底层socket有数据可读时，bufferevent会自动将数据读入读缓冲区，并触发读回调；当写缓冲区有数据时，bufferevent会自动将数据写入底层socket，并触发写回调。

## 二、bufferevent工作流程

### 2.1 bufferevent架构

```
┌─────────────────────────────────────────────────────────┐
│                    bufferevent                       │
├─────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │  输入缓冲区  │  │  输出缓冲区  │  │  事件回调  │      │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘      │
│        │               │               │              │
├────────┼───────────────┼───────────────┼──────────────┤
│        │               │               │              │
├────────▼───────────────▼───────────────▼──────────────┤
│                 底层event机制                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 bufferevent数据流程

```
┌─────────────────────────────────────────────────────────┐
│                bufferevent数据流程                   │
├─────────────────────────────────────────────────────────┤
│ 1. 网络数据到达                                       │
│ 2. 底层event触发读事件                                 │
│ 3. bufferevent自动读取数据到输入缓冲区                    │
│ 4. 当数据达到读水位时，触发用户读回调                      │
│ 5. 用户通过bufferevent_read读取数据                    │
│ 6. 用户通过bufferevent_write写入数据                   │
│ 7. 数据被写入输出缓冲区                                  │
│ 8. 当输出缓冲区有数据且可写时，自动写入网络                  │
│ 9. 当输出缓冲区数据低于写水位时，触发用户写回调                │
└─────────────────────────────────────────────────────────┘
```

## 三、bufferevent结构体

```c
struct bufferevent {
    struct event_base *be_base;
    const struct bufferevent_ops *be_ops;
    struct event ev_read;       // 读事件
    struct event ev_write;      // 写事件
    struct evbuffer *input;     // 读缓冲区
    struct evbuffer *output;    // 写缓冲区
    
    bufferevent_data_cb readcb;   // 读回调
    bufferevent_data_cb writecb;  // 写回调
    bufferevent_event_cb errorcb; // 错误回调
    void *cbarg;
    
    struct timeval timeout_read;  // 读超时
    struct timeval timeout_write; // 写超时
    
    short enabled;
    short options;
};
```

## 四、bufferevent类型

| 类型 | 说明 |
|------|------|
| `bufferevent_socket` | 基于socket的bufferevent |
| `bufferevent_async` | Windows IOCP |
| `bufferevent_pair` | 用于线程间通信 |
| `bufferevent_filter` | 数据过滤 |
| `bufferevent_openssl` | SSL/TLS加密 |

## 四、创建与销毁

### 4.1 创建bufferevent

```c
/* 创建基于socket的bufferevent
 * @param base   event_base
 * @param fd     文件描述符，如果为-1，后续需要调用bufferevent_socket_connect
 * @param options 选项标志
 */
struct bufferevent *bufferevent_socket_new(struct event_base *base,
    evutil_socket_t fd, int options);

/* 释放bufferevent */
void bufferevent_free(struct bufferevent *bev);
```

### 4.2 选项标志

```c
#define BEV_OPT_CLOSE_ON_FREE    0x01  // 释放时关闭底层文件描述符
#define BEV_OPT_THREADSAFE       0x02  // 使bufferevent线程安全
#define BEV_OPT_DEFER_CALLBACKS  0x04  // 延迟回调执行
#define BEV_OPT_UNLOCK_CALLBACKS 0x08  // 回调时不持有锁
```

## 五、回调函数

### 5.1 回调函数类型

```c
/* 读/写回调函数类型
 * @param bev   bufferevent指针
 * @param ctx   用户提供的参数
 */
typedef void (*bufferevent_data_cb)(struct bufferevent *bev, void *ctx);

/* 事件回调函数类型
 * @param bev   bufferevent指针
 * @param what  事件标志
 * @param ctx   用户提供的参数
 */
typedef void (*bufferevent_event_cb)(struct bufferevent *bev, short what, void *ctx);
```

### 5.2 事件标志

```c
#define BEV_EVENT_READING    0x01  // 读操作时发生
#define BEV_EVENT_WRITING    0x02  // 写操作时发生
#define BEV_EVENT_EOF        0x10  // 遇到文件结束符
#define BEV_EVENT_ERROR      0x20  // 发生错误
#define BEV_EVENT_TIMEOUT    0x40  // 超时
#define BEV_EVENT_CONNECTED  0x80  // 连接成功
```

### 5.3 设置回调

```c
/* 设置回调函数
 * @param readcb  读回调，当读缓冲区有数据时触发，NULL表示禁用
 * @param writecb 写回调，当写缓冲区数据发送完毕时触发，NULL表示禁用
 * @param eventcb 事件回调，连接、错误等事件
 * @param cbarg   回调函数的参数
 */
void bufferevent_setcb(struct bufferevent *bufev,
    bufferevent_data_cb readcb, bufferevent_data_cb writecb,
    bufferevent_event_cb eventcb, void *cbarg);
```

## 六、启用和禁用事件

```c
/* 启用事件
 * @param event EV_READ, EV_WRITE, 或两者的组合
 */
int bufferevent_enable(struct bufferevent *bufev, short event);

/* 禁用事件 */
int bufferevent_disable(struct bufferevent *bufev, short event);

/* 获取当前启用的事件 */
short bufferevent_get_enabled(struct bufferevent *bufev);
```

## 七、缓冲区操作

### 7.1 获取缓冲区

```c
/* 获取输入缓冲区（读缓冲区） */
struct evbuffer *bufferevent_get_input(struct bufferevent *bufev);

/* 获取输出缓冲区（写缓冲区） */
struct evbuffer *bufferevent_get_output(struct bufferevent *bufev);
```

### 7.2 读写数据

```c
/* 向输出缓冲区写入数据 */
int bufferevent_write(struct bufferevent *bufev, const void *data, size_t size);

/* 向输出缓冲区写入格式化数据 */
int bufferevent_write_buffer(struct bufferevent *bufev, struct evbuffer *buf);

/* 从输入缓冲区读取数据 */
size_t bufferevent_read(struct bufferevent *bufev, void *data, size_t size);

/* 从输入缓冲区读取数据到evbuffer */
int bufferevent_read_buffer(struct bufferevent *bufev, struct evbuffer *buf);
```

## 八、水位控制

水位（Watermarks）用于控制缓冲区的大小，当缓冲区中的数据量达到水位时，会触发相应的行为。

### 8.1 读水位

| 水位类型 | 说明 |
|----------|------|
| **低水位** | 读缓冲区数据量达到此值时，才会触发读回调。默认为0，表示有数据就触发 |
| **高水位** | 读缓冲区数据量达到此值时，停止读取数据，直到缓冲区数据量降低 |

### 8.2 写水位

| 水位类型 | 说明 |
|----------|------|
| **低水位** | 写缓冲区数据量低于此值时，才会触发写回调。默认为0 |

### 8.3 设置水位

```c
/* 设置水位
 * @param events    EV_READ 或 EV_WRITE
 * @param lowmark   低水位
 * @param highmark  高水位，0表示无限制
 */
void bufferevent_setwatermark(struct bufferevent *bufev, short events,
    size_t lowmark, size_t highmark);
```

### 8.4 水位示例

```c
// 设置读高水位为1MB，防止内存耗尽
bufferevent_setwatermark(bev, EV_READ, 0, 1024*1024);

// 设置读低水位为100字节，只有数据量>=100时才触发读回调
bufferevent_setwatermark(bev, EV_READ, 100, 0);
```

## 九、超时设置

```c
/* 设置超时
 * @param timeout_read  读超时，NULL表示禁用
 * @param timeout_write 写超时，NULL表示禁用
 */
int bufferevent_set_timeouts(struct bufferevent *bufev,
    const struct timeval *timeout_read, const struct timeval *timeout_write);
```

## 十、连接操作

### 10.1 服务端连接

```c
/* 获取底层socket */
evutil_socket_t bufferevent_getfd(struct bufferevent *bufev);

/* 获取所属的event_base */
struct event_base *bufferevent_get_base(struct bufferevent *bufev);
```

### 10.2 客户端连接

```c
/* 连接服务器
 * @param addr 服务器地址
 * @param socklen 地址长度
 */
int bufferevent_socket_connect(struct bufferevent *bev,
    const struct sockaddr *addr, int socklen);

/* 通过主机名连接 */
int bufferevent_socket_connect_hostname(struct bufferevent *bev,
    struct evdns_base *dns_base, int family, const char *hostname, int port);

/* 获取连接错误码 */
int bufferevent_socket_get_dns_error(struct bufferevent *bev);
```

## 十一、使用示例

### 11.1 TCP服务端

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    
    // 回显数据
    evbuffer_add_buffer(output, input);
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & BEV_EVENT_ERROR) {
        perror("Error from bufferevent");
    }
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        bufferevent_free(bev);
    }
}

static void accept_conn_cb(struct evconnlistener *listener,
    evutil_socket_t fd, struct sockaddr *address, int socklen, void *ctx) {
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    struct event_base *base = event_base_new();
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    
    struct evconnlistener *listener = evconnlistener_new_bind(base,
        accept_conn_cb, NULL, LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr*)&sin, sizeof(sin));
    
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    event_base_free(base);
    return 0;
}
```

### 11.2 TCP客户端

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/event.h>

static void read_cb(struct bufferevent *bev, void *ctx) {
    char buf[1024];
    size_t n;
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        fwrite(buf, 1, n, stdout);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected!\n");
        // 发送数据
        bufferevent_write(bev, "Hello, Server!\n", 15);
    } else if (events & BEV_EVENT_ERROR) {
        printf("Error: %s\n", strerror(errno));
    }
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        bufferevent_free(bev);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *bev = bufferevent_socket_new(base, -1, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    inet_pton(AF_INET, "127.0.0.1", &sin.sin_addr);
    
    bufferevent_socket_connect(bev, (struct sockaddr*)&sin, sizeof(sin));
    
    event_base_dispatch(base);
    event_base_free(base);
    return 0;
}
```

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
