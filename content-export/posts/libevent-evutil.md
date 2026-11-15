---
title: "\U0001F6E0️ evutil工具函数 - libevent源码深度解析系列（二十）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔧 evutil工具函数

## 一、概述

`evutil` 是libevent提供的跨平台工具函数库，封装了各种操作系统差异，提供统一的API。这些函数包括socket操作、地址处理、字符串处理、时间操作、随机数生成等。

## 二、Socket操作

### 2.1 Socket创建与配置

```c
/* 创建socket */
evutil_socket_t evutil_socket_(int domain, int type, int protocol);

/* 创建socket pair */
int evutil_socketpair(int domain, int type, int protocol, 
                      evutil_socket_t pair[2]);

/* 设置非阻塞 */
int evutil_make_socket_nonblocking(evutil_socket_t sock);

/* 设置关闭时执行 */
int evutil_make_socket_closeonexec(evutil_socket_t sock);

/* 关闭socket（跨平台） */
int evutil_closesocket(evutil_socket_t sock);

/* 获取socket错误码 */
int evutil_socket_geterror(evutil_socket_t sock);

/* 设置socket重用地址 */
int evutil_socket_connect_(evutil_socket_t *fd_ptr, 
    const struct sockaddr *sa, int socklen);
```

### 2.2 Socket操作示例

```c
#include <stdio.h>
#include <event2/util.h>

int main() {
    // 创建socket
    evutil_socket_t fd = evutil_socket_(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("socket");
        return 1;
    }
    
    // 设置非阻塞
    if (evutil_make_socket_nonblocking(fd) < 0) {
        perror("nonblocking");
        evutil_closesocket(fd);
        return 1;
    }
    
    // 设置close-on-exec
    evutil_make_socket_closeonexec(fd);
    
    printf("Socket created and configured\n");
    
    evutil_closesocket(fd);
    return 0;
}
```

### 2.3 Socket Pair示例

```c
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <event2/util.h>

int main() {
    evutil_socket_t pair[2];
    
    // 创建socket pair
    if (evutil_socketpair(AF_UNIX, SOCK_STREAM, 0, pair) < 0) {
        perror("socketpair");
        return 1;
    }
    
    // 设置非阻塞
    evutil_make_socket_nonblocking(pair[0]);
    evutil_make_socket_nonblocking(pair[1]);
    
    // 写入数据
    const char *msg = "Hello from pair[0]";
    write(pair[0], msg, strlen(msg));
    
    // 读取数据
    char buf[64];
    ssize_t n = read(pair[1], buf, sizeof(buf) - 1);
    if (n > 0) {
        buf[n] = '\0';
        printf("Received: %s\n", buf);
    }
    
    evutil_closesocket(pair[0]);
    evutil_closesocket(pair[1]);
    
    return 0;
}
```

## 三、地址操作

### 3.1 地址解析

```c
/* 解析地址字符串
 * @param str      地址字符串，如 "192.168.1.1:8080" 或 "[::1]:8080"
 * @param out      输出sockaddr结构
 * @param outlen   输出长度
 * @return         0成功，-1失败
 */
int evutil_parse_sockaddr_port(const char *str, struct sockaddr *out, 
                                int *outlen);

/* 比较两个地址 */
int evutil_sockaddr_cmp(const struct sockaddr *sa1, const struct sockaddr *sa2,
                        int include_port);

/* 获取地址字符串 */
const char *evutil_inet_ntop(int af, const void *src, char *dst, size_t size);

/* 解析地址字符串 */
int evutil_inet_pton(int af, const char *src, void *dst);
```

### 3.2 地址操作示例

