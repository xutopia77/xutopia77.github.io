---
title: "\U0001F310 HTTP客户端 - libevent源码深度解析系列（二十一）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🌐 HTTP客户端

## 一、概述

libevent不仅支持HTTP服务器，还提供了完整的HTTP客户端功能。通过evhttp模块，可以方便地发送HTTP请求、处理响应，支持GET、POST等常见HTTP方法。

## 二、HTTP连接对象

### 2.1 创建连接

```c
/* 创建HTTP连接对象
 * @param base      event_base
 * @param dns_base  DNS解析器，NULL表示阻塞解析
 * @param address   服务器地址
 * @param port      服务器端口
 */
struct evhttp_connection *evhttp_connection_base_new(
    struct event_base *base, struct evdns_base *dns_base,
    const char *address, ev_uint16_t port);

/* 创建HTTP连接对象（带地址族） */
struct evhttp_connection *evhttp_connection_base_bufferevent_new(
    struct event_base *base, struct evdns_base *dns_base,
    struct bufferevent *bev, const char *address, ev_uint16_t port);

/* 释放HTTP连接 */
void evhttp_connection_free(struct evhttp_connection *evcon);

/* 设置连接超时 */
void evhttp_connection_set_timeout(struct evhttp_connection *evcon, int timeout);
void evhttp_connection_set_timeout_tv(struct evhttp_connection *evcon,
    const struct timeval *tv);

/* 设置重试次数 */
void evhttp_connection_set_retries(struct evhttp_connection *evcon, int retry_max);

/* 设置最大连接数 */
void evhttp_connection_set_max_body_size(struct evhttp_connection *evcon,
    ev_ssize_t max_body_size);
```

### 2.2 连接示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    // 创建HTTP连接
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "www.example.com", 80);
    
    if (!conn) {
        fprintf(stderr, "Failed to create connection\n");
        return 1;
    }
    
    // 设置超时
    evhttp_connection_set_timeout(conn, 10);
    
    printf("HTTP connection created\n");
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 三、HTTP请求对象

### 3.1 创建请求

```c
/* 创建HTTP请求对象 */
struct evhttp_request *evhttp_request_new(
    void (*cb)(struct evhttp_request *, void *), void *arg);

/* 释放请求对象 */
void evhttp_request_free(struct evhttp_request *req);

/* 获取请求的输出缓冲区 */
struct evbuffer *evhttp_request_get_output_buffer(struct evhttp_request *req);

/* 获取请求的输入缓冲区 */
struct evbuffer *evhttp_request_get_input_buffer(struct evhttp_request *req);

/* 获取请求的输出头 */
struct evkeyvalq *evhttp_request_get_output_headers(struct evhttp_request *req);

/* 获取请求的输入头 */
struct evkeyvalq *evhttp_request_get_input_headers(struct evhttp_request *req);

/* 获取响应码 */
int evhttp_request_get_response_code(struct evhttp_request *req);
const char *evhttp_request_get_response_code_line(struct evhttp_request *req);

/* 获取请求的连接 */
struct evhttp_connection *evhttp_request_get_connection(struct evhttp_request *req);

/* 获取请求的host */
const char *evhttp_request_get_host(struct evhttp_request *req);

/* 获取请求的URI */
enum evhttp_cmd_type evhttp_request_get_command(struct evhttp_request *req);
const char *evhttp_request_get_uri(struct evhttp_request *req);

/* 取消请求 */
void evhttp_cancel_request(struct evhttp_request *req);
```

### 3.2 请求方法

```c
enum evhttp_cmd_type {
    EVHTTP_REQ_GET     = 1 << 0,
    EVHTTP_REQ_POST    = 1 << 1,
    EVHTTP_REQ_HEAD    = 1 << 2,
    EVHTTP_REQ_PUT     = 1 << 3,
    EVHTTP_REQ_DELETE  = 1 << 4,
    EVHTTP_REQ_OPTIONS = 1 << 5,
    EVHTTP_REQ_TRACE   = 1 << 6,
    EVHTTP_REQ_CONNECT = 1 << 7,
    EVHTTP_REQ_PATCH   = 1 << 8
};
```

