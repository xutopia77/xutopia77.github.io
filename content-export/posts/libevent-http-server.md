---
title: "\U0001F30D HTTP服务器 - libevent源码深度解析系列（十一）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🌍 HTTP服务器

## 一、概述

libevent提供了HTTP支持，可以方便地构建HTTP服务器和客户端。HTTP模块封装了HTTP协议的解析和响应处理，开发者只需要关注业务逻辑。

## 二、创建HTTP服务器

### 2.1 基本API

```c
/* 创建HTTP服务器 */
struct evhttp *evhttp_new(struct event_base *base);

/* 绑定地址和端口 */
int evhttp_bind_socket(struct evhttp *http, const char *address, ev_uint16_t port);

/* 绑定socket */
int evhttp_bind_socket_with_handle(struct evhttp *http, evutil_socket_t fd);

/* 释放HTTP服务器 */
void evhttp_free(struct evhttp *http);
```

### 2.2 请求处理

```c
/* 设置请求处理回调 */
void evhttp_set_gencb(struct evhttp *http,
    void (*cb)(struct evhttp_request *, void *), void *cbarg);

/* 设置特定路径的处理回调 */
int evhttp_set_cb(struct evhttp *http, const char *path,
    void (*cb)(struct evhttp_request *, void *), void *cbarg);

/* 移除路径处理回调 */
int evhttp_del_cb(struct evhttp *http, const char *path);
```

## 三、请求对象

### 3.1 获取请求信息

```c
/* 获取请求方法 */
enum evhttp_cmd_type evhttp_request_get_command(struct evhttp_request *req);

/* 获取请求URI */
const char *evhttp_request_get_uri(struct evhttp_request *req);

/* 获取请求头 */
const char *evhttp_find_header(const struct evkeyvalq *headers, const char *key);
struct evkeyvalq *evhttp_request_get_input_headers(struct evhttp_request *req);

/* 获取请求体 */
struct evbuffer *evhttp_request_get_input_buffer(struct evhttp_request *req);

/* 获取客户端地址 */
void evhttp_request_get_peer(struct evhttp_request *req, char **address, ev_uint16_t *port);
```

### 3.2 请求方法类型

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

## 四、响应对象

### 4.1 设置响应

```c
/* 创建响应buffer */
struct evbuffer *evbuffer_new(void);
void evbuffer_free(struct evbuffer *buf);

/* 添加响应内容 */
int evbuffer_add(struct evbuffer *buf, const void *data, size_t datlen);
int evbuffer_add_printf(struct evbuffer *buf, const char *fmt, ...);
int evbuffer_add_buffer(struct evbuffer *dst, struct evbuffer *src);

/* 设置响应头 */
int evhttp_add_header(struct evkeyvalq *headers, const char *key, const char *value);
struct evkeyvalq *evhttp_request_get_output_headers(struct evhttp_request *req);

/* 设置响应状态码 */
void evhttp_send_reply(struct evhttp_request *req, int code, const char *reason, struct evbuffer *buf);
void evhttp_send_reply_start(struct evhttp_request *req, int code, const char *reason);
void evhttp_send_reply_chunk(struct evhttp_request *req, struct evbuffer *buf);
void evhttp_send_reply_end(struct evhttp_request *req);

/* 发送错误响应 */
void evhttp_send_error(struct evhttp_request *req, int error, const char *reason);
```

### 4.3 HTTP状态码

| 状态码 | 说明 |
|--------|------|
| HTTP_OK | 200 成功 |
| HTTP_NOCONTENT | 204 无内容 |
| HTTP_MOVEPERM | 301 永久移动 |
| HTTP_MOVETEMP | 302 临时移动 |
| HTTP_NOTMODIFIED | 304 未修改 |
| HTTP_BADREQUEST | 400 错误请求 |
| HTTP_NOTFOUND | 404 未找到 |
| HTTP_BADMETHOD | 405 方法不允许 |
| HTTP_INTERNAL | 500 服务器错误 |
| HTTP_SERVUNAVAIL | 503 服务不可用 |

## 五、完整示例

### 5.1 基本HTTP服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>
#include <event2/http_struct.h>

static void generic_cb(struct evhttp_request *req, void *arg) {
    struct evbuffer *buf = evbuffer_new();
    if (!buf) {
        evhttp_send_error(req, HTTP_INTERNAL, "Failed to create buffer");
        return;
    }
    
    evbuffer_add_printf(buf, "<html><body>");
    evbuffer_add_printf(buf, "<h1>Hello, libevent HTTP Server!</h1>");
    evbuffer_add_printf(buf, "<p>Request URI: %s</p>", evhttp_request_get_uri(req));
    evbuffer_add_printf(buf, "</body></html>");
    
    evhttp_add_header(evhttp_request_get_output_headers(req), "Content-Type", "text/html");
    evhttp_send_reply(req, HTTP_OK, "OK", buf);
    
    evbuffer_free(buf);
}

static void api_cb(struct evhttp_request *req, void *arg) {
    struct evbuffer *buf = evbuffer_new();
    
    const char *uri = evhttp_request_get_uri(req);
    struct evkeyvalq params;
    evhttp_parse_query(uri, &params);
    
    const char *name = evhttp_find_header(&params, "name");
    const char *age = evhttp_find_header(&params, "age");
    
    evbuffer_add_printf(buf, "{\n");
    evbuffer_add_printf(buf, "  \"status\": \"success\",\n");
    evbuffer_add_printf(buf, "  \"name\": \"%s\",\n", name ? name : "unknown");
    evbuffer_add_printf(buf, "  \"age\": %s\n", age ? age : "0");
    evbuffer_add_printf(buf, "}\n");
    
    evhttp_add_header(evhttp_request_get_output_headers(req), "Content-Type", "application/json");
    evhttp_send_reply(req, HTTP_OK, "OK", buf);
    
    evhttp_clear_headers(&params);
    evbuffer_free(buf);
}

