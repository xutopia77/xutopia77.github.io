---
title: "\U0001F4E6 evbuffer详解 - libevent源码深度解析系列（十八）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📦 evbuffer详解

## 一、概述

`evbuffer` 是libevent提供的动态缓冲区实现，用于高效地管理二进制数据。它是bufferevent的底层缓冲区实现，也可以独立使用。evbuffer提供了丰富的数据操作接口，支持数据的添加、删除、搜索、移动等操作，并且支持零拷贝优化。

## 二、evbuffer结构体

```c
struct evbuffer {
    struct evbuffer_chain *first;   // 第一个数据块
    struct evbuffer_chain *last;    // 最后一个数据块
    struct evbuffer_chain **last_with_datap;  // 最后一个包含数据的块
    
    size_t total_len;               // 总数据长度
    size_t n_add_for_cb;            // 自上次回调以来添加的字节数
    size_t n_del_for_cb;            // 自上次回调以来删除的字节数
    
    int freeze_start;               // 冻结前端标志
    int freeze_end;                 // 冻结后端标志
    
    TAILQ_HEAD(evbuffer_cb_queue, evbuffer_cb_entry) callbacks;  // 回调队列
    
    struct event_base *ev_base;     // 关联的event_base
};
```

### 2.1 evbuffer_chain结构体

```c
struct evbuffer_chain {
    struct evbuffer_chain *next;    // 下一个链
    size_t buffer_len;              // 缓冲区总长度
    size_t misalign;                // 未对齐的字节数（已读但未释放）
    size_t off;                     // 有效数据长度
    
    unsigned char *buffer;          // 数据缓冲区
};
```

## 三、创建与销毁

### 3.1 创建evbuffer

```c
/* 创建新的evbuffer */
struct evbuffer *evbuffer_new(void);

/* 释放evbuffer */
void evbuffer_free(struct evbuffer *buf);

/* 启用线程安全 */
int evbuffer_enable_locking(struct evbuffer *buf, void *lock);

/* 获取锁 */
void evbuffer_lock(struct evbuffer *buf);
void evbuffer_unlock(struct evbuffer *buf);
```

### 3.2 基本示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    if (!buf) {
        fprintf(stderr, "Failed to create evbuffer\n");
        return 1;
    }
    
    printf("Created evbuffer, length: %zu\n", evbuffer_get_length(buf));
    
    evbuffer_free(buf);
    return 0;
}
```

## 四、数据添加操作

### 4.1 基本添加

```c
/* 添加数据到缓冲区末尾 */
int evbuffer_add(struct evbuffer *buf, const void *data, size_t datlen);

/* 添加格式化字符串 */
int evbuffer_add_printf(struct evbuffer *buf, const char *fmt, ...);
int evbuffer_add_vprintf(struct evbuffer *buf, const char *fmt, va_list ap);

/* 添加另一个evbuffer的所有数据（并清空源缓冲区） */
int evbuffer_add_buffer(struct evbuffer *dst, struct evbuffer *src);

/* 添加另一个evbuffer的数据（不清空源缓冲区） */
int evbuffer_prepend_buffer(struct evbuffer *dst, struct evbuffer *src);

/* 在缓冲区开头添加数据 */
int evbuffer_prepend(struct evbuffer *buf, const void *data, size_t size);
```

### 4.2 添加示例

```c
#include <stdio.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 添加字符串
    evbuffer_add(buf, "Hello, ", 7);
    evbuffer_add(buf, "World!", 6);
    
    // 添加格式化字符串
    evbuffer_add_printf(buf, " Number: %d", 42);
    
    printf("Length: %zu\n", evbuffer_get_length(buf));
    // 输出: Length: 21
    
    evbuffer_free(buf);
    return 0;
}
```

### 4.3 添加文件（零拷贝）

```c
/* 添加文件内容（零拷贝）
 * @param fd        文件描述符
 * @param offset    起始偏移
 * @param length    长度，-1表示到文件末尾
 */
int evbuffer_add_file(struct evbuffer *buf, int fd, ev_off_t offset, ev_off_t length);

/* 添加文件引用（不复制数据） */
int evbuffer_add_file_segment(struct evbuffer *buf,
    struct evbuffer_file_segment *seg, ev_off_t offset, ev_off_t length);

/* 创建文件段 */
struct evbuffer_file_segment *evbuffer_file_segment_new(
    int fd, ev_off_t offset, ev_off_t length, unsigned flags);

/* 释放文件段 */
void evbuffer_file_segment_free(struct evbuffer_file_segment *seg);
```

## 五、数据读取操作

### 5.1 基本读取

```c
/* 从缓冲区读取数据（并移除）
 * @return 实际读取的字节数
 */
size_t evbuffer_remove(struct evbuffer *buf, void *data, size_t datlen);