## 四、发送HTTP请求

### 4.1 发送请求API

```c
/* 发送HTTP请求
 * @param evcon  HTTP连接
 * @param req    HTTP请求对象
 * @param type   请求方法
 * @param uri    请求URI
 * @return       0成功，-1失败
 */
int evhttp_make_request(struct evhttp_connection *evcon,
    struct evhttp_request *req, enum evhttp_cmd_type type, const char *uri);
```

### 4.2 GET请求示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

static void http_request_done(struct evhttp_request *req, void *arg) {
    if (!req) {
        printf("Request failed\n");
        event_base_loopbreak((struct event_base *)arg);
        return;
    }
    
    int response_code = evhttp_request_get_response_code(req);
    printf("Response code: %d\n", response_code);
    
    // 获取响应头
    struct evkeyvalq *headers = evhttp_request_get_input_headers(req);
    const char *content_type = evhttp_find_header(headers, "Content-Type");
    printf("Content-Type: %s\n", content_type ? content_type : "unknown");
    
    // 获取响应体
    struct evbuffer *buf = evhttp_request_get_input_buffer(req);
    size_t len = evbuffer_get_length(buf);
    printf("Response length: %zu bytes\n", len);
    
    // 打印响应内容
    char *data = malloc(len + 1);
    evbuffer_copyout(buf, data, len);
    data[len] = '\0';
    printf("Response body:\n%s\n", data);
    free(data);
    
    event_base_loopbreak((struct event_base *)arg);
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    // 创建连接
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "httpbin.org", 80);
    evhttp_connection_set_timeout(conn, 10);
    
    // 创建请求
    struct evhttp_request *req = evhttp_request_new(http_request_done, base);
    
    // 添加请求头
    struct evkeyvalq *output_headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(output_headers, "Host", "httpbin.org");
    evhttp_add_header(output_headers, "User-Agent", "libevent-client/1.0");
    evhttp_add_header(output_headers, "Accept", "*/*");
    
    // 发送GET请求
    printf("Sending GET request to httpbin.org/get\n");
    evhttp_make_request(conn, req, EVHTTP_REQ_GET, "/get");
    
    event_base_dispatch(base);
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 五、POST请求

### 5.1 POST请求示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

static void http_request_done(struct evhttp_request *req, void *arg) {
    if (!req) {
        printf("Request failed\n");
        event_base_loopbreak((struct event_base *)arg);
        return;
    }
    
    printf("Response code: %d\n", evhttp_request_get_response_code(req));
    
    struct evbuffer *buf = evhttp_request_get_input_buffer(req);
    size_t len = evbuffer_get_length(buf);
    
    char *data = malloc(len + 1);
    evbuffer_copyout(buf, data, len);
    data[len] = '\0';
    printf("Response:\n%s\n", data);
    free(data);
    
    event_base_loopbreak((struct event_base *)arg);
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "httpbin.org", 80);
    evhttp_connection_set_timeout(conn, 10);
    
    struct evhttp_request *req = evhttp_request_new(http_request_done, base);
    
    // 设置请求头
    struct evkeyvalq *output_headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(output_headers, "Host", "httpbin.org");
    evhttp_add_header(output_headers, "Content-Type", "application/x-www-form-urlencoded");
    evhttp_add_header(output_headers, "User-Agent", "libevent-client/1.0");
    
    // 设置POST数据
    struct evbuffer *output_buffer = evhttp_request_get_output_buffer(req);
    const char *post_data = "name=John&age=30&city=Beijing";
    evbuffer_add(output_buffer, post_data, strlen(post_data));
    
    printf("Sending POST request to httpbin.org/post\n");
    printf("Post data: %s\n", post_data);
    
    evhttp_make_request(conn, req, EVHTTP_REQ_POST, "/post");
    
    event_base_dispatch(base);
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

### 5.2 JSON POST请求

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