static void post_cb(struct evhttp_request *req, void *arg) {
    if (evhttp_request_get_command(req) != EVHTTP_REQ_POST) {
        evhttp_send_error(req, HTTP_BADMETHOD, "Method not allowed");
        return;
    }
    
    struct evbuffer *input = evhttp_request_get_input_buffer(req);
    struct evbuffer *output = evbuffer_new();
    
    size_t len = evbuffer_get_length(input);
    char *data = malloc(len + 1);
    evbuffer_copyout(input, data, len);
    data[len] = '\0';
    
    printf("Received POST data: %s\n", data);
    
    evbuffer_add_printf(output, "{\n");
    evbuffer_add_printf(output, "  \"received\": true,\n");
    evbuffer_add_printf(output, "  \"length\": %zu,\n", len);
    evbuffer_add_printf(output, "  \"data\": \"%s\"\n", data);
    evbuffer_add_printf(output, "}\n");
    
    evhttp_add_header(evhttp_request_get_output_headers(req), "Content-Type", "application/json");
    evhttp_send_reply(req, HTTP_OK, "OK", output);
    
    free(data);
    evbuffer_free(output);
}

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Caught signal, exiting...\n");
    event_base_loopbreak(base);
}

int main(int argc, char **argv) {
    struct event_base *base = event_base_new();
    struct evhttp *http = evhttp_new(base);
    
    if (!http) {
        fprintf(stderr, "Failed to create HTTP server\n");
        return 1;
    }
    
    if (evhttp_bind_socket(http, "0.0.0.0", 8080) != 0) {
        fprintf(stderr, "Failed to bind to port 8080\n");
        evhttp_free(http);
        return 1;
    }
    
    // 设置路由
    evhttp_set_cb(http, "/api", api_cb, NULL);
    evhttp_set_cb(http, "/post", post_cb, NULL);
    evhttp_set_gencb(http, generic_cb, NULL);
    
    // 信号处理
    struct event *sigint = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(sigint, NULL);
    
    printf("HTTP server running on http://0.0.0.0:8080\n");
    printf("Routes:\n");
    printf("  GET  /           - Hello page\n");
    printf("  GET  /api?name=xxx&age=xxx - API endpoint\n");
    printf("  POST /post       - POST handler\n");
    
    event_base_dispatch(base);
    
    event_free(sigint);
    evhttp_free(http);
    event_base_free(base);
    
    printf("Server shutdown complete\n");
    return 0;
}
```

### 5.2 静态文件服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <sys/stat.h>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

#define WWW_ROOT "./www"

static const char *get_content_type(const char *path) {
    const char *ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";
    
    if (strcmp(ext, ".html") == 0 || strcmp(ext, ".htm") == 0) return "text/html";
    if (strcmp(ext, ".css") == 0) return "text/css";
    if (strcmp(ext, ".js") == 0) return "application/javascript";
    if (strcmp(ext, ".json") == 0) return "application/json";
    if (strcmp(ext, ".png") == 0) return "image/png";
    if (strcmp(ext, ".jpg") == 0 || strcmp(ext, ".jpeg") == 0) return "image/jpeg";
    if (strcmp(ext, ".gif") == 0) return "image/gif";
    if (strcmp(ext, ".txt") == 0) return "text/plain";
    
    return "application/octet-stream";
}

static void file_cb(struct evhttp_request *req, void *arg) {
    const char *uri = evhttp_request_get_uri(req);
    
    char path[1024];
    snprintf(path, sizeof(path), "%s%s", WWW_ROOT, uri);
    
    // 处理目录请求
    struct stat st;
    if (stat(path, &st) == 0 && S_ISDIR(st.st_mode)) {
        strcat(path, "/index.html");
    }
    
    FILE *fp = fopen(path, "rb");
    if (!fp) {
        evhttp_send_error(req, HTTP_NOTFOUND, "File not found");
        return;
    }
    
    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    
    struct evbuffer *buf = evbuffer_new();
    evbuffer_add_file(buf, fileno(fp), 0, size);
    
    evhttp_add_header(evhttp_request_get_output_headers(req), 
                      "Content-Type", get_content_type(path));
    evhttp_send_reply(req, HTTP_OK, "OK", buf);
    
    evbuffer_free(buf);
}

int main() {
    struct event_base *base = event_base_new();
    struct evhttp *http = evhttp_new(base);
    
    evhttp_bind_socket(http, "0.0.0.0", 8080);
    evhttp_set_gencb(http, file_cb, NULL);
    
    printf("Static file server running on http://0.0.0.0:8080\n");
    printf("Serving files from %s\n", WWW_ROOT);
    
    event_base_dispatch(base);
    
    evhttp_free(http);
    event_base_free(base);
    
    return 0;
}
```

## 六、编译运行

```bash
# 编译
gcc -o http_server http_server.c -levent

# 运行
./http_server

# 测试
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/api?name=test&age=20
curl -X POST -d "hello" http://127.0.0.1:8080/post
```

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
