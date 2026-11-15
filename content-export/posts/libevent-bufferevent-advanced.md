---
title: "\U0001F517 bufferevent高级特性 - libevent源码深度解析系列（二十四）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔗 bufferevent高级特性

## 一、概述

除了基本的socket bufferevent，libevent还提供了多种高级bufferevent类型，包括pair（成对连接）、filter（过滤器）等。这些特性使得bufferevent可以用于更复杂的场景。

## 二、bufferevent_pair

### 2.1 概述

`bufferevent_pair` 创建两个相互连接的bufferevent，写入其中一个的数据可以从另一个读取。这非常适合进程内通信、测试、以及构建复杂的数据流管道。

### 2.2 创建API

```c
#include <event2/bufferevent.h>

/* 创建一对相互连接的bufferevent
 * @param base     event_base
 * @param options  选项标志
 * @param pair     输出数组，存储两个bufferevent
 * @return         0成功，-1失败
 */
int bufferevent_pair_new(struct event_base *base, int options,
                         struct bufferevent *pair[2]);

/* 获取pair的另一个端点 */
struct bufferevent *bufferevent_pair_get_partner(struct bufferevent *bev);
```

### 2.3 基本示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Received: %s", buf);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *pair[2];
    
    // 创建一对bufferevent
    if (bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair) < 0) {
        fprintf(stderr, "Failed to create pair\n");
        return 1;
    }
    
    // 设置回调
    bufferevent_setcb(pair[1], read_cb, NULL, NULL, NULL);
    bufferevent_enable(pair[1], EV_READ);
    
    // 从pair[0]写入，pair[1]读取
    const char *msg = "Hello from pair[0]!\n";
    bufferevent_write(pair[0], msg, strlen(msg));
    
    // 处理事件
    event_base_loop(base, EVLOOP_ONCE);
    
    // 获取伙伴
    struct bufferevent *partner = bufferevent_pair_get_partner(pair[0]);
    printf("Partner of pair[0] is pair[1]: %s\n", 
           partner == pair[1] ? "yes" : "no");
    
    // 释放（只需释放一个，另一个会自动关闭）
    bufferevent_free(pair[0]);
    bufferevent_free(pair[1]);
    
    event_base_free(base);
    return 0;
}
```

### 2.4 进程间通信示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

static void on_read_from_stdin(struct bufferevent *bev, void *arg) {
    struct bufferevent *partner = arg;
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        // 转发到伙伴
        bufferevent_write(partner, buf, n);
    }
}

static void on_read_from_partner(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        // 输出到stdout
        write(STDOUT_FILENO, "Echo: ", 6);
        write(STDOUT_FILENO, buf, n);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *pair[2];
    
    bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair);
    
    // 创建stdin的bufferevent
    struct bufferevent *stdin_bev = bufferevent_socket_new(
        base, STDIN_FILENO, 0);
    
    // stdin -> pair[0]
    bufferevent_setcb(stdin_bev, on_read_from_stdin, NULL, NULL, pair[0]);
    bufferevent_enable(stdin_bev, EV_READ);
    
    // pair[1] -> stdout
    bufferevent_setcb(pair[1], on_read_from_partner, NULL, NULL, NULL);
    bufferevent_enable(pair[1], EV_READ);
    
    printf("Type something and press Enter (Ctrl+D to exit):\n");
    
    event_base_dispatch(base);
    
    bufferevent_free(stdin_bev);
    bufferevent_free(pair[0]);
    bufferevent_free(pair[1]);
    event_base_free(base);
    
    return 0;
}
```

## 三、bufferevent_filter

### 3.1 概述

`bufferevent_filter` 是一种包装器，可以在底层bufferevent之上添加数据转换层。它允许在读写数据时进行自定义处理，如压缩、加密、编码转换等。

### 3.2 创建API

```c
#include <event2/bufferevent.h>

/* 过滤器回调函数类型 */
typedef enum bufferevent_filter_result (*bufferevent_filter_cb)(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx);

/* 创建过滤bufferevent
 * @param base          event_base
 * @param underlying    底层bufferevent
 * @param input_filter  输入过滤器（读取时调用）
 * @param output_filter 输出过滤器（写入时调用）
 * @param options       选项标志
 * @param free_ctx      释放上下文的函数
 * @param ctx           过滤器上下文
 */
struct bufferevent *bufferevent_filter_new(
    struct event_base *base,
    struct bufferevent *underlying,
    bufferevent_filter_cb input_filter,
    bufferevent_filter_cb output_filter,
    int options,
    void (*free_ctx)(void *), void *ctx);

/* 过滤器返回值 */
enum bufferevent_filter_result {
    BEV_OK = 0,      // 成功
    BEV_NEED_MORE,   // 需要更多数据
    BEV_ERROR        // 错误
};

/* 刷新模式 */
enum bufferevent_flush_mode {
    BEV_NORMAL = 0,  // 正常
    BEV_FLUSH,       // 刷新
    BEV_FINISHED     // 完成
};
```