/* 从缓冲区读取数据到另一个evbuffer */
int evbuffer_remove_buffer(struct evbuffer *src, struct evbuffer *dst,
    size_t datlen);

/* 拷贝数据（不移除） */
ev_ssize_t evbuffer_copyout(struct evbuffer *buf, void *data, size_t datlen);

/* 拷贝数据到另一个evbuffer（不移除） */
int evbuffer_copyout_to(struct evbuffer *src, struct evbuffer *dst,
    size_t datlen);

/* 丢弃数据 */
int evbuffer_drain(struct evbuffer *buf, size_t len);
```

### 5.2 读取示例

```c
#include <stdio.h>
#include <string.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 添加数据
    evbuffer_add(buf, "Hello, World!", 13);
    
    // 读取数据
    char data[20];
    size_t n = evbuffer_remove(buf, data, sizeof(data) - 1);
    data[n] = '\0';
    printf("Read: %s (%zu bytes)\n", data, n);
    
    // 再次添加
    evbuffer_add(buf, "Test Data", 9);
    
    // 拷贝不移除
    char copy[10];
    evbuffer_copyout(buf, copy, 4);
    copy[4] = '\0';
    printf("Copy: %s, remaining: %zu\n", copy, evbuffer_get_length(buf));
    
    evbuffer_free(buf);
    return 0;
}
```

## 六、行读取操作

### 6.1 按行读取

```c
/* 读取一行并移除
 * @param n_eol_style 行结束符类型
 * @return 读取的行（需要调用者free），NULL表示没有完整行
 */
char *evbuffer_readln(struct evbuffer *buffer, size_t *n_read_out,
    enum evbuffer_eol_style n_eol_style);

/* 行结束符类型 */
enum evbuffer_eol_style {
    EVBUFFER_EOL_ANY,       // 任意换行符
    EVBUFFER_EOL_CRLF,      // \r\n
    EVBUFFER_EOL_CRLF_STRICT, // 严格的\r\n
    EVBUFFER_EOL_LF,        // \n
    EVBUFFER_EOL_NUL        // \0
};
```

### 6.2 行读取示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 添加多行数据
    evbuffer_add(buf, "Line 1\nLine 2\r\nLine 3\n", 21);
    
    // 逐行读取
    char *line;
    size_t len;
    
    while ((line = evbuffer_readln(buf, &len, EVBUFFER_EOL_ANY)) != NULL) {
        printf("Line: %s (len=%zu)\n", line, len);
        free(line);
    }
    
    evbuffer_free(buf);
    return 0;
}
```

## 七、搜索操作

### 7.1 搜索API

```c
/* evbuffer指针结构体 */
struct evbuffer_ptr {
    ev_ssize_t pos;         // 位置，-1表示无效
    
    struct {
        void *chain;
        size_t pos_in_chain;
    } internal_;
};

/* 搜索字符串 */
struct evbuffer_ptr evbuffer_search(struct evbuffer *buffer,
    const char *what, size_t len, const struct evbuffer_ptr *start);

/* 搜索字符范围 */
struct evbuffer_ptr evbuffer_search_range(struct evbuffer *buffer,
    const char *what, size_t len, const struct evbuffer_ptr *start,
    const struct evbuffer_ptr *end);

/* 搜索行结束符 */
enum evbuffer_eol_style;
struct evbuffer_ptr evbuffer_search_eol(struct evbuffer *buffer,
    struct evbuffer_ptr *start, size_t *eol_len_out,
    enum evbuffer_eol_style eol_style);

/* 移动指针 */
int evbuffer_ptr_set(struct evbuffer *buf, struct evbuffer_ptr *pos,
    size_t position, enum evbuffer_ptr_how how);

enum evbuffer_ptr_how {
    EVBUFFER_PTR_SET,   // 设置绝对位置
    EVBUFFER_PTR_ADD    // 相对当前位置移动
};
```

### 7.2 搜索示例

```c
#include <stdio.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    evbuffer_add(buf, "Hello, World! Hello, libevent!", 30);
    
    // 搜索"Hello"
    struct evbuffer_ptr ptr = evbuffer_search(buf, "Hello", 5, NULL);
    if (ptr.pos != -1) {
        printf("Found 'Hello' at position %zd\n", ptr.pos);
    }
    
    // 从上次位置之后继续搜索
    evbuffer_ptr_set(buf, &ptr, 5, EVBUFFER_PTR_ADD);
    ptr = evbuffer_search(buf, "Hello", 5, &ptr);
    if (ptr.pos != -1) {
        printf("Found second 'Hello' at position %zd\n", ptr.pos);
    }
    
    evbuffer_free(buf);
    return 0;
}
```

## 八、迭代器操作

### 8.1 迭代器API

