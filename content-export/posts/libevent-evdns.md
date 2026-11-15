---
title: "\U0001F310 evdns异步DNS - libevent源码深度解析系列（十九）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🌐 evdns异步DNS

## 一、概述

`evdns` 是libevent提供的异步DNS解析库，它允许应用程序在不阻塞的情况下进行DNS查询。evdns支持正向解析（域名到IP）、反向解析（IP到域名）、以及运行DNS服务器。

## 二、evdns_base结构体

```c
struct evdns_base {
    struct event_base *event_base;
    
    struct evdns_server_port **server_ports;
    int n_server_ports;
    
    struct evdns_request **reqs;
    int n_reqs;
    
    struct nameserver **servers;
    int n_servers;
    
    struct timeval global_nameserver_probe_initial_timeout;
    struct timeval global_nameserver_probe_period;
    // ...
};
```

## 三、创建与销毁

### 3.1 创建evdns_base

```c
/* 创建evdns_base
 * @param base            event_base
 * @param init_nameservers 是否初始化系统DNS服务器
 *                         1: 从/etc/resolv.conf读取
 *                         0: 不初始化，需要手动添加
 */
struct evdns_base *evdns_base_new(struct event_base *base, int init_nameservers);

/* 释放evdns_base
 * @param fail_requests  是否让pending的请求失败
 *                       1: 请求回调会被调用并返回错误
 *                       0: 请求回调不会被调用
 */
void evdns_base_free(struct evdns_base *base, int fail_requests);
```

### 3.2 基本示例

```c
#include <stdio.h>
#include <event2/event.h>
#include <event2/dns.h>

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    if (!dns_base) {
        fprintf(stderr, "Failed to create dns base\n");
        return 1;
    }
    
    printf("evdns_base created successfully\n");
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    return 0;
}
```

## 四、DNS服务器配置

### 4.1 添加DNS服务器

```c
/* 添加DNS服务器（IPv4地址） */
int evdns_base_nameserver_add(struct evdns_base *base, unsigned long address);

/* 添加DNS服务器（支持IPv6） */
int evdns_base_nameserver_ip_add(struct evdns_base *base, const char *ip_as_string);

/* 添加Unix域套接字DNS服务器 */
int evdns_base_nameserver_sockaddr_add(struct evdns_base *base,
    const struct sockaddr *sa, ev_socklen_t len, unsigned flags);

/* 清除所有DNS服务器 */
void evdns_base_clear_nameservers_and_suspend(struct evdns_base *base);

/* 恢复DNS解析 */
int evdns_base_resume(struct evdns_base *base);

/* 设置DNS服务器探测超时 */
void evdns_base_set_nameserver_probe_timeout(struct evdns_base *base, 
    const struct timeval *timeout);
```

### 4.2 配置示例

```c
#include <stdio.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/dns.h>

int main() {
    struct event_base *base = event_base_new();
    
    // 不自动初始化，手动添加DNS服务器
    struct evdns_base *dns_base = evdns_base_new(base, 0);
    
    // 添加Google DNS (8.8.8.8)
    evdns_base_nameserver_add(dns_base, inet_addr("8.8.8.8"));
    
    // 添加Cloudflare DNS (1.1.1.1)
    evdns_base_nameserver_ip_add(dns_base, "1.1.1.1");
    
    // 添加IPv6 DNS服务器
    evdns_base_nameserver_ip_add(dns_base, "[2001:4860:4860::8888]:53");
    
    printf("DNS servers configured\n");
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    return 0;
}
```

## 五、正向DNS解析

### 5.1 解析API

