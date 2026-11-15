---
title: "\U0001F510 SSL/TLS加密通信 - libevent源码深度解析系列（二十二）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔐 SSL/TLS加密通信

## 一、概述

libevent通过OpenSSL库提供SSL/TLS加密通信支持。通过bufferevent_openssl模块，可以轻松地为网络连接添加安全层，实现数据加密传输。

## 二、SSL/TLS基础

### 2.1 SSL/TLS协议版本

| 版本 | 说明 | 安全性 |
|------|------|--------|
| SSLv2 | 已废弃 | 不安全 |
| SSLv3 | 已废弃 | POODLE攻击 |
| TLSv1.0 | 已弃用 | BEAST攻击 |
| TLSv1.1 | 已弃用 | 较弱 |
| TLSv1.2 | 推荐 | 安全 |
| TLSv1.3 | 最新 | 最安全 |

### 2.2 常用加密套件

```
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
TLS_AES_128_GCM_SHA256 (TLS 1.3)
TLS_AES_256_GCM_SHA384 (TLS 1.3)
```

## 三、OpenSSL初始化

### 3.1 初始化API

```c
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/rand.h>

/* 初始化OpenSSL库 */
void SSL_library_init(void);

/* 加载错误字符串 */
void SSL_load_error_strings(void);

/* 加载算法 */
void OpenSSL_add_all_algorithms(void);

/* 清理资源 */
void EVP_cleanup(void);
void ERR_free_strings(void);
```

### 3.2 初始化示例

```c
#include <stdio.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

void init_openssl(void) {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
    
    printf("OpenSSL initialized, version: %s\n", 
           SSLeay_version(SSLEAY_VERSION));
}

void cleanup_openssl(void) {
    EVP_cleanup();
    ERR_free_strings();
}

int main() {
    init_openssl();
    
    printf("SSL/TLS support ready\n");
    
    cleanup_openssl();
    return 0;
}
```

## 四、SSL上下文

### 4.1 创建SSL_CTX

```c
/* 创建SSL上下文 */
SSL_CTX *SSL_CTX_new(const SSL_METHOD *method);

/* 释放SSL上下文 */
void SSL_CTX_free(SSL_CTX *ctx);

/* 获取TLS方法 */
const SSL_METHOD *TLS_server_method(void);    // 服务器端
const SSL_METHOD *TLS_client_method(void);    // 客户端
const SSL_METHOD *TLS_method(void);           // 通用（推荐）

/* 设置协议版本 */
int SSL_CTX_set_min_proto_version(SSL_CTX *ctx, int version);
int SSL_CTX_set_max_proto_version(SSL_CTX *ctx, int version);

/* 协议版本常量 */
#define TLS1_VERSION       0x0301
#define TLS1_1_VERSION     0x0302
#define TLS1_2_VERSION     0x0303
#define TLS1_3_VERSION     0x0304
```

### 4.2 配置SSL_CTX

```c
/* 设置证书 */
int SSL_CTX_use_certificate_file(SSL_CTX *ctx, const char *file, int type);
int SSL_CTX_use_certificate_chain_file(SSL_CTX *ctx, const char *file);

/* 设置私钥 */
int SSL_CTX_use_PrivateKey_file(SSL_CTX *ctx, const char *file, int type);
int SSL_CTX_check_private_key(SSL_CTX *ctx);

/* 设置CA证书 */
int SSL_CTX_load_verify_locations(SSL_CTX *ctx, const char *CAfile, 
                                   const char *CApath);

/* 设置验证模式 */
void SSL_CTX_set_verify(SSL_CTX *ctx, int mode, 
                        int (*verify_callback)(int, X509_STORE_CTX *));

/* 验证模式 */
#define SSL_VERIFY_NONE                 0x00
#define SSL_VERIFY_PEER                 0x01
#define SSL_VERIFY_FAIL_IF_NO_PEER_CERT 0x02
#define SSL_VERIFY_CLIENT_ONCE          0x04

/* 设置验证深度 */
void SSL_CTX_set_verify_depth(SSL_CTX *ctx, int depth);

/* 设置密码套件 */
int SSL_CTX_set_cipher_list(SSL_CTX *ctx, const char *str);
int SSL_CTX_set_ciphersuites(SSL_CTX *ctx, const char *str);
```

### 4.3 SSL_CTX示例