```c
/* 创建迭代器 */
struct evbuffer_iovec {
    void *iov_base;    // 数据指针
    size_t iov_len;    // 数据长度
};

/* 预留空间（用于直接写入） */
int evbuffer_reserve_space(struct evbuffer *buf, ev_ssize_t size,
    struct evbuffer_iovec *vec, int n_vecs);

/* 提交预留空间 */
int evbuffer_commit_space(struct evbuffer *buf,
    struct evbuffer_iovec *vec, int n_vecs);

/* 获取数据指针（用于直接读取） */
int evbuffer_peek(struct evbuffer *buf, ev_ssize_t len,
    struct evbuffer_ptr *start_at, struct evbuffer_iovec *vec, int n_vecs);
```

### 8.2 直接写入示例

```c
#include <stdio.h>
#include <string.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 预留空间
    struct evbuffer_iovec vec[2];
    int n = evbuffer_reserve_space(buf, 1024, vec, 2);
    
    // 直接写入数据
    for (int i = 0; i < n; i++) {
        const char *msg = "Direct write data";
        size_t len = strlen(msg);
        if (len > vec[i].iov_len) len = vec[i].iov_len;
        memcpy(vec[i].iov_base, msg, len);
        vec[i].iov_len = len;
    }
    
    // 提交数据
    evbuffer_commit_space(buf, vec, n);
    
    printf("Buffer length: %zu\n", evbuffer_get_length(buf));
    
    evbuffer_free(buf);
    return 0;
}
```

## 九、文件描述符I/O

### 9.1 直接读写文件描述符

```c
/* 从文件描述符读取数据到缓冲区 */
int evbuffer_read(struct evbuffer *buffer, evutil_socket_t fd, int howmuch);

/* 将缓冲区数据写入文件描述符 */
int evbuffer_write(struct evbuffer *buffer, evutil_socket_t fd);
int evbuffer_write_atmost(struct evbuffer *buffer, evutil_socket_t fd, ev_ssize_t howmuch);
```

### 9.2 文件I/O示例

```c
#include <stdio.h>
#include <unistd.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 从标准输入读取
    printf("Enter some text (Ctrl+D to end):\n");
    int n = evbuffer_read(buf, STDIN_FILENO, -1);
    
    if (n > 0) {
        printf("Read %d bytes\n", n);
        
        // 写入标准输出
        evbuffer_write(buf, STDOUT_FILENO);
    }
    
    evbuffer_free(buf);
    return 0;
}
```

## 十、回调函数

### 10.1 回调API

```c
/* 回调函数类型 */
typedef void (*evbuffer_cb_func)(struct evbuffer *buffer,
    size_t old_len, size_t new_len, void *arg);

/* 添加回调 */
struct evbuffer_cb_entry *evbuffer_add_cb(struct evbuffer *buffer,
    evbuffer_cb_func cb, void *cbarg);

/* 移除回调 */
int evbuffer_remove_cb_entry(struct evbuffer *buffer,
    struct evbuffer_cb_entry *ent);
int evbuffer_remove_cb(struct evbuffer *buffer, evbuffer_cb_func cb, void *cbarg);

/* 设置回调标志 */
#define EVBUFFER_CB_ENABLED 1
int evbuffer_cb_set_flags(struct evbuffer *buffer,
    struct evbuffer_cb_entry *cb, ev_uint32_t flags);
int evbuffer_cb_clear_flags(struct evbuffer *buffer,
    struct evbuffer_cb_entry *cb, ev_uint32_t flags);
```

### 10.2 回调示例

```c
#include <stdio.h>
#include <event2/buffer.h>

static void buffer_cb(struct evbuffer *buffer, size_t old_len, 
                      size_t new_len, void *arg) {
    const char *name = (const char *)arg;
    
    if (new_len > old_len) {
        printf("[%s] Added %zu bytes (total: %zu)\n", 
               name, new_len - old_len, new_len);
    } else if (new_len < old_len) {
        printf("[%s] Removed %zu bytes (total: %zu)\n", 
               name, old_len - new_len, new_len);
    }
}

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    // 添加回调
    evbuffer_add_cb(buf, buffer_cb, "MyBuffer");
    
    // 操作缓冲区
    evbuffer_add(buf, "Hello", 5);
    evbuffer_add(buf, " World", 6);
    
    char tmp[10];
    evbuffer_remove(buf, tmp, 5);
    
    evbuffer_free(buf);
    return 0;
}
```

## 十一、冻结操作

### 11.1 冻结API

```c
/* 冻结缓冲区前端（禁止从头部读取/删除） */
int evbuffer_freeze(struct evbuffer *buf, int start);

/* 冻结缓冲区后端（禁止向尾部添加） */
int evbuffer_unfreeze(struct evbuffer *buf, int start);
```

### 11.2 冻结示例