### 3.3 大写转换过滤器示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <event2/event.h>
#include <event2/bufferevent.h>
#include <event2/buffer.h>

static enum bufferevent_filter_result uppercase_filter(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx) {
    
    char buf[1024];
    size_t n;
    
    while ((n = evbuffer_remove(src, buf, sizeof(buf))) > 0) {
        // 转换为大写
        for (size_t i = 0; i < n; i++) {
            buf[i] = toupper((unsigned char)buf[i]);
        }
        evbuffer_add(dst, buf, n);
    }
    
    return BEV_OK;
}

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Received (filtered): %s", buf);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *pair[2];
    
    bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair);
    
    // 在pair[1]上添加过滤器
    struct bufferevent *filtered = bufferevent_filter_new(
        base, pair[1],
        uppercase_filter,  // 输入过滤器
        NULL,              // 无输出过滤器
        BEV_OPT_CLOSE_ON_FREE,
        NULL, NULL);
    
    bufferevent_setcb(filtered, read_cb, NULL, NULL, NULL);
    bufferevent_enable(filtered, EV_READ);
    
    // 写入小写数据
    const char *msg = "hello, world!\n";
    printf("Sending: %s", msg);
    bufferevent_write(pair[0], msg, strlen(msg));
    
    event_base_loop(base, EVLOOP_ONCE);
    
    bufferevent_free(pair[0]);
    bufferevent_free(filtered);
    event_base_free(base);
    
    return 0;
}
```

### 3.4 Base64编码过滤器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/bufferevent.h>
#include <event2/buffer.h>

static const char base64_table[] = 
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static enum bufferevent_filter_result base64_encode_filter(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx) {
    
    unsigned char in[3];
    char out[4];
    size_t n;
    
    while ((n = evbuffer_remove(src, in, 3)) > 0) {
        // 编码
        out[0] = base64_table[in[0] >> 2];
        out[1] = base64_table[((in[0] & 0x03) << 4) | (in[1] >> 4)];
        
        if (n > 1) {
            out[2] = base64_table[((in[1] & 0x0f) << 2) | (in[2] >> 6)];
            out[3] = (n > 2) ? base64_table[in[2] & 0x3f] : '=';
        } else {
            out[2] = '=';
            out[3] = '=';
        }
        
        evbuffer_add(dst, out, 4);
    }
    
    if (mode == BEV_FLUSH || mode == BEV_FINISHED) {
        evbuffer_add(dst, "\n", 1);
    }
    
    return BEV_OK;
}

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("%s", buf);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *pair[2];
    
    bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair);
    
    struct bufferevent *filtered = bufferevent_filter_new(
        base, pair[1],
        base64_encode_filter,
        NULL,
        BEV_OPT_CLOSE_ON_FREE,
        NULL, NULL);
    
    bufferevent_setcb(filtered, read_cb, NULL, NULL, NULL);
    bufferevent_enable(filtered, EV_READ);
    
    const char *msg = "Hello, World!";
    printf("Original: %s\n", msg);
    printf("Base64: ");
    bufferevent_write(pair[0], msg, strlen(msg));
    
    event_base_loop(base, EVLOOP_ONCE);
    
    bufferevent_free(pair[0]);
    bufferevent_free(filtered);
    event_base_free(base);
    
    return 0;
}
```

### 3.5 行缓冲过滤器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/bufferevent.h>
#include <event2/buffer.h>

typedef struct {
    char *partial_line;
    size_t partial_len;
    size_t partial_cap;
} line_buffer_ctx_t;

static enum bufferevent_filter_result line_buffer_filter(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx) {
    
    line_buffer_ctx_t *lb = ctx;
    char buf[1024];
    size_t n;
    
    while ((n = evbuffer_remove(src, buf, sizeof(buf))) > 0) {
        for (size_t i = 0; i < n; i++) {
            if (buf[i] == '\n') {
                // 找到换行符，输出完整行
                if (lb->partial_len > 0) {
                    evbuffer_add(dst, lb->partial_line, lb->partial_len);
                    lb->partial_len = 0;
                }
                evbuffer_add(dst, "\n", 1);
            } else {
                // 累积字符
                if (lb->partial_len >= lb->partial_cap) {
                    lb->partial_cap = lb->partial_cap ? lb->partial_cap * 2 : 256;
                    lb->partial_line = realloc(lb->partial_line, lb->partial_cap);
                }
                lb->partial_line[lb->partial_len++] = buf[i];
            }
        }
    }
    