```c
#include <stdio.h>
#include <openssl/ssl.h>

SSL_CTX *create_server_context(void) {
    SSL_CTX *ctx = SSL_CTX_new(TLS_server_method());
    if (!ctx) {
        perror("SSL_CTX_new");
        return NULL;
    }
    
    // 设置最低TLS版本为1.2
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    
    // 加载证书
    if (SSL_CTX_use_certificate_file(ctx, "server.crt", SSL_FILETYPE_PEM) != 1) {
        fprintf(stderr, "Failed to load certificate\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 加载私钥
    if (SSL_CTX_use_PrivateKey_file(ctx, "server.key", SSL_FILETYPE_PEM) != 1) {
        fprintf(stderr, "Failed to load private key\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 验证私钥
    if (SSL_CTX_check_private_key(ctx) != 1) {
        fprintf(stderr, "Private key check failed\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 设置密码套件
    SSL_CTX_set_cipher_list(ctx, 
        "ECDHE-ECDSA-AES128-GCM-SHA256:"
        "ECDHE-RSA-AES128-GCM-SHA256:"
        "ECDHE-ECDSA-AES256-GCM-SHA384:"
        "ECDHE-RSA-AES256-GCM-SHA384");
    
    printf("Server SSL context created\n");
    return ctx;
}

SSL_CTX *create_client_context(void) {
    SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
    if (!ctx) {
        perror("SSL_CTX_new");
        return NULL;
    }
    
    // 设置最低TLS版本
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    
    // 设置验证模式
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL);
    
    // 加载CA证书
    if (SSL_CTX_load_verify_locations(ctx, "ca.crt", NULL) != 1) {
        fprintf(stderr, "Failed to load CA certificate\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    printf("Client SSL context created\n");
    return ctx;
}
```

## 五、bufferevent_openssl

### 5.1 创建SSL bufferevent

```c
#include <event2/bufferevent_ssl.h>

/* 创建SSL bufferevent（基于socket） */
struct bufferevent *bufferevent_openssl_socket_new(
    struct event_base *base,
    evutil_socket_t fd,
    SSL *ssl,
    enum bufferevent_ssl_state state,
    int options);

/* 创建SSL bufferevent（基于底层bufferevent） */
struct bufferevent *bufferevent_openssl_filter_new(
    struct event_base *base,
    struct bufferevent *underlying,
    SSL *ssl,
    enum bufferevent_ssl_state state,
    int options);

/* SSL状态 */
enum bufferevent_ssl_state {
    BUFFEREVENT_SSL_CONNECTING = 0,  // 正在握手
    BUFFEREVENT_SSL_ACCEPTING,       // 服务器接受连接
    BUFFEREVENT_SSL_OPEN             // SSL连接已建立
};

/* 获取SSL对象 */
SSL *bufferevent_openssl_get_ssl(struct bufferevent *bufev);

/* 允许底层缓冲区重新协商 */
int bufferevent_openssl_get_allow_dirty_shutdown(struct bufferevent *bev);
void bufferevent_openssl_set_allow_dirty_shutdown(struct bufferevent *bev, 
    int allow_dirty_shutdown);
```

### 5.2 选项标志

```c
#define BEV_OPT_CLOSE_ON_FREE        0x01  // 释放时关闭底层
#define BEV_OPT_THREADSAFE           0x02  // 线程安全
#define BEV_OPT_DEFER_CALLBACKS      0x04  // 延迟回调
#define BEV_OPT_UNLOCK_CALLBACKS     0x08  // 回调时不加锁
```

## 六、SSL客户端

### 6.1 客户端示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/bufferevent.h>
#include <event2/bufferevent_ssl.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

static void event_cb(struct bufferevent *bev, short events, void *arg);
static void read_cb(struct bufferevent *bev, void *arg);

static void init_openssl(void) {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
}