```c
#include <stdio.h>
#include <string.h>
#include <arpa/inet.h>
#include <event2/util.h>

int main() {
    struct sockaddr_in sin;
    int len = sizeof(sin);
    
    // 解析地址字符串
    if (evutil_parse_sockaddr_port("192.168.1.1:8080", 
                                    (struct sockaddr *)&sin, &len) == 0) {
        char ip[INET_ADDRSTRLEN];
        evutil_inet_ntop(AF_INET, &sin.sin_addr, ip, sizeof(ip));
        printf("Parsed: %s:%d\n", ip, ntohs(sin.sin_port));
    }
    
    // 解析IPv6地址
    struct sockaddr_in6 sin6;
    len = sizeof(sin6);
    if (evutil_parse_sockaddr_port("[::1]:8080", 
                                    (struct sockaddr *)&sin6, &len) == 0) {
        char ip[INET6_ADDRSTRLEN];
        evutil_inet_ntop(AF_INET6, &sin6.sin6_addr, ip, sizeof(ip));
        printf("Parsed IPv6: %s:%d\n", ip, ntohs(sin6.sin6_port));
    }
    
    // 比较地址
    struct sockaddr_in a1, a2;
    memset(&a1, 0, sizeof(a1));
    memset(&a2, 0, sizeof(a2));
    
    a1.sin_family = AF_INET;
    a1.sin_addr.s_addr = inet_addr("192.168.1.1");
    a1.sin_port = htons(80);
    
    a2.sin_family = AF_INET;
    a2.sin_addr.s_addr = inet_addr("192.168.1.1");
    a2.sin_port = htons(8080);
    
    int cmp = evutil_sockaddr_cmp((struct sockaddr *)&a1, 
                                   (struct sockaddr *)&a2, 0);
    printf("Compare (ignore port): %s\n", cmp == 0 ? "equal" : "different");
    
    cmp = evutil_sockaddr_cmp((struct sockaddr *)&a1, 
                               (struct sockaddr *)&a2, 1);
    printf("Compare (with port): %s\n", cmp == 0 ? "equal" : "different");
    
    return 0;
}
```

## 四、字符串处理

### 4.1 字符串API

```c
/* 字符串转长整型 */
ev_int64_t evutil_strtoll(const char *s, char **endptr, int base);

/* 安全的snprintf */
int evutil_snprintf(char *buf, size_t buflen, const char *format, ...);

/* 安全的vsnprintf */
int evutil_vsnprintf(char *buf, size_t buflen, const char *format, va_list ap);

/* 不区分大小写的字符串比较 */
int evutil_ascii_strcasecmp(const char *str1, const char *str2);
int evutil_ascii_strncasecmp(const char *str1, const char *str2, size_t n);

/* 字符串转小写 */
char *evutil_ascii_strtolower(char *str);

/* 字符串复制（跨平台） */
char *evutil_strtoll(const char *s, char **endptr, int base);
```

### 4.2 字符串示例

```c
#include <stdio.h>
#include <event2/util.h>

int main() {
    // 字符串转数字
    const char *num_str = "12345abc";
    char *end;
    ev_int64_t num = evutil_strtoll(num_str, &end, 10);
    printf("Parsed: %lld, remaining: %s\n", num, end);
    
    // 安全格式化
    char buf[32];
    evutil_snprintf(buf, sizeof(buf), "Value: %d, String: %s", 42, "test");
    printf("%s\n", buf);
    
    // 不区分大小写比较
    const char *s1 = "Hello";
    const char *s2 = "HELLO";
    int cmp = evutil_ascii_strcasecmp(s1, s2);
    printf("Compare '%s' and '%s': %s\n", s1, s2, cmp == 0 ? "equal" : "different");
    
    // 转小写
    char str[] = "HELLO WORLD";
    evutil_ascii_strtolower(str);
    printf("Lowercase: %s\n", str);
    
    return 0;
}
```

## 五、时间操作

### 5.1 时间API

```c
/* 获取当前时间 */
int evutil_gettimeofday(struct timeval *tv, struct timezone *tz);

/* 清零时间 */
#define evutil_timerclear(tvp)      ((tvp)->tv_sec = (tvp)->tv_usec = 0)

/* 检查时间是否为0 */
int evutil_timerisset(const struct timeval *tvp);

/* 比较时间 */
#define evutil_timercmp(tvp, uvp, cmp)                     \
    (((tvp)->tv_sec == (uvp)->tv_sec) ?                    \
     ((tvp)->tv_usec cmp (uvp)->tv_usec) :                 \
     ((tvp)->tv_sec cmp (uvp)->tv_sec))

/* 时间加法 */
void evutil_timeradd(const struct timeval *a, const struct timeval *b,
                     struct timeval *res);

/* 时间减法 */
void evutil_timersub(const struct timeval *a, const struct timeval *b,
                     struct timeval *res);

/* 计算时间差（毫秒） */
ev_int64_t evutil_tv_to_msec(const struct timeval *tv);

/* 毫秒转时间 */
void evutil_msec_to_tv(ev_int64_t msec, struct timeval *tv);
```

