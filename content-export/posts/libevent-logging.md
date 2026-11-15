---
title: "\U0001F4DD 日志模块 - libevent源码深度解析系列（八）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📝 日志模块

## 一、概述

libevent提供了日志功能，允许用户自定义日志输出方式。默认情况下，日志输出到标准错误输出（stderr）。

## 二、日志级别

```c
#define EVENT_LOG_DEBUG  0
#define EVENT_LOG_MSG    1
#define EVENT_LOG_WARN   2
#define EVENT_LOG_ERR    3
```

## 三、日志回调函数

### 3.1 回调函数类型

```c
typedef void (*event_log_cb)(int severity, const char *msg);
```

### 3.2 设置日志回调

```c
/* 设置日志回调函数，设置为NULL恢复默认行为 */
void event_set_log_callback(event_log_cb cb);
```

### 3.3 示例

```c
#include <stdio.h>
#include <event2/event.h>

static void my_log_cb(int severity, const char *msg) {
    const char *level;
    switch (severity) {
        case EVENT_LOG_DEBUG: level = "DEBUG"; break;
        case EVENT_LOG_MSG:   level = "MSG";   break;
        case EVENT_LOG_WARN:  level = "WARN";  break;
        case EVENT_LOG_ERR:   level = "ERR";   break;
        default:              level = "???";   break;
    }
    fprintf(stderr, "[libevent][%s] %s\n", level, msg);
}

int main() {
    event_set_log_callback(my_log_cb);
    // ... 其他代码
    return 0;
}
```

## 四、致命错误处理

### 4.1 设置致命错误回调

```c
typedef void (*event_fatal_cb)(int err);

/* 设置致命错误回调函数
 * 设置后，libevent遇到内部错误时调用此回调，而不是退出
 * 注意：回调函数不应该返回
 */
void event_set_fatal_callback(event_fatal_cb cb);
```

### 4.2 示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>

static void my_fatal_cb(int err) {
    fprintf(stderr, "Fatal error: %d\n", err);
    abort();
}

int main() {
    event_set_fatal_callback(my_fatal_cb);
    // ... 其他代码
    return 0;
}
```

## 五、调试日志

### 5.1 启用调试日志

```c
/* 启用调试日志
 * 启用后，libevent会输出详细的调试信息
 * 注意：这会降低性能，仅用于调试
 */
void event_enable_debug_mode(void);
```

### 5.2 调试事件

```c
/* 记录事件添加的调试信息 */
void event_enable_debug_logging(int which);

#define EVENT_DBG_NONE  0x00
#define EVENT_DBG_ALL   0xffffffff
```

## 六、内存调试

### 6.1 内存分配函数

```c
/* 设置自定义内存分配函数 */
void event_set_mem_functions(void *(*malloc_fn)(size_t sz),
                            void *(*realloc_fn)(void *ptr, size_t sz),
                            void (*free_fn)(void *ptr));
```

### 6.2 示例

```c
#include <stdlib.h>
#include <event2/event.h>

static void *my_malloc(size_t sz) {
    void *p = malloc(sz);
    printf("malloc(%zu) = %p\n", sz, p);
    return p;
}

static void *my_realloc(void *ptr, size_t sz) {
    void *p = realloc(ptr, sz);
    printf("realloc(%p, %zu) = %p\n", ptr, sz, p);
    return p;
}

static void my_free(void *ptr) {
    printf("free(%p)\n", ptr);
    free(ptr);
}

int main() {
    event_set_mem_functions(my_malloc, my_realloc, my_free);
    // ... 其他代码
    return 0;
}
```

## 七、完整示例

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <time.h>
#include <event2/event.h>

static const char* get_time_str(void) {
    static char buf[64];
    time_t t = time(NULL);
    struct tm *tm = localtime(&t);
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", tm);
    return buf;
}

static void my_log_cb(int severity, const char *msg) {
    const char *level;
    switch (severity) {
        case EVENT_LOG_DEBUG: level = "DEBUG"; break;
        case EVENT_LOG_MSG:   level = "INFO";  break;
        case EVENT_LOG_WARN:  level = "WARN";  break;
        case EVENT_LOG_ERR:   level = "ERROR"; break;
        default:              level = "UNKNOWN"; break;
    }
    fprintf(stderr, "[%s][libevent][%s] %s\n", get_time_str(), level, msg);
}

static void timer_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer triggered\n");
}

int main() {
    event_set_log_callback(my_log_cb);
    event_enable_debug_mode();
    
    struct event_base *base = event_base_new();
    if (!base) {
        fprintf(stderr, "Failed to create event base\n");
        return 1;
    }
    
    printf("Using method: %s\n", event_base_get_method(base));
    
    struct event *timer = event_new(base, -1, EV_PERSIST, timer_cb, NULL);
    struct timeval tv = {2, 0};
    event_add(timer, &tv);
    
    // 运行5秒后退出
    struct timeval exit_tv = {5, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

## 八、日志使用建议

| 场景 | 建议 |
|------|------|
| **开发调试** | 启用调试日志，输出详细信息 |
| **生产环境** | 只记录警告和错误级别日志 |
| **内存泄漏排查** | 使用自定义内存分配函数跟踪内存分配 |
| **崩溃分析** | 设置致命错误回调，记录错误信息 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
