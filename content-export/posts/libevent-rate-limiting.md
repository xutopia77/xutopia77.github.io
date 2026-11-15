---
title: ⚡ 速率限制 - libevent源码深度解析系列（二十三）
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# ⚡ 速率限制

## 一、概述

libevent提供了速率限制（Rate Limiting）功能，用于控制数据传输的带宽。这对于防止服务器过载、公平分配资源、实现流量整形等场景非常有用。

## 二、速率限制结构体

### 2.1 ev_token_bucket_cfg

```c
struct ev_token_bucket_cfg {
    size_t read_rate;       // 读取速率（字节/秒）
    size_t read_burst;      // 读取突发大小（字节）
    size_t write_rate;      // 写入速率（字节/秒）
    size_t write_burst;     // 写入突发大小（字节）
    struct timeval tick_len; // 时间片长度
};
```

### 2.2 bufferevent_rate_limit_group

```c
struct bufferevent_rate_limit_group {
    struct event_base *base;
    struct ev_token_bucket_cfg cfg;
    struct ev_token_bucket bucket;
    struct bufferevent **members;
    int n_members;
    // ...
};
```

## 三、令牌桶配置

### 3.1 创建配置

```c
#include <event2/bufferevent.h>

/* 创建令牌桶配置
 * @param read_rate   读取速率（字节/秒），0表示无限制
 * @param read_burst  读取突发大小（字节）
 * @param write_rate  写入速率（字节/秒），0表示无限制
 * @param write_burst 写入突发大小（字节）
 * @param tick_len    时间片长度（NULL使用默认值）
 */
struct ev_token_bucket_cfg *ev_token_bucket_cfg_new(
    size_t read_rate, size_t read_burst,
    size_t write_rate, size_t write_burst,
    const struct timeval *tick_len);

/* 释放配置 */
void ev_token_bucket_cfg_free(struct ev_token_bucket_cfg *cfg);

/* 设置时间片长度 */
int ev_token_bucket_cfg_set_tick_len(struct ev_token_bucket_cfg *cfg,
    const struct timeval *tick_len);
```

### 3.2 配置示例

```c
#include <stdio.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

int main() {
    // 创建配置：限制读取100KB/s，写入50KB/s
    struct ev_token_bucket_cfg *cfg = ev_token_bucket_cfg_new(
        102400,    // 读取速率：100KB/s
        102400,    // 读取突发：100KB
        51200,     // 写入速率：50KB/s
        51200,     // 写入突发：50KB
        NULL       // 使用默认时间片
    );
    
    if (!cfg) {
        fprintf(stderr, "Failed to create token bucket config\n");
        return 1;
    }
    
    printf("Token bucket config created\n");
    printf("Read rate: 100KB/s, Write rate: 50KB/s\n");
    
    ev_token_bucket_cfg_free(cfg);
    return 0;
}
```

## 四、单个bufferevent限速

### 4.1 设置限速

```c
/* 为bufferevent设置速率限制 */
int bufferevent_set_rate_limit(struct bufferevent *bev,
    struct ev_token_bucket_cfg *cfg);

/* 取消速率限制 */
int bufferevent_set_rate_limit(struct bufferevent *bev, NULL);

/* 获取速率限制状态 */
ev_ssize_t bufferevent_get_read_limit(struct bufferevent *bev);
ev_ssize_t bufferevent_get_write_limit(struct bufferevent *bev);

/* 获取当前速率 */
ev_ssize_t bufferevent_get_max_to_read(struct bufferevent *bev);
ev_ssize_t bufferevent_get_max_to_write(struct bufferevent *bev);

/* 获取已传输字节数 */
ev_uint64_t bufferevent_get_bytes_read(struct bufferevent *bev);
ev_uint64_t bufferevent_get_bytes_written(struct bufferevent *bev);
```

### 4.2 单连接限速示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