    // 刷新时输出剩余数据
    if (mode == BEV_FLUSH && lb->partial_len > 0) {
        evbuffer_add(dst, lb->partial_line, lb->partial_len);
        lb->partial_len = 0;
    }
    
    return BEV_OK;
}

static void free_line_buffer_ctx(void *ctx) {
    line_buffer_ctx_t *lb = ctx;
    free(lb->partial_line);
    free(lb);
}
```

## 四、链式过滤器

### 4.1 多层过滤

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <event2/event.h>
#include <event2/bufferevent.h>

static enum bufferevent_filter_result trim_filter(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx) {
    
    char buf[1024];
    size_t n;
    
    while ((n = evbuffer_remove(src, buf, sizeof(buf))) > 0) {
        size_t start = 0, end = n;
        
        // 去除前导空白
        while (start < n && isspace((unsigned char)buf[start])) start++;
        
        // 去除尾部空白
        while (end > start && isspace((unsigned char)buf[end - 1])) end--;
        
        if (start < end) {
            evbuffer_add(dst, buf + start, end - start);
        }
    }
    
    return BEV_OK;
}

static enum bufferevent_filter_result uppercase_filter(
    struct evbuffer *src, struct evbuffer *dst,
    ev_ssize_t dst_limit, enum bufferevent_flush_mode mode, void *ctx) {
    
    char buf[1024];
    size_t n;
    
    while ((n = evbuffer_remove(src, buf, sizeof(buf))) > 0) {
        for (size_t i = 0; i < n; i++) {
            buf[i] = toupper((unsigned char)buf[i]);
        }
        evbuffer_add(dst, buf, n);
    }
    
    return BEV_OK;
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *pair[2];
    
    bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair);
    
    // 第一层：去除空白
    struct bufferevent *filter1 = bufferevent_filter_new(
        base, pair[1],
        trim_filter,
        NULL,
        BEV_OPT_CLOSE_ON_FREE,
        NULL, NULL);
    
    // 第二层：转大写
    struct bufferevent *filter2 = bufferevent_filter_new(
        base, filter1,
        uppercase_filter,
        NULL,
        BEV_OPT_CLOSE_ON_FREE,
        NULL, NULL);
    
    char buf[1024];
    bufferevent_setcb(filter2, 
        [](struct bufferevent *bev, void *arg) {
            char b[1024];
            size_t n;
            while ((n = bufferevent_read(bev, b, sizeof(b) - 1)) > 0) {
                b[n] = '\0';
                printf("Result: '%s'\n", b);
            }
        }, NULL, NULL, NULL);
    bufferevent_enable(filter2, EV_READ);
    
    const char *msg = "  hello world  \n";
    printf("Original: '%s'\n", msg);
    bufferevent_write(pair[0], msg, strlen(msg));
    
    event_base_loop(base, EVLOOP_ONCE);
    
    bufferevent_free(pair[0]);
    bufferevent_free(filter2);
    event_base_free(base);
    
    return 0;
}
```

## 五、SSL过滤器

### 5.1 SSL作为过滤器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/bufferevent.h>
#include <event2/bufferevent_ssl.h>
#include <openssl/ssl.h>