static SSL_CTX *create_client_ssl_ctx(void) {
    SSL_CTX *ctx = SSL_CTX_new(TLS_client_method());
    if (!ctx) return NULL;
    
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    
    // 使用系统默认CA证书
    SSL_CTX_set_default_verify_paths(ctx);
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, NULL);
    
    return ctx;
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    struct event_base *base = arg;
    
    if (events & BEV_EVENT_CONNECTED) {
        printf("SSL connection established\n");
        
        // 发送HTTP请求
        const char *request = 
            "GET / HTTP/1.1\r\n"
            "Host: www.google.com\r\n"
            "Connection: close\r\n"
            "\r\n";
        bufferevent_write(bev, request, strlen(request));
        
    } else if (events & BEV_EVENT_ERROR) {
        unsigned long err;
        while ((err = bufferevent_get_openssl_error(bev))) {
            char msg[256];
            ERR_error_string_n(err, msg, sizeof(msg));
            fprintf(stderr, "SSL error: %s\n", msg);
        }
        event_base_loopexit(base, NULL);
        
    } else if (events & (BEV_EVENT_EOF | BEV_EVENT_TIMEOUT)) {
        printf("Connection closed\n");
        bufferevent_free(bev);
        event_base_loopexit(base, NULL);
    }
}

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[4096];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("%s", buf);
    }
}

int main() {
    init_openssl();
    
    struct event_base *base = event_base_new();
    SSL_CTX *ssl_ctx = create_client_ssl_ctx();
    
    if (!ssl_ctx) {
        fprintf(stderr, "Failed to create SSL context\n");
        return 1;
    }
    
    SSL *ssl = SSL_new(ssl_ctx);
    SSL_set_tlsext_host_name(ssl, "www.google.com");  // SNI
    
    struct bufferevent *bev = bufferevent_openssl_socket_new(
        base, -1, ssl, BUFFEREVENT_SSL_CONNECTING, 
        BEV_OPT_CLOSE_ON_FREE | BEV_OPT_DEFER_CALLBACKS);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, base);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    // 连接服务器
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(443);
    inet_pton(AF_INET, "142.250.185.68", &sin.sin_addr);  // google.com
    
    if (bufferevent_socket_connect(bev, (struct sockaddr *)&sin, sizeof(sin)) < 0) {
        perror("connect");
        bufferevent_free(bev);
        SSL_CTX_free(ssl_ctx);
        event_base_free(base);
        return 1;
    }
    
    printf("Connecting to www.google.com:443...\n");
    event_base_dispatch(base);
    
    SSL_CTX_free(ssl_ctx);
    event_base_free(base);
    
    return 0;
}
```

## 七、SSL服务器

### 7.1 服务器示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>
#include <event2/bufferevent_ssl.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

static SSL_CTX *g_ssl_ctx = NULL;

static void init_openssl(void) {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
}

static SSL_CTX *create_server_ssl_ctx(void) {
    SSL_CTX *ctx = SSL_CTX_new(TLS_server_method());
    if (!ctx) return NULL;
    
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    
    // 加载证书和私钥
    if (SSL_CTX_use_certificate_file(ctx, "server.crt", SSL_FILETYPE_PEM) != 1) {
        fprintf(stderr, "Failed to load certificate\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    if (SSL_CTX_use_PrivateKey_file(ctx, "server.key", SSL_FILETYPE_PEM) != 1) {
        fprintf(stderr, "Failed to load private key\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    if (SSL_CTX_check_private_key(ctx) != 1) {
        fprintf(stderr, "Private key check failed\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 设置密码套件
    SSL_CTX_set_cipher_list(ctx, 
        "ECDHE-RSA-AES128-GCM-SHA256:"
        "ECDHE-RSA-AES256-GCM-SHA384");
    
    // 可选：要求客户端证书
    // SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER | SSL_VERIFY_FAIL_IF_NO_PEER_CERT, NULL);
    // SSL_CTX_load_verify_locations(ctx, "ca.crt", NULL);
    
    return ctx;
}

static void read_cb(struct bufferevent *bev, void *arg) {
    char buf[1024];
    size_t n;
    
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Received: %s", buf);
        
        // 回显
        bufferevent_write(bev, buf, n);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *arg) {
    if (events & BEV_EVENT_CONNECTED) {
        printf("SSL handshake completed\n");
    } else if (events & BEV_EVENT_ERROR) {
        unsigned long err;
        while ((err = bufferevent_get_openssl_error(bev))) {
            char msg[256];
            ERR_error_string_n(err, msg, sizeof(msg));
            fprintf(stderr, "SSL error: %s\n", msg);
        }
        bufferevent_free(bev);
    } else if (events & BEV_EVENT_EOF) {
        printf("Client disconnected\n");
        bufferevent_free(bev);
    }
}

static void accept_cb(struct evconnlistener *listener, evutil_socket_t fd,
                      struct sockaddr *addr, int len, void *arg) {
    struct event_base *base = arg;
    
    printf("New connection from %s:%d\n",
           inet_ntoa(((struct sockaddr_in *)addr)->sin_addr),
           ntohs(((struct sockaddr_in *)addr)->sin_port));
    
    SSL *ssl = SSL_new(g_ssl_ctx);
    
    struct bufferevent *bev = bufferevent_openssl_socket_new(
        base, fd, ssl, BUFFEREVENT_SSL_ACCEPTING,
        BEV_OPT_CLOSE_ON_FREE | BEV_OPT_DEFER_CALLBACKS);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

int main() {
    init_openssl();
    
    g_ssl_ctx = create_server_ssl_ctx();
    if (!g_ssl_ctx) {
        fprintf(stderr, "Failed to create SSL context\n");
        return 1;
    }
    
    struct event_base *base = event_base_new();
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(8443);
    sin.sin_addr.s_addr = INADDR_ANY;
    
    struct evconnlistener *listener = evconnlistener_new_bind(
        base, accept_cb, base,
        LEV_OPT_CLOSE_ON_FREE | LEV_OPT_REUSEABLE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    if (!listener) {
        fprintf(stderr, "Failed to create listener\n");
        SSL_CTX_free(g_ssl_ctx);
        event_base_free(base);
        return 1;
    }
    
    printf("SSL server listening on port 8443\n");
    
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    SSL_CTX_free(g_ssl_ctx);
    event_base_free(base);
    
    return 0;
}
```