static struct ev_token_bucket_cfg *g_rate_cfg = NULL;

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        // 回显数据
        bufferevent_write(bev, buf, n);
    }
    
    // 打印统计信息
    printf("Bytes read: %llu, written: %llu\n",
           (unsigned long long)bufferevent_get_bytes_read(bev),
           (unsigned long long)bufferevent_get_bytes_written(bev));
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        printf("Connection closed\n");
        bufferevent_free(bev);
    }
}

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    struct event_base *base = arg;
    
    printf("New connection\n");
    
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    // 应用速率限制
    bufferevent_set_rate_limit(bev, g_rate_cfg);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建速率限制配置：限制每个连接100KB/s
    g_rate_cfg = ev_token_bucket_cfg_new(
        102400, 102400,  // 读取：100KB/s
        102400, 102400,  // 写入：100KB/s
        NULL
    );
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    sin.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        base, accept_cb, base,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    printf("Server listening on port 8080\n");
    printf("Rate limit: 100KB/s per connection\n");
    
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    ev_token_bucket_cfg_free(g_rate_cfg);
    event_base_free(base);
    
    return 0;
}
```

## 五、速率限制组

### 5.1 创建速率限制组

```c
/* 创建速率限制组 */
struct bufferevent_rate_limit_group *bufferevent_rate_limit_group_new(
    struct event_base *base,
    const struct ev_token_bucket_cfg *cfg);

/* 释放速率限制组 */
void bufferevent_rate_limit_group_free(struct bufferevent_rate_limit_group *grp);

/* 将bufferevent加入组 */
int bufferevent_add_to_rate_limit_group(struct bufferevent *bev,
    struct bufferevent_rate_limit_group *grp);

/* 将bufferevent从组中移除 */
int bufferevent_remove_from_rate_limit_group(struct bufferevent *bev);

/* 获取组成员数量 */
int bufferevent_rate_limit_group_get_members(
    struct bufferevent_rate_limit_group *grp,
    struct bufferevent **members, int n_members);
```

### 5.2 组级别限速示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

static struct bufferevent_rate_limit_group *g_rate_group = NULL;

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        bufferevent_write(bev, buf, n);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        printf("Connection closed\n");
        bufferevent_remove_from_rate_limit_group(bev);
        bufferevent_free(bev);
    }
}

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    struct event_base *base = arg;
    
    printf("New connection\n");
    
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    // 加入速率限制组
    bufferevent_add_to_rate_limit_group(bev, g_rate_group);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建组级别速率限制：总带宽1MB/s
    struct ev_token_bucket_cfg *cfg = ev_token_bucket_cfg_new(
        1048576, 1048576,  // 读取：1MB/s
        1048576, 1048576,  // 写入：1MB/s
        NULL
    );
    
    g_rate_group = bufferevent_rate_limit_group_new(base, cfg);
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    sin.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        base, accept_cb, base,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    printf("Server listening on port 8080\n");
    printf("Total rate limit: 1MB/s for all connections\n");
    
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    bufferevent_rate_limit_group_free(g_rate_group);
    ev_token_bucket_cfg_free(cfg);
    event_base_free(base);
    
    return 0;
}
```

## 六、动态调整速率

### 6.1 调整API

```c
/* 获取组当前的令牌桶状态 */
void bufferevent_rate_limit_group_get_totals(
    struct bufferevent_rate_limit_group *grp,
    ev_uint64_t *total_read, ev_uint64_t *total_written);

/* 设置最小传输速率（保证最低带宽） */
int bufferevent_rate_limit_group_set_min_share(
    struct bufferevent_rate_limit_group *grp, size_t min_share);
```

### 6.2 动态调整示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

static struct bufferevent_rate_limit_group *g_rate_group = NULL;
static struct ev_token_bucket_cfg *g_cfg = NULL;
static struct event_base *g_base = NULL;
static int g_rate_level = 0;