```c
/* DNS回调函数类型
 * @param result   DNS结果码
 * @param type     记录类型 (DNS_IPv4_A, DNS_IPv6_AAAA等)
 * @param count    返回的地址数量
 * @param ttl      生存时间
 * @param addresses 地址数组
 * @param arg      用户参数
 */
typedef void (*evdns_callback_type)(int result, char type, int count, 
                                     int ttl, void *addresses, void *arg);

/* 异步解析IPv4地址
 * @param name      域名
 * @param flags     解析标志
 * @param callback  回调函数
 * @param arg       用户参数
 * @return          evdns_request指针，可用于取消请求
 */
struct evdns_request *evdns_base_resolve_ipv4(
    struct evdns_base *base, const char *name, int flags,
    evdns_callback_type callback, void *arg);

/* 异步解析IPv6地址 */
struct evdns_request *evdns_base_resolve_ipv6(
    struct evdns_base *base, const char *name, int flags,
    evdns_callback_type callback, void *arg);

/* 解析任意记录类型 */
struct evdns_request *evdns_base_resolve(
    struct evdns_base *base, const char *name, int type, int flags,
    evdns_callback_type callback, void *arg);
```

### 5.2 解析标志

```c
#define DNS_QUERY_NO_SEARCH   0x01  // 不使用搜索列表
#define DNS_IPv4_A            1     // A记录
#define DNS_IPv6_AAAA         28    // AAAA记录
#define DNS_PTR               12    // PTR记录
#define DNS_CNAME             5     // CNAME记录
#define DNS_MX                15    // MX记录
#define DNS_TXT               16    // TXT记录
```

### 5.3 DNS结果码

```c
#define DNS_ERR_NONE          0   // 成功
#define DNS_ERR_FORMAT        1   // 查询格式错误
#define DNS_ERR_SERVERFAILED  2   // 服务器错误
#define DNS_ERR_NOTEXIST      3   // 域名不存在
#define DNS_ERR_NOTIMPL       4   // 未实现
#define DNS_ERR_REFUSED       5   // 拒绝
#define DNS_ERR_TRUNCATED     6   // 响应被截断
#define DNS_ERR_UNKNOWN       7   // 未知错误
#define DNS_ERR_TIMEOUT       8   // 超时
#define DNS_ERR_SHUTDOWN      9   // DNS服务关闭
#define DNS_ERR_CANCEL        10  // 请求被取消
#define DNS_ERR_NODATA        11  // 无数据
```

### 5.4 正向解析示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/dns.h>

static void dns_callback(int result, char type, int count, int ttl, 
                         void *addresses, void *arg) {
    const char *hostname = (const char *)arg;
    
    if (result == DNS_ERR_NONE) {
        printf("Resolved %s:\n", hostname);
        
        if (type == DNS_IPv4_A) {
            struct in_addr *addrs = (struct in_addr *)addresses;
            for (int i = 0; i < count; i++) {
                printf("  IPv4: %s (TTL: %d)\n", 
                       inet_ntoa(addrs[i]), ttl);
            }
        } else if (type == DNS_IPv6_AAAA) {
            char addr_str[INET6_ADDRSTRLEN];
            struct in6_addr *addrs = (struct in6_addr *)addresses;
            for (int i = 0; i < count; i++) {
                inet_ntop(AF_INET6, &addrs[i], addr_str, sizeof(addr_str));
                printf("  IPv6: %s (TTL: %d)\n", addr_str, ttl);
            }
        }
    } else {
        printf("DNS lookup failed for %s: %s\n", 
               hostname, evdns_err_to_string(result));
    }
    
    // 退出事件循环
    event_base_loopbreak((struct event_base *)arg);
}