int main() {
    SSL_library_init();
    SSL_load_error_strings();
    
    struct event_base *base = event_base_new();
    
    // 创建SSL上下文
    SSL_CTX *ssl_ctx = SSL_CTX_new(TLS_method());
    
    // 加载证书和私钥（服务器端）
    SSL_CTX_use_certificate_file(ssl_ctx, "server.crt", SSL_FILETYPE_PEM);
    SSL_CTX_use_PrivateKey_file(ssl_ctx, "server.key", SSL_FILETYPE_PEM);
    
    // 创建底层连接
    struct bufferevent *pair[2];
    bufferevent_pair_new(base, BEV_OPT_CLOSE_ON_FREE, pair);
    
    // 在pair[0]上创建SSL客户端
    SSL *ssl_client = SSL_new(ssl_ctx);
    SSL_set_connect_state(ssl_client);
    struct bufferevent *ssl_bev_client = bufferevent_openssl_filter_new(
        base, pair[0], ssl_client, BUFFEREVENT_SSL_CONNECTING,
        BEV_OPT_CLOSE_ON_FREE);
    
    // 在pair[1]上创建SSL服务器
    SSL *ssl_server = SSL_new(ssl_ctx);
    SSL_set_accept_state(ssl_server);
    struct bufferevent *ssl_bev_server = bufferevent_openssl_filter_new(
        base, pair[1], ssl_server, BUFFEREVENT_SSL_ACCEPTING,
        BEV_OPT_CLOSE_ON_FREE);
    
    // 设置回调
    bufferevent_setcb(ssl_bev_server, 
        [](struct bufferevent *bev, void *arg) {
            char buf[1024];
            size_t n;
            while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
                buf[n] = '\0';
                printf("Server received: %s\n", buf);
                bufferevent_write(bev, buf, n);  // 回显
            }
        }, NULL, NULL, NULL);
    bufferevent_enable(ssl_bev_server, EV_READ | EV_WRITE);
    
    // 客户端发送数据
    const char *msg = "Hello, SSL!";
    bufferevent_write(ssl_bev_client, msg, strlen(msg));
    
    event_base_loop(base, EVLOOP_NONBLOCK);
    
    bufferevent_free(ssl_bev_client);
    bufferevent_free(ssl_bev_server);
    SSL_CTX_free(ssl_ctx);
    event_base_free(base);
    
    return 0;
}
```

## 六、完整示例：代理服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>

static struct event_base *g_base = NULL;

typedef struct {
    struct bufferevent *client_bev;
    struct bufferevent *server_bev;
} proxy_conn_t;

static void client_read_cb(struct bufferevent *bev, void *arg);
static void server_read_cb(struct bufferevent *bev, void *arg);
static void event_cb(struct bufferevent *bev, short events, void *arg);

static void client_read_cb(struct bufferevent *bev, void *arg) {
    proxy_conn_t *conn = arg;
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        printf("Client -> Server: %zu bytes\n", n);
        bufferevent_write(conn->server_bev, buf, n);
    }
}

static void server_read_cb(struct bufferevent *bev, void *arg) {
    proxy_conn_t *conn = arg;
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf))) > 0) {
        printf("Server -> Client: %zu bytes\n", n);
        bufferevent_write(conn->client_bev, buf, n);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    proxy_conn_t *conn = arg;
    
    if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        printf("Connection closed\n");
        
        if (conn->client_bev) {
            bufferevent_free(conn->client_bev);
        }
        if (conn->server_bev) {
            bufferevent_free(conn->server_bev);
        }
        free(conn);
    } else if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to upstream server\n");
    }
}

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    printf("New client connection\n");
    
    proxy_conn_t *conn = calloc(1, sizeof(proxy_conn_t));
    
    // 客户端连接
    conn->client_bev = bufferevent_socket_new(g_base, fd, BEV_OPT_CLOSE_ON_FREE);
    bufferevent_setcb(conn->client_bev, client_read_cb, NULL, event_cb, conn);
    bufferevent_enable(conn->client_bev, EV_READ | EV_WRITE);
    
    // 连接上游服务器
    conn->server_bev = bufferevent_socket_new(g_base, -1, BEV_OPT_CLOSE_ON_FREE);
    bufferevent_setcb(conn->server_bev, server_read_cb, NULL, event_cb, conn);
    bufferevent_enable(conn->server_bev, EV_READ | EV_WRITE);
    
    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(80);  // 代理到HTTP服务器
    inet_pton(AF_INET, "127.0.0.1", &server_addr.sin_addr);
    
    bufferevent_socket_connect(conn->server_bev, 
                               (struct sockaddr *)&server_addr, 
                               sizeof(server_addr));
}

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nShutting down...\n");
    event_base_loopbreak(g_base);
}

int main() {
    g_base = event_base_new();
    
    struct event *sigint = evsignal_new(g_base, SIGINT, signal_cb, NULL);
    event_add(sigint, NULL);
    
    struct sockaddr_in listen_addr;
    memset(&listen_addr, 0, sizeof(listen_addr));
    listen_addr.sin_family = AF_INET;
    listen_addr.sin_port = htons(8080);
    listen_addr.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        g_base, accept_cb, NULL,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&listen_addr, sizeof(listen_addr));
    
    printf("Proxy server listening on port 8080\n");
    printf("Forwarding to 127.0.0.1:80\n");
    
    event_base_dispatch(g_base);
    
    evconnlistener_free(listener);
    event_free(sigint);
    event_base_free(g_base);
    
    return 0;
}
```

## 七、最佳实践

| 特性 | 用途 | 建议 |
|------|------|------|
| **pair** | 进程内通信、测试 | 适合单元测试和管道构建 |
| **filter** | 数据转换 | 保持过滤器简单高效 |
| **链式过滤** | 多层处理 | 注意性能开销 |
| **SSL过滤** | 安全通信 | 使用filter模式更灵活 |
| **代理** | 数据转发 | 合理管理连接生命周期 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