static void adjust_rate(evutil_socket_t fd, short events, void *arg) {
    static const size_t rates[] = {102400, 512000, 1048576, 2097152};  // 100KB, 500KB, 1MB, 2MB
    g_rate_level = (g_rate_level + 1) % 4;
    
    // 创建新的配置
    struct ev_token_bucket_cfg *new_cfg = ev_token_bucket_cfg_new(
        rates[g_rate_level], rates[g_rate_level],
        rates[g_rate_level], rates[g_rate_level],
        NULL
    );
    
    // 更新组的配置
    bufferevent_rate_limit_group_set_cfg(g_rate_group, new_cfg);
    
    printf("Rate adjusted to: %zu KB/s\n", rates[g_rate_level] / 1024);
    
    ev_token_bucket_cfg_free(g_cfg);
    g_cfg = new_cfg;
}

static void print_stats(evutil_socket_t fd, short events, void *arg) {
    ev_uint64_t total_read, total_written;
    bufferevent_rate_limit_group_get_totals(g_rate_group, &total_read, &total_written);
    
    printf("Total read: %llu bytes, written: %llu bytes\n",
           (unsigned long long)total_read, (unsigned long long)total_written);
}
```

## 七、令牌桶原理

### 7.1 工作原理

```
                    ┌─────────────────┐
                    │   令牌桶        │
                    │   (Burst)       │
                    │   容量: B       │
                    └────────┬────────┘
                             │
                             │ 令牌消耗
                             ▼
    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
    │  令牌生成    │───▶│  数据传输   │───▶│  数据包发送  │
    │  速率: R/s   │    │  检查令牌   │    │              │
    └──────────────┘    └─────────────┘    └──────────────┘
    
    R = Rate (速率，字节/秒)
    B = Burst (突发大小，字节)
```

### 7.2 参数说明

| 参数 | 说明 | 建议值 |
|------|------|--------|
| `read_rate` | 平均读取速率 | 根据业务需求 |
| `read_burst` | 最大突发读取 | 通常等于rate或稍大 |
| `write_rate` | 平均写入速率 | 根据业务需求 |
| `write_burst` | 最大突发写入 | 通常等于rate或稍大 |
| `tick_len` | 时间片长度 | 默认1秒，可设更小 |

## 八、公平共享

### 8.1 公平共享机制

当多个连接共享一个速率限制组时，libevent会自动实现公平共享：

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

static struct bufferevent_rate_limit_group *g_group = NULL;

static void read_cb(struct bufferevent *bev, void *arg) {
    int id = *(int *)arg;
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        bufferevent_write(bev, buf, n);
        printf("Connection %d: read %zu bytes\n", id, n);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        int id = *(int *)arg;
        printf("Connection %d closed\n", id);
        free(arg);
        bufferevent_remove_from_rate_limit_group(bev);
        bufferevent_free(bev);
    }
}

static int g_conn_id = 0;

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    struct event_base *base = arg;
    
    int *id = malloc(sizeof(int));
    *id = ++g_conn_id;
    
    printf("New connection %d\n", *id);
    
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_add_to_rate_limit_group(bev, g_group);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, id);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 总带宽限制为1MB/s，所有连接共享
    struct ev_token_bucket_cfg *cfg = ev_token_bucket_cfg_new(
        1048576, 1048576,
        1048576, 1048576,
        NULL
    );
    
    g_group = bufferevent_rate_limit_group_new(base, cfg);
    
    // 设置每个连接的最小保证带宽（可选）
    bufferevent_rate_limit_group_set_min_share(g_group, 10240);  // 10KB/s
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    sin.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        base, accept_cb, base,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    printf("Server listening on port 8080\n");
    printf("Total bandwidth: 1MB/s, min per connection: 10KB/s\n");
    
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    bufferevent_rate_limit_group_free(g_group);
    ev_token_bucket_cfg_free(cfg);
    event_base_free(base);
    
    return 0;
}
```

## 九、完整示例：带宽控制服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

#define TOTAL_BANDWIDTH (2 * 1024 * 1024)  // 2MB/s
#define PER_CONN_BANDWIDTH (100 * 1024)    // 100KB/s
#define MIN_SHARE (10 * 1024)              // 10KB/s