int main(int argc, char *argv[]) {
    const char *hostname = argc > 1 ? argv[1] : "www.google.com";
    
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    printf("Resolving %s...\n", hostname);
    
    // 解析IPv4
    evdns_base_resolve_ipv4(dns_base, hostname, 0, dns_callback, (void *)hostname);
    
    event_base_dispatch(base);
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 六、反向DNS解析

### 6.1 反向解析API

```c
/* 反向解析IPv4地址 */
struct evdns_request *evdns_base_resolve_reverse(
    struct evdns_base *base, const struct in_addr *in, int flags,
    evdns_callback_type callback, void *arg);

/* 反向解析IPv6地址 */
struct evdns_request *evdns_base_resolve_reverse_ipv6(
    struct evdns_base *base, const struct in6_addr *in, int flags,
    evdns_callback_type callback, void *arg);
```

### 6.2 反向解析示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/dns.h>

static void reverse_callback(int result, char type, int count, int ttl,
                             void *addresses, void *arg) {
    if (result == DNS_ERR_NONE) {
        printf("PTR records:\n");
        char **names = (char **)addresses;
        for (int i = 0; i < count; i++) {
            printf("  %s (TTL: %d)\n", names[i], ttl);
        }
    } else {
        printf("Reverse lookup failed: %s\n", evdns_err_to_string(result));
    }
    
    event_base_loopbreak((struct event_base *)arg);
}

int main(int argc, char *argv[]) {
    const char *ip_str = argc > 1 ? argv[1] : "8.8.8.8";
    
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    struct in_addr addr;
    inet_pton(AF_INET, ip_str, &addr);
    
    printf("Reverse lookup for %s...\n", ip_str);
    evdns_base_resolve_reverse(dns_base, &addr, 0, reverse_callback, base);
    
    event_base_dispatch(base);
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 七、取消DNS请求

```c
/* 取消DNS请求 */
int evdns_cancel_request(struct evdns_base *base, struct evdns_request *req);
```

### 取消示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>
#include <event2/dns.h>

static struct evdns_request *pending_req = NULL;

static void dns_callback(int result, char type, int count, int ttl,
                         void *addresses, void *arg) {
    if (result == DNS_ERR_CANCEL) {
        printf("Request was cancelled\n");
    } else if (result == DNS_ERR_NONE) {
        printf("DNS resolved successfully\n");
    } else {
        printf("DNS error: %s\n", evdns_err_to_string(result));
    }
    
    event_base_loopbreak((struct event_base *)arg);
}

static void timer_callback(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Timeout, cancelling DNS request...\n");
    
    if (pending_req) {
        evdns_cancel_request(NULL, pending_req);
        pending_req = NULL;
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    // 发起DNS请求
    pending_req = evdns_base_resolve_ipv4(dns_base, "www.example.com", 
                                          0, dns_callback, base);
    
    // 设置1秒超时
    struct event *timer = event_new(base, -1, 0, timer_callback, base);
    struct timeval tv = {1, 0};
    event_add(timer, &tv);
    
    event_base_dispatch(base);
    
    event_free(timer);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 八、DNS服务器

### 8.1 创建DNS服务器

```c
/* DNS请求回调函数类型 */
typedef void (*evdns_request_callback_fn_type)(struct evdns_server_request *, void *);

/* 创建DNS服务器端口 */
struct evdns_server_port *evdns_add_server_port(
    struct event_base *base, evutil_socket_t socket, int flags,
    evdns_request_callback_fn_type cb, void *arg);

/* 创建DNS服务器端口（带地址） */
struct evdns_server_port *evdns_add_server_port_with_listener(
    struct event_base *base, struct evconnlistener *listener, int flags,
    evdns_request_callback_fn_type cb, void *arg);

/* 释放DNS服务器端口 */
void evdns_close_server_port(struct evdns_server_port *port);
```

### 8.2 DNS服务器请求处理

```c
/* 获取请求中的问题数量 */
int evdns_server_request_get_requesting_addr(
    struct evdns_server_request *req, struct sockaddr *sa, socklen_t *len);

/* 获取问题 */
int evdns_server_request_get_requesting_nameserver_addr(
    struct evdns_server_request *req, struct sockaddr *sa, socklen_t *len);

/* 回复A记录 */
int evdns_server_request_add_a_reply(struct evdns_server_request *req,
    const char *name, int n, const void *addrs, int ttl);

/* 回复AAAA记录 */
int evdns_server_request_add_aaaa_reply(struct evdns_server_request *req,
    const char *name, int n, const void *addrs, int ttl);

/* 回复PTR记录 */
int evdns_server_request_add_ptr_reply(struct evdns_server_request *req,
    struct in_addr *in, const char *name, int ttl);

/* 回复CNAME记录 */
int evdns_server_request_add_cname_reply(struct evdns_server_request *req,
    const char *name, const char *cname, int ttl);

/* 发送回复 */
int evdns_server_request_respond(struct evdns_server_request *req, int err);

/* 丢弃请求 */
int evdns_server_request_drop(struct evdns_server_request *req);
```

### 8.3 DNS服务器示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/dns.h>
#include <event2/dns_struct.h>

static void dns_server_callback(struct evdns_server_request *request, void *arg) {
    printf("DNS request received\n");
    
    // 获取问题
    int n_questions = request->n_questions;
    
    for (int i = 0; i < n_questions; i++) {
        struct evdns_server_question *q = request->questions[i];
        printf("Question %d: name=%s, type=%d, class=%d\n",
               i, q->name, q->type, q->dns_question_class);
        
        // 简单处理：对于特定域名返回固定IP
        if (q->type == EVDNS_TYPE_A && strcmp(q->name, "test.local.") == 0) {
            struct in_addr addr;
            inet_pton(AF_INET, "192.168.1.100", &addr);
            evdns_server_request_add_a_reply(request, q->name, 1, &addr, 60);
        } else if (q->type == EVDNS_TYPE_AAAA && strcmp(q->name, "test.local.") == 0) {
            struct in6_addr addr;
            inet_pton(AF_INET6, "::1", &addr);
            evdns_server_request_add_aaaa_reply(request, q->name, 1, &addr, 60);
        } else {
            // 其他请求返回NXDOMAIN
            evdns_server_request_respond(request, DNS_ERR_NOTEXIST);
            return;
        }
    }
    
    evdns_server_request_respond(request, DNS_ERR_NONE);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建UDP socket
    int fd = socket(AF_INET, SOCK_DGRAM, 0);
    evutil_make_socket_nonblocking(fd);
    
    int reuse = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(5353);  // 使用5353端口
    sin.sin_addr.s_addr = INADDR_ANY;
    
    bind(fd, (struct sockaddr *)&sin, sizeof(sin));
    
    // 创建DNS服务器
    struct evdns_server_port *dns_port = evdns_add_server_port(
        base, fd, 0, dns_server_callback, NULL);
    
    printf("DNS server listening on port 5353\n");
    printf("Try: nslookup -port=5353 test.local 127.0.0.1\n");
    
    event_base_dispatch(base);
    
    evdns_close_server_port(dns_port);
    evutil_closesocket(fd);
    event_base_free(base);
    
    return 0;
}
```

## 九、DNS配置选项

### 9.1 配置API

```c
/* 设置搜索域名 */
int evdns_base_search_add(struct evdns_base *base, const char *domain);

/* 清除搜索域名 */
void evdns_base_search_clear(struct evdns_base *base);

/* 设置搜索域名数量限制 */
void evdns_base_search_ndots_set(struct evdns_base *base, int ndots);

/* 设置是否使用TCP */
int evdns_base_set_option(struct evdns_base *base, const char *option, 
                          const char *val);

/* 常用选项 */
// "timeout"        - 超时时间（秒）
// "max-timeouts"   - 最大超时次数
// "attempts"       - 重试次数
// "randomize-case" - 随机化大小写（DNS安全）
// "use-vc"         - 使用TCP
// "ndots"          - 点的数量阈值
```

### 9.2 配置示例

```c
#include <stdio.h>
#include <event2/event.h>
#include <event2/dns.h>

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 0);
    
    // 添加DNS服务器
    evdns_base_nameserver_add(dns_base, inet_addr("8.8.8.8"));
    
    // 设置选项
    evdns_base_set_option(dns_base, "timeout", "5");      // 5秒超时
    evdns_base_set_option(dns_base, "attempts", "3");     // 重试3次
    evdns_base_set_option(dns_base, "use-vc", NULL);      // 使用TCP
    evdns_base_set_option(dns_base, "randomize-case", "1"); // 启用DNS安全
    
    // 添加搜索域名
    evdns_base_search_add(dns_base, "example.com");
    evdns_base_search_add(dns_base, "local");
    
    // 设置ndots
    evdns_base_search_ndots_set(dns_base, 2);
    
    printf("DNS configuration complete\n");
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    return 0;
}
```

## 十、错误处理

### 10.1 错误字符串

```c
/* 将DNS错误码转换为字符串 */
const char *evdns_err_to_string(int err);
```

### 10.2 错误处理示例

```c
#include <stdio.h>
#include <event2/dns.h>

void print_dns_error(int err) {
    switch (err) {
        case DNS_ERR_NONE:
            printf("Success\n");
            break;
        case DNS_ERR_FORMAT:
            printf("Query format error\n");
            break;
        case DNS_ERR_SERVERFAILED:
            printf("Server failed\n");
            break;
        case DNS_ERR_NOTEXIST:
            printf("Domain name does not exist\n");
            break;
        case DNS_ERR_TIMEOUT:
            printf("Query timeout\n");
            break;
        case DNS_ERR_CANCEL:
            printf("Request cancelled\n");
            break;
        default:
            printf("Unknown error: %s\n", evdns_err_to_string(err));
    }
}
```

## 十一、完整示例：异步HTTP客户端DNS解析

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/dns.h>
#include <event2/bufferevent.h>

typedef struct {
    struct event_base *base;
    struct evdns_base *dns_base;
    const char *hostname;
    int port;
} http_context_t;

static void http_event_cb(struct bufferevent *bev, short events, void *arg) {
    http_context_t *ctx = arg;
    
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to %s:%d\n", ctx->hostname, ctx->port);
        
        // 发送HTTP请求
        char request[256];
        snprintf(request, sizeof(request),
                 "GET / HTTP/1.1\r\n"
                 "Host: %s\r\n"
                 "Connection: close\r\n"
                 "\r\n", ctx->hostname);
        
        bufferevent_write(bev, request, strlen(request));
    } else if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        if (events & BEV_EVENT_ERROR) {
            printf("Connection error\n");
        }
        bufferevent_free(bev);
        event_base_loopexit(ctx->base, NULL);
    }
}

static void http_read_cb(struct bufferevent *bev, void *arg) {
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("%s", buf);
    }
}

static void dns_callback(int result, char type, int count, int ttl,
                         void *addresses, void *arg) {
    http_context_t *ctx = arg;
    
    if (result != DNS_ERR_NONE || count == 0) {
        printf("DNS lookup failed for %s: %s\n", 
               ctx->hostname, evdns_err_to_string(result));
        event_base_loopexit(ctx->base, NULL);
        return;
    }
    
    struct in_addr *addrs = (struct in_addr *)addresses;
    printf("Resolved %s to %s\n", ctx->hostname, inet_ntoa(addrs[0]));
    
    // 创建连接
    struct bufferevent *bev = bufferevent_socket_new(ctx->base, -1, 
                                                      BEV_OPT_CLOSE_ON_FREE);
    bufferevent_setcb(bev, http_read_cb, NULL, http_event_cb, ctx);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(ctx->port);
    sin.sin_addr = addrs[0];
    
    bufferevent_socket_connect(bev, (struct sockaddr *)&sin, sizeof(sin));
}

int main(int argc, char *argv[]) {
    const char *hostname = argc > 1 ? argv[1] : "www.example.com";
    int port = argc > 2 ? atoi(argv[2]) : 80;
    
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    http_context_t ctx = {
        .base = base,
        .dns_base = dns_base,
        .hostname = hostname,
        .port = port
    };
    
    printf("Resolving %s...\n", hostname);
    evdns_base_resolve_ipv4(dns_base, hostname, 0, dns_callback, &ctx);
    
    event_base_dispatch(base);
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 十二、最佳实践

| 场景 | 建议 |
|------|------|
| **生产环境** | 配置多个DNS服务器，提高可用性 |
| **超时设置** | 根据网络环境调整超时时间 |
| **错误处理** | 实现重试机制和降级策略 |
| **DNS缓存** | 应用层实现缓存，减少DNS查询 |
| **IPv6支持** | 同时解析IPv4和IPv6地址 |
| **DNS安全** | 启用randomize-case防止DNS欺骗 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