## 八、证书验证

### 8.1 自定义验证回调

```c
#include <stdio.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>
#include <openssl/x509v3.h>

static int verify_callback(int preverify_ok, X509_STORE_CTX *ctx) {
    X509 *cert = X509_STORE_CTX_get_current_cert(ctx);
    int depth = X509_STORE_CTX_get_error_depth(ctx);
    int err = X509_STORE_CTX_get_error(ctx);
    
    char subject[256];
    X509_NAME_oneline(X509_get_subject_name(cert), subject, sizeof(subject));
    
    printf("Certificate depth %d: %s\n", depth, subject);
    
    if (!preverify_ok) {
        printf("Verification failed: %s\n", 
               X509_verify_cert_error_string(err));
        
        // 可以在这里实现自定义验证逻辑
        // 返回1继续验证，返回0终止
        return 0;
    }
    
    printf("Verification passed\n");
    return 1;
}

void setup_verification(SSL_CTX *ctx) {
    SSL_CTX_set_verify(ctx, SSL_VERIFY_PEER, verify_callback);
    SSL_CTX_set_verify_depth(ctx, 4);
    
    // 加载CA证书
    SSL_CTX_load_verify_locations(ctx, "ca-bundle.crt", NULL);
    
    // 或使用系统默认CA
    SSL_CTX_set_default_verify_paths(ctx);
}
```

### 8.2 获取证书信息

```c
#include <stdio.h>
#include <openssl/ssl.h>
#include <openssl/x509.h>

void print_certificate_info(SSL *ssl) {
    X509 *cert = SSL_get_peer_certificate(ssl);
    if (!cert) {
        printf("No peer certificate\n");
        return;
    }
    
    char subject[256];
    char issuer[256];
    
    X509_NAME_oneline(X509_get_subject_name(cert), subject, sizeof(subject));
    X509_NAME_oneline(X509_get_issuer_name(cert), issuer, sizeof(issuer));
    
    printf("Subject: %s\n", subject);
    printf("Issuer: %s\n", issuer);
    
    // 检查证书有效期
    const ASN1_TIME *not_before = X509_get0_notBefore(cert);
    const ASN1_TIME *not_after = X509_get0_notAfter(cert);
    
    // 验证结果
    long verify_result = SSL_get_verify_result(ssl);
    if (verify_result == X509_V_OK) {
        printf("Certificate verified successfully\n");
    } else {
        printf("Certificate verification failed: %s\n",
               X509_verify_cert_error_string(verify_result));
    }
    
    X509_free(cert);
}
```

## 九、SNI支持

### 9.1 客户端SNI

```c
#include <openssl/ssl.h>

void set_sni(SSL *ssl, const char *hostname) {
    // 设置SNI（Server Name Indication）
    SSL_set_tlsext_host_name(ssl, hostname);
    
    // 设置主机名验证
    SSL_set1_host(ssl, hostname);
}
```