### 5.2 时间示例

```c
#include <stdio.h>
#include <event2/util.h>

int main() {
    struct timeval tv1, tv2, result;
    
    // 获取当前时间
    evutil_gettimeofday(&tv1, NULL);
    printf("Current time: %ld.%06ld\n", tv1.tv_sec, tv1.tv_usec);
    
    // 时间加法
    struct timeval delay = {2, 500000};  // 2.5秒
    evutil_timeradd(&tv1, &delay, &result);
    printf("After 2.5s: %ld.%06ld\n", result.tv_sec, result.tv_usec);
    
    // 时间比较
    evutil_gettimeofday(&tv2, NULL);
    if (evutil_timercmp(&tv2, &tv1, >)) {
        printf("tv2 > tv1\n");
    }
    
    // 时间差
    evutil_timersub(&tv2, &tv1, &result);
    printf("Time elapsed: %ld.%06ld seconds\n", result.tv_sec, result.tv_usec);
    
    // 转换为毫秒
    ev_int64_t msec = evutil_tv_to_msec(&result);
    printf("Time elapsed: %lld ms\n", msec);
    
    return 0;
}
```

## 六、随机数

### 6.1 随机数API

```c
/* 初始化安全随机数生成器 */
int evutil_secure_rng_init(void);

/* 设置随机数设备文件 */
int evutil_secure_rng_set_urandom_device_file(char *fname);

/* 获取安全随机字节 */
void evutil_secure_rng_get_bytes(void *buf, size_t n);

/* 检查是否支持安全随机数 */
int evutil_secure_rng_global_setup_locks_(int enable_locks);
```

### 6.2 随机数示例

```c
#include <stdio.h>
#include <event2/util.h>

int main() {
    // 初始化安全随机数
    if (evutil_secure_rng_init() < 0) {
        fprintf(stderr, "Failed to initialize secure RNG\n");
        return 1;
    }
    
    // 生成随机数
    unsigned char bytes[16];
    evutil_secure_rng_get_bytes(bytes, sizeof(bytes));
    
    printf("Random bytes: ");
    for (int i = 0; i < sizeof(bytes); i++) {
        printf("%02x", bytes[i]);
    }
    printf("\n");
    
    // 生成随机整数
    unsigned int random_int;
    evutil_secure_rng_get_bytes(&random_int, sizeof(random_int));
    printf("Random int: %u\n", random_int);
    
    return 0;
}
```

## 七、错误处理

### 7.1 错误API

```c
/* 获取最后错误码 */
#define evutil_socket_geterror(sock) ...

/* 获取错误字符串 */
const char *evutil_socket_error_to_string(int err);

/* 设置错误码 */
#define evutil_socket_seterror(err) ...

/* 错误码定义 */
#define EVUTIL_SOCKET_ERROR()    errno
#define EVUTIL_SET_SOCKET_ERROR(err) (errno = (err))
```

### 7.2 错误处理示例

```c
#include <stdio.h>
#include <event2/util.h>

int main() {
    evutil_socket_t fd = evutil_socket_(AF_INET, SOCK_STREAM, 0);
    
    if (fd < 0) {
        int err = EVUTIL_SOCKET_ERROR();
        printf("Socket error: %s\n", evutil_socket_error_to_string(err));
        return 1;
    }
    
    // 尝试连接一个无效地址
    struct sockaddr_in sin;
    sin.sin_family = AF_INET;
    sin.sin_port = htons(12345);
    sin.sin_addr.s_addr = inet_addr("0.0.0.0");
    
    if (connect(fd, (struct sockaddr *)&sin, sizeof(sin)) < 0) {
        int err = evutil_socket_geterror(fd);
        printf("Connect error (%d): %s\n", err, evutil_socket_error_to_string(err));
    }
    
    evutil_closesocket(fd);
    return 0;
}
```

## 八、内存操作

### 8.1 内存API

```c
/* 内存对齐分配 */
void *evutil_memalign_(size_t alignment, size_t size);

/* 内存比较（恒定时间） */
int evutil_memcmp_(const void *a, const void *b, size_t len);

/* 安全内存清零 */
void evutil_memclear_(void *mem, size_t len);
```

## 九、文件描述符操作

### 9.1 文件描述符API