static void json_post_done(struct evhttp_request *req, void *arg) {
    if (!req) {
        printf("Request failed\n");
        event_base_loopbreak((struct event_base *)arg);
        return;
    }
    
    printf("Response code: %d\n", evhttp_request_get_response_code(req));
    
    struct evbuffer *buf = evhttp_request_get_input_buffer(req);
    size_t len = evbuffer_get_length(buf);
    
    char *data = malloc(len + 1);
    evbuffer_copyout(buf, data, len);
    data[len] = '\0';
    printf("Response:\n%s\n", data);
    free(data);
    
    event_base_loopbreak((struct event_base *)arg);
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "httpbin.org", 80);
    evhttp_connection_set_timeout(conn, 10);
    
    struct evhttp_request *req = evhttp_request_new(json_post_done, base);
    
    struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(headers, "Host", "httpbin.org");
    evhttp_add_header(headers, "Content-Type", "application/json");
    evhttp_add_header(headers, "Accept", "application/json");
    
    // JSON数据
    const char *json_data = "{\"username\":\"test\",\"password\":\"123456\"}";
    struct evbuffer *output = evhttp_request_get_output_buffer(req);
    evbuffer_add(output, json_data, strlen(json_data));
    
    printf("Sending JSON POST request\n");
    printf("JSON data: %s\n", json_data);
    
    evhttp_make_request(conn, req, EVHTTP_REQ_POST, "/post");
    
    event_base_dispatch(base);
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 六、HTTP头部操作

### 6.1 头部API

```c
/* 添加头部 */
int evhttp_add_header(struct evkeyvalq *headers, const char *key, const char *value);

/* 查找头部 */
const char *evhttp_find_header(const struct evkeyvalq *headers, const char *key);

/* 删除头部 */
int evhttp_remove_header(struct evkeyvalq *headers, const char *key);

/* 清除所有头部 */
void evhttp_clear_headers(struct evkeyvalq *headers);
```

### 6.2 常用请求头

| 头部 | 说明 |
|------|------|
| `Host` | 目标主机名 |
| `User-Agent` | 客户端标识 |
| `Accept` | 接受的内容类型 |
| `Content-Type` | 请求体类型 |
| `Content-Length` | 请求体长度 |
| `Authorization` | 认证信息 |
| `Cookie` | Cookie数据 |
| `Connection` | 连接控制 |

## 七、HTTPS支持

### 7.1 HTTPS连接

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>
#include <openssl/ssl.h>

static void https_request_done(struct evhttp_request *req, void *arg) {
    if (!req) {
        printf("Request failed\n");
        event_base_loopbreak((struct event_base *)arg);
        return;
    }
    
    printf("Response code: %d\n", evhttp_request_get_response_code(req));
    
    struct evbuffer *buf = evhttp_request_get_input_buffer(req);
    size_t len = evbuffer_get_length(buf);
    
    char *data = malloc(len + 1);
    evbuffer_copyout(buf, data, len);
    data[len] = '\0';
    printf("Response:\n%s\n", data);
    free(data);
    
    event_base_loopbreak((struct event_base *)arg);
}

int main() {
    // 初始化OpenSSL
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
    
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    // 创建SSL上下文
    SSL_CTX *ssl_ctx = SSL_CTX_new(SSLv23_client_method());
    
    // 创建bufferevent
    struct bufferevent *bev = bufferevent_openssl_socket_new(
        base, -1, SSL_new(ssl_ctx), BUFFEREVENT_SSL_CONNECTING, 
        BEV_OPT_CLOSE_ON_FREE | BEV_OPT_DEFER_CALLBACKS);
    
    // 创建HTTPS连接
    struct evhttp_connection *conn = evhttp_connection_base_bufferevent_new(
        base, dns_base, bev, "www.google.com", 443);
    
    struct evhttp_request *req = evhttp_request_new(https_request_done, base);
    
    struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(headers, "Host", "www.google.com");
    evhttp_add_header(headers, "User-Agent", "libevent-https-client/1.0");
    
    printf("Sending HTTPS request to www.google.com/\n");
    evhttp_make_request(conn, req, EVHTTP_REQ_GET, "/");
    
    event_base_dispatch(base);
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    SSL_CTX_free(ssl_ctx);
    
    return 0;
}
```

## 八、错误处理

### 8.1 错误回调

```c
/* 设置连接错误回调 */
typedef void (*evhttp_conn_error_cb)(enum evhttp_request_error, void *);
void evhttp_connection_set_closecb(struct evhttp_connection *evcon,
    void (*cb)(struct evhttp_connection *, void *), void *cbarg);