### 9.2 服务器SNI回调

```c
#include <stdio.h>
#include <string.h>
#include <openssl/ssl.h>

static int sni_callback(SSL *ssl, int *al, void *arg) {
    const char *servername = SSL_get_servername(ssl, TLSEXT_NAMETYPE_host_name);
    
    if (servername) {
        printf("SNI: %s\n", servername);
        
        // 根据域名选择不同的证书
        if (strcmp(servername, "example.com") == 0) {
            SSL_set_SSL_CTX(ssl, get_example_com_ctx());
        } else if (strcmp(servername, "test.com") == 0) {
            SSL_set_SSL_CTX(ssl, get_test_com_ctx());
        }
    }
    
    return SSL_TLSEXT_ERR_OK;
}

void setup_sni_callback(SSL_CTX *ctx) {
    SSL_CTX_set_tlsext_servername_callback(ctx, sni_callback);
}
```

## 十、ALPN支持

### 10.1 ALPN协商

```c
#include <openssl/ssl.h>

// 客户端设置ALPN
static int alpn_client_select_proto(SSL *ssl, unsigned char **out, 
                                     unsigned char *outlen,
                                     const unsigned char *server, 
                                     unsigned int server_len, void *arg) {
    const unsigned char *client = (const unsigned char *)"\x02h2\x08http/1.1";
    unsigned int client_len = 12;
    
    if (SSL_select_next_proto(out, outlen, server, server_len, 
                               client, client_len) == OPENSSL_NPN_NEGOTIATED) {
        return SSL_TLSEXT_ERR_OK;
    }
    
    return SSL_TLSEXT_ERR_ALERT_FATAL;
}

void setup_client_alpn(SSL_CTX *ctx) {
    SSL_CTX_set_alpn_protos(ctx, 
        (const unsigned char *)"\x02h2\x08http/1.1", 12);
}

// 服务器设置ALPN回调
static int alpn_server_select_proto(SSL *ssl, const unsigned char **out,
                                     unsigned char *outlen,
                                     const unsigned char *in, 
                                     unsigned int inlen, void *arg) {
    // 优先选择h2
    if (SSL_select_next_proto((unsigned char **)out, outlen, 
                               (const unsigned char *)"\x02h2\x08http/1.1", 12,
                               in, inlen) == OPENSSL_NPN_NEGOTIATED) {
        return SSL_TLSEXT_ERR_OK;
    }
    
    *out = (const unsigned char *)"http/1.1";
    *outlen = 8;
    return SSL_TLSEXT_ERR_OK;
}

void setup_server_alpn(SSL_CTX *ctx) {
    SSL_CTX_set_alpn_select_cb(ctx, alpn_server_select_proto, NULL);
}
```

## 十一、错误处理

### 11.1 SSL错误处理

```c
#include <stdio.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

void print_ssl_error(SSL *ssl, int ret) {
    int err = SSL_get_error(ssl, ret);
    
    switch (err) {
        case SSL_ERROR_NONE:
            printf("No error\n");
            break;
        case SSL_ERROR_ZERO_RETURN:
            printf("SSL connection closed cleanly\n");
            break;
        case SSL_ERROR_WANT_READ:
            printf("SSL needs more data to read\n");
            break;
        case SSL_ERROR_WANT_WRITE:
            printf("SSL needs to write more data\n");
            break;
        case SSL_ERROR_WANT_CONNECT:
            printf("SSL connect not completed\n");
            break;
        case SSL_ERROR_WANT_ACCEPT:
            printf("SSL accept not completed\n");
            break;
        case SSL_ERROR_WANT_X509_LOOKUP:
            printf("SSL certificate lookup needed\n");
            break;
        case SSL_ERROR_SYSCALL:
            printf("SSL I/O error: %s\n", strerror(errno));
            break;
        case SSL_ERROR_SSL:
            printf("SSL protocol error\n");
            ERR_print_errors_fp(stderr);
            break;
        default:
            printf("Unknown SSL error: %d\n", err);
    }
}

void print_all_ssl_errors(void) {
    unsigned long err;
    while ((err = ERR_get_error())) {
        char msg[256];
        ERR_error_string_n(err, msg, sizeof(msg));
        fprintf(stderr, "SSL Error: %s\n", msg);
    }
}
```