```c
/* 设置FD_CLOEXEC */
int evutil_make_fd_closeonexec(evutil_socket_t fd);

/* 复制文件描述符 */
evutil_socket_t evutil_dupfd_(evutil_socket_t fd);

/* 设置文件描述符标志 */
int evutil_fd_flag_set(evutil_socket_t fd, int flag, int on);
```

## 十、网络相关常量

### 10.1 常用宏定义

```c
/* 地址族 */
#ifndef AF_INET6
#define AF_INET6 10
#endif

/* socket类型 */
#ifndef SOCK_NONBLOCK
#define SOCK_NONBLOCK 0
#endif

#ifndef SOCK_CLOEXEC
#define SOCK_CLOEXEC 0
#endif

/* 错误码 */
#ifndef EWOULDBLOCK
#define EWOULDBLOCK EAGAIN
#endif

#ifndef EINPROGRESS
#define EINPROGRESS WSAEINPROGRESS
#endif
```

## 十一、跨平台宏

### 11.1 平台检测

```c
#ifdef _WIN32
    // Windows平台
    #define EVUTIL_SOCKET_IS_INVALID(s) ((s) == INVALID_SOCKET)
    #define EVUTIL_SOCKET_ERROR() WSAGetLastError()
#else
    // Unix/Linux平台
    #define EVUTIL_SOCKET_IS_INVALID(s) ((s) < 0)
    #define EVUTIL_SOCKET_ERROR() (errno)
#endif
```

## 十二、完整示例：跨平台TCP客户端

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/util.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

#define SERVER_IP "127.0.0.1"
#define SERVER_PORT 8080

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Received: %s", buf);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to server\n");
        bufferevent_write(bev, "Hello, Server!\n", 15);
    } else if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        if (events & BEV_EVENT_ERROR) {
            int err = evutil_socket_geterror(bufferevent_getfd(bev));
            printf("Error: %s\n", evutil_socket_error_to_string(err));
        }
        bufferevent_free(bev);
        event_base_loopexit((struct event_base *)arg, NULL);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *bev = bufferevent_socket_new(base, -1, BEV_OPT_CLOSE_ON_FREE);
    
    // 使用evutil解析地址
    struct sockaddr_storage ss;
    int ss_len = sizeof(ss);
    char addr_str[64];
    evutil_snprintf(addr_str, sizeof(addr_str), "%s:%d", SERVER_IP, SERVER_PORT);
    
    if (evutil_parse_sockaddr_port(addr_str, (struct sockaddr *)&ss, &ss_len) < 0) {
        fprintf(stderr, "Invalid address: %s\n", addr_str);
        return 1;
    }
    
    printf("Connecting to %s...\n", addr_str);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, base);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    if (bufferevent_socket_connect(bev, (struct sockaddr *)&ss, ss_len) < 0) {
        int err = evutil_socket_geterror(bufferevent_getfd(bev));
        printf("Connect failed: %s\n", evutil_socket_error_to_string(err));
        bufferevent_free(bev);
        event_base_free(base);
        return 1;
    }
    
    event_base_dispatch(base);
    
    event_base_free(base);
    return 0;
}
```

## 十三、工具函数速查表

| 类别 | 函数 | 说明 |
|------|------|------|
| **Socket** | `evutil_socket_` | 创建socket |
| | `evutil_socketpair` | 创建socket pair |
| | `evutil_make_socket_nonblocking` | 设置非阻塞 |
| | `evutil_closesocket` | 关闭socket |
| **地址** | `evutil_parse_sockaddr_port` | 解析地址 |
| | `evutil_sockaddr_cmp` | 比较地址 |
| | `evutil_inet_ntop` | 地址转字符串 |
| | `evutil_inet_pton` | 字符串转地址 |
| **字符串** | `evutil_snprintf` | 安全格式化 |
| | `evutil_strtoll` | 字符串转数字 |
| | `evutil_ascii_strcasecmp` | 不区分大小写比较 |
| **时间** | `evutil_gettimeofday` | 获取时间 |
| | `evutil_timeradd` | 时间加法 |
| | `evutil_timersub` | 时间减法 |
| | `evutil_timercmp` | 时间比较 |
| **随机数** | `evutil_secure_rng_init` | 初始化随机数 |
| | `evutil_secure_rng_get_bytes` | 获取随机字节 |
| **错误** | `evutil_socket_geterror` | 获取错误码 |
| | `evutil_socket_error_to_string` | 错误码转字符串 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