static struct event_base *g_base = NULL;
static struct bufferevent_rate_limit_group *g_group = NULL;
static struct ev_token_bucket_cfg *g_conn_cfg = NULL;

static void print_stats(evutil_socket_t fd, short events, void *arg) {
    ev_uint64_t total_read, total_written;
    bufferevent_rate_limit_group_get_totals(g_group, &total_read, &total_written);
    
    printf("\n=== Statistics ===\n");
    printf("Total read: %llu bytes (%.2f MB)\n", 
           (unsigned long long)total_read, (double)total_read / (1024 * 1024));
    printf("Total written: %llu bytes (%.2f MB)\n",
           (unsigned long long)total_written, (double)total_written / (1024 * 1024));
    printf("==================\n\n");
}

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[8192];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        bufferevent_write(bev, buf, n);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & BEV_EVENT_CONNECTED) {
        printf("Client connected\n");
    } else if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        printf("Client disconnected\n");
        bufferevent_remove_from_rate_limit_group(bev);
        bufferevent_free(bev);
    }
}

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    struct event_base *base = arg;
    
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    // 设置单个连接的速率限制
    bufferevent_set_rate_limit(bev, g_conn_cfg);
    
    // 加入组级别限制
    bufferevent_add_to_rate_limit_group(bev, g_group);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nShutting down...\n");
    event_base_loopbreak(g_base);
}

int main() {
    g_base = event_base_new();
    
    // 单连接速率限制配置
    g_conn_cfg = ev_token_bucket_cfg_new(
        PER_CONN_BANDWIDTH, PER_CONN_BANDWIDTH,
        PER_CONN_BANDWIDTH, PER_CONN_BANDWIDTH,
        NULL
    );
    
    // 组级别速率限制配置
    struct ev_token_bucket_cfg *group_cfg = ev_token_bucket_cfg_new(
        TOTAL_BANDWIDTH, TOTAL_BANDWIDTH,
        TOTAL_BANDWIDTH, TOTAL_BANDWIDTH,
        NULL
    );
    
    g_group = bufferevent_rate_limit_group_new(g_base, group_cfg);
    bufferevent_rate_limit_group_set_min_share(g_group, MIN_SHARE);
    
    // 设置信号处理
    struct event *sigint = evsignal_new(g_base, SIGINT, signal_cb, NULL);
    event_add(sigint, NULL);
    
    // 设置定时器打印统计信息
    struct event *stats_timer = event_new(g_base, -1, EV_PERSIST, print_stats, NULL);
    struct timeval stats_interval = {5, 0};  // 每5秒
    event_add(stats_timer, &stats_interval);
    
    // 创建监听器
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8080);
    sin.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        g_base, accept_cb, g_base,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    printf("Bandwidth-limited echo server\n");
    printf("Listening on port 8080\n");
    printf("Total bandwidth: %d KB/s\n", TOTAL_BANDWIDTH / 1024);
    printf("Per connection: %d KB/s\n", PER_CONN_BANDWIDTH / 1024);
    printf("Min share: %d KB/s\n", MIN_SHARE / 1024);
    printf("Press Ctrl+C to stop\n\n");
    
    event_base_dispatch(g_base);
    
    evconnlistener_free(listener);
    event_free(stats_timer);
    event_free(sigint);
    bufferevent_rate_limit_group_free(g_group);
    ev_token_bucket_cfg_free(group_cfg);
    ev_token_bucket_cfg_free(g_conn_cfg);
    event_base_free(g_base);
    
    return 0;
}
```

## 十、最佳实践

| 场景 | 建议 |
|------|------|
| **单连接限制** | 使用`bufferevent_set_rate_limit` |
| **全局限制** | 使用速率限制组 |
| **突发处理** | 设置合理的burst值 |
| **公平分配** | 设置min_share保证最小带宽 |
| **动态调整** | 根据负载动态调整速率 |
| **监控统计** | 定期打印统计信息 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