```c
#include <stdio.h>
#include <event2/buffer.h>

int main() {
    struct evbuffer *buf = evbuffer_new();
    
    evbuffer_add(buf, "Header", 6);
    evbuffer_add(buf, "Body", 4);
    
    // 冻结前端，保护头部数据
    evbuffer_freeze(buf, 1);
    
    // 尝试从前端读取会失败
    char tmp[10];
    size_t n = evbuffer_remove(buf, tmp, 6);
    printf("Remove from front: %zu (should be 0)\n", n);
    
    // 解冻
    evbuffer_unfreeze(buf, 1);
    
    // 现在可以读取
    n = evbuffer_remove(buf, tmp, 6);
    printf("Remove after unfreeze: %zu\n", n);
    
    evbuffer_free(buf);
    return 0;
}
```

## 十二、其他实用函数

### 12.1 信息获取

```c
/* 获取缓冲区总长度 */
size_t evbuffer_get_length(const struct evbuffer *buf);

/* 获取连续内存块数量 */
int evbuffer_get_contiguous_space(const struct evbuffer *buf);

/* 拉取数据到连续内存（不复制，仅重组） */
int evbuffer_pullup(struct evbuffer *buf, ev_ssize_t size);
```

### 12.2 扩展操作

```c
/* 添加引用（不复制数据）
 * @param data      数据指针
 * @param datlen    数据长度
 * @param cleanupfn 清理函数
 * @param cleanupfn_arg 清理函数参数
 */
int evbuffer_add_reference(struct evbuffer *buf,
    const void *data, size_t datlen,
    void (*cleanupfn)(void *extra), void *cleanupfn_arg);

/* 添加引用示例 */
static void my_cleanup(void *arg) {
    char *data = (char *)arg;
    printf("Cleaning up: %s\n", data);
    free(data);
}

void add_ref_example() {
    struct evbuffer *buf = evbuffer_new();
    
    char *external_data = strdup("External data");
    evbuffer_add_reference(buf, external_data, strlen(external_data),
                          my_cleanup, external_data);
    
    // 当数据从缓冲区移除时，会调用my_cleanup
    evbuffer_drain(buf, evbuffer_get_length(buf));
    
    evbuffer_free(buf);
}
```

## 十三、完整示例：HTTP请求解析

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <event2/buffer.h>

typedef struct {
    char method[16];
    char path[256];
    char version[16];
    char headers[1024];
    char body[4096];
} http_request_t;

int parse_http_request(struct evbuffer *buf, http_request_t *req) {
    char *line;
    size_t len;
    
    // 读取请求行
    line = evbuffer_readln(buf, &len, EVBUFFER_EOL_CRLF);
    if (!line) return -1;
    
    sscanf(line, "%15s %255s %15s", req->method, req->path, req->version);
    free(line);
    
    // 读取头部
    while ((line = evbuffer_readln(buf, &len, EVBUFFER_EOL_CRLF)) != NULL) {
        if (len == 0) {
            free(line);
            break;  // 空行表示头部结束
        }
        strncat(req->headers, line, sizeof(req->headers) - strlen(req->headers) - 1);
        strncat(req->headers, "\n", sizeof(req->headers) - strlen(req->headers) - 1);
        free(line);
    }
    
    // 读取body（如果有）
    size_t body_len = evbuffer_get_length(buf);
    if (body_len > 0) {
        size_t n = evbuffer_remove(buf, req->body, 
                                   body_len < sizeof(req->body) - 1 ? body_len : sizeof(req->body) - 1);
        req->body[n] = '\0';
    }
    
    return 0;
}

int main() {
    struct evbuffer *buf = evbuffer_new();
    http_request_t req = {0};
    
    // 模拟HTTP请求
    const char *request = 
        "GET /index.html HTTP/1.1\r\n"
        "Host: example.com\r\n"
        "User-Agent: TestClient\r\n"
        "\r\n";
    
    evbuffer_add(buf, request, strlen(request));
    
    if (parse_http_request(buf, &req) == 0) {
        printf("Method: %s\n", req.method);
        printf("Path: %s\n", req.path);
        printf("Version: %s\n", req.version);
        printf("Headers:\n%s\n", req.headers);
    }
    
    evbuffer_free(buf);
    return 0;
}
```

## 十四、最佳实践

| 场景 | 建议 |
|------|------|
| **大数据传输** | 使用evbuffer_add_file实现零拷贝 |
| **行协议解析** | 使用evbuffer_readln逐行处理 |
| **高性能写入** | 使用evbuffer_reserve_space直接写入 |
| **内存敏感** | 及时evbuffer_drain释放已处理数据 |
| **线程安全** | 使用evbuffer_enable_locking |
| **数据保护** | 使用evbuffer_freeze保护关键数据 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