## 十二、完整示例：HTTPS服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <event2/event.h>
#include <event2/listener.h>
#include <event2/bufferevent.h>
#include <event2/bufferevent_ssl.h>
#include <event2/http.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

static SSL_CTX *g_ssl_ctx = NULL;
static struct event_base *g_base = NULL;

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    printf("\nShutting down...\n");
    event_base_loopbreak(g_base);
}

static void init_openssl(void) {
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
}

static SSL_CTX *create_ssl_ctx(void) {
    SSL_CTX *ctx = SSL_CTX_new(TLS_server_method());
    if (!ctx) return NULL;
    
    SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION);
    
    // 加载证书链
    if (SSL_CTX_use_certificate_chain_file(ctx, "server.crt") != 1) {
        fprintf(stderr, "Failed to load certificate chain\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 加载私钥
    if (SSL_CTX_use_PrivateKey_file(ctx, "server.key", SSL_FILETYPE_PEM) != 1) {
        fprintf(stderr, "Failed to load private key\n");
        SSL_CTX_free(ctx);
        return NULL;
    }
    
    // 设置ECDH自动选择曲线
    SSL_CTX_set_ecdh_auto(ctx, 1);
    
    // 设置密码套件
    SSL_CTX_set_cipher_list(ctx, 
        "ECDHE-ECDSA-AES128-GCM-SHA256:"
        "ECDHE-RSA-AES128-GCM-SHA256:"
        "ECDHE-ECDSA-AES256-GCM-SHA384:"
        "ECDHE-RSA-AES256-GCM-SHA384:"
        "ECDHE-ECDSA-CHACHA20-POLY1305:"
        "ECDHE-RSA-CHACHA20-POLY1305");
    
    printf("SSL context configured\n");
    return ctx;
}

static void http_request_cb(struct evhttp_request *req, void *arg) {
    struct evbuffer *buf = evbuffer_new();
    
    evbuffer_add_printf(buf, 
        "<html><body>"
        "<h1>HTTPS Server</h1>"
        "<p>This is a secure connection!</p>"
        "<p>Protocol: %s</p>"
        "<p>Cipher: %s</p>"
        "</body></html>",
        SSL_get_version(SSL_get_current_compression(SSL_get_current_compression(NULL))),
        SSL_get_cipher_name(SSL_get_current_compression(SSL_get_current_compression(NULL))));
    
    evhttp_add_header(evhttp_request_get_output_headers(req), 
                      "Content-Type", "text/html");
    evhttp_send_reply(req, HTTP_OK, "OK", buf);
    
    evbuffer_free(buf);
}

int main() {
    init_openssl();
    
    g_ssl_ctx = create_ssl_ctx();
    if (!g_ssl_ctx) {
        fprintf(stderr, "Failed to create SSL context\n");
        return 1;
    }
    
    g_base = event_base_new();
    
    // 设置信号处理
    struct event *sigint = evsignal_new(g_base, SIGINT, signal_cb, NULL);
    event_add(sigint, NULL);
    
    // 创建HTTP服务器
    struct evhttp *http = evhttp_new(g_base);
    
    evhttp_set_cb(http, "/", http_request_cb, NULL);
    
    // 绑定地址
    if (evhttp_bind_socket(http, "0.0.0.0", 8443) != 0) {
        fprintf(stderr, "Failed to bind socket\n");
        return 1;
    }
    
    printf("HTTPS server listening on https://0.0.0.0:8443/\n");
    printf("Press Ctrl+C to stop\n");
    
    event_base_dispatch(g_base);
    
    evhttp_free(http);
    event_free(sigint);
    SSL_CTX_free(g_ssl_ctx);
    event_base_free(g_base);
    
    EVP_cleanup();
    ERR_free_strings();
    
    return 0;
}
```

## 十三、最佳实践

| 场景 | 建议 |
|------|------|
| **协议版本** | 禁用SSLv3和TLS1.0，使用TLS1.2+ |
| **密码套件** | 优先使用ECDHE和AES-GCM |
| **证书验证** | 始终验证服务器证书 |
| **SNI** | 客户端设置SNI以支持虚拟主机 |
| **错误处理** | 详细记录SSL错误信息 |
| **证书更新** | 自动化证书续期流程 |
| **HSTS** | 服务器启用HSTS头部 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