/* 错误类型 */
enum evhttp_request_error {
    EVREQ_HTTP_TIMEOUT,         // 超时
    EVREQ_HTTP_EOF,             // 连接关闭
    EVREQ_HTTP_INVALID_HEADER,  // 无效头部
    EVREQ_HTTP_BUFFER_ERROR,    // 缓冲区错误
    EVREQ_HTTP_REQUEST_CANCEL,  // 请求取消
    EVREQ_HTTP_DATA_TOO_LONG    // 数据过长
};
```

### 8.2 错误处理示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>
#include <event2/http.h>

static void connection_close_cb(struct evhttp_connection *conn, void *arg) {
    printf("Connection closed\n");
}

static void http_request_done(struct evhttp_request *req, void *arg) {
    if (!req) {
        // 获取错误类型
        enum evhttp_request_error err = EVREQ_HTTP_TIMEOUT;
        printf("Request error: %d\n", err);
        event_base_loopbreak((struct event_base *)arg);
        return;
    }
    
    int code = evhttp_request_get_response_code(req);
    if (code == 0) {
        printf("Connection failed\n");
    } else if (code >= 400) {
        printf("HTTP error: %d\n", code);
    } else {
        printf("Success: %d\n", code);
    }
    
    event_base_loopbreak((struct event_base *)arg);
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "example.invalid", 80);  // 无效域名
    
    // 设置关闭回调
    evhttp_connection_set_closecb(conn, connection_close_cb, NULL);
    
    // 设置较短超时
    evhttp_connection_set_timeout(conn, 3);
    
    struct evhttp_request *req = evhttp_request_new(http_request_done, base);
    
    evhttp_make_request(conn, req, EVHTTP_REQ_GET, "/");
    
    event_base_dispatch(base);
    
    evhttp_connection_free(conn);
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 九、连接池与重用

### 9.1 连接重用

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

static int request_count = 0;
static const int MAX_REQUESTS = 3;

static void send_next_request(struct evhttp_connection *conn, 
                               struct event_base *base);

static void http_request_done(struct evhttp_request *req, void *arg) {
    struct evhttp_connection *conn = evhttp_request_get_connection(req);
    struct event_base *base = arg;
    
    if (req) {
        printf("Request %d: Response code %d\n", 
               request_count, evhttp_request_get_response_code(req));
    } else {
        printf("Request %d failed\n", request_count);
    }
    
    request_count++;
    
    if (request_count < MAX_REQUESTS) {
        send_next_request(conn, base);
    } else {
        evhttp_connection_free(conn);
        event_base_loopbreak(base);
    }
}

static void send_next_request(struct evhttp_connection *conn, 
                               struct event_base *base) {
    char uri[64];
    snprintf(uri, sizeof(uri), "/get?id=%d", request_count);
    
    struct evhttp_request *req = evhttp_request_new(http_request_done, base);
    
    struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(headers, "Host", "httpbin.org");
    
    printf("Sending request %d to %s\n", request_count, uri);
    evhttp_make_request(conn, req, EVHTTP_REQ_GET, uri);
}

int main() {
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    // 创建一个连接，重用发送多个请求
    struct evhttp_connection *conn = evhttp_connection_base_new(
        base, dns_base, "httpbin.org", 80);
    evhttp_connection_set_timeout(conn, 10);
    
    send_next_request(conn, base);
    
    event_base_dispatch(base);
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 十、完整示例：HTTP下载器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

typedef struct {
    struct event_base *base;
    struct evhttp_connection *conn;
    FILE *output_file;
    const char *url;
    const char *host;
    int port;
    const char *path;
    size_t total_bytes;
} download_context_t;

static void download_chunk_cb(struct evhttp_request *req, void *arg);

static void download_complete(struct evhttp_request *req, void *arg) {
    download_context_t *ctx = arg;
    
    if (!req) {
        printf("Download failed\n");
    } else {
        int code = evhttp_request_get_response_code(req);
        printf("\nDownload complete: HTTP %d, %zu bytes\n", 
               code, ctx->total_bytes);
    }
    
    if (ctx->output_file) {
        fclose(ctx->output_file);
    }
    
    evhttp_connection_free(ctx->conn);
    event_base_loopbreak(ctx->base);
}

static void download_chunk_cb(struct evhttp_request *req, void *arg) {
    download_context_t *ctx = arg;
    
    if (!req) return;
    
    struct evbuffer *buf = evhttp_request_get_input_buffer(req);
    size_t len = evbuffer_get_length(buf);
    
    if (len > 0 && ctx->output_file) {
        char *data = malloc(len);
        evbuffer_remove(buf, data, len);
        fwrite(data, 1, len, ctx->output_file);
        free(data);
        
        ctx->total_bytes += len;
        printf("\rDownloaded: %zu bytes", ctx->total_bytes);
        fflush(stdout);
    }
    
    // 检查是否完成
    if (evbuffer_get_length(buf) == 0) {
        download_complete(req, arg);
    }
}

static void start_download(download_context_t *ctx) {
    struct evhttp_request *req = evhttp_request_new(download_chunk_cb, ctx);
    
    struct evkeyvalq *headers = evhttp_request_get_output_headers(req);
    evhttp_add_header(headers, "Host", ctx->host);
    evhttp_add_header(headers, "User-Agent", "libevent-downloader/1.0");
    evhttp_add_header(headers, "Connection", "close");
    
    printf("Downloading from %s:%d%s\n", ctx->host, ctx->port, ctx->path);
    
    evhttp_make_request(ctx->conn, req, EVHTTP_REQ_GET, ctx->path);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage: %s <url> [output_file]\n", argv[0]);
        printf("Example: %s http://example.com/file.zip output.zip\n", argv[0]);
        return 1;
    }
    
    const char *url = argv[1];
    const char *output_filename = argc > 2 ? argv[2] : "download.bin";
    
    // 解析URL（简化版）
    char host[256] = {0};
    char path[1024] = {0};
    int port = 80;
    
    const char *host_start = strstr(url, "://");
    if (host_start) {
        host_start += 3;
    } else {
        host_start = url;
    }
    
    const char *path_start = strchr(host_start, '/');
    if (path_start) {
        strncpy(host, host_start, path_start - host_start);
        strcpy(path, path_start);
    } else {
        strcpy(host, host_start);
        strcpy(path, "/");
    }
    
    char *port_str = strchr(host, ':');
    if (port_str) {
        *port_str = '\0';
        port = atoi(port_str + 1);
    }
    
    printf("Host: %s, Port: %d, Path: %s\n", host, port, path);
    
    struct event_base *base = event_base_new();
    struct evdns_base *dns_base = evdns_base_new(base, 1);
    
    download_context_t ctx = {
        .base = base,
        .host = host,
        .port = port,
        .path = path,
        .total_bytes = 0
    };
    
    ctx.output_file = fopen(output_filename, "wb");
    if (!ctx.output_file) {
        printf("Failed to open output file: %s\n", output_filename);
        return 1;
    }
    
    ctx.conn = evhttp_connection_base_new(base, dns_base, host, port);
    evhttp_connection_set_timeout(ctx.conn, 30);
    
    start_download(&ctx);
    
    event_base_dispatch(base);
    
    evdns_base_free(dns_base, 0);
    event_base_free(base);
    
    return 0;
}
```

## 十一、最佳实践

| 场景 | 建议 |
|------|------|
| **连接重用** | 同一服务器的多个请求重用连接 |
| **超时设置** | 根据网络环境设置合理的超时时间 |
| **错误重试** | 对于临时错误实现重试机制 |
| **大文件下载** | 使用chunk回调逐步处理，避免内存溢出 |
| **HTTPS** | 生产环境优先使用HTTPS |
| **User-Agent** | 设置合理的User-Agent避免被拦截 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
