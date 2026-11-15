---
title: "\U0001F3AF event_base详解 - libevent源码深度解析系列（五）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🏗️ event_base详解

## 一、概述

最重要的 `event_base`，就是一个 Reactor框架，我们都是需要先申请 `event_base` 结构体。对于一个 `event_base` 结构来说，它会保存一系列的 event 事件并且以轮训的方式去关注每一个事件，去查看哪一个事件是就绪的，事件就绪之后，就会调用事件回调。

我们可以取消(disable)指定的method通过环境变量，比如设置 `EVENT_NOQUEUE` 环境变量。也可以通过调用 `event_config_avoid_method` 函数来关闭相应的method。

## 二、事件类型定义

```c
#define EV_TIMEOUT  0x01    // 定时事件
#define EV_READ     0x02    // 可读事件
#define EV_WRITE    0x04    // 可写事件
#define EV_SIGNAL   0x08    // 信号事件
#define EV_PERSIST  0x10    // 永久事件，EV_PERSIST的作用是：事件被触发后，自动重新对这个event调用event_add函数
#define EV_ET       0x20    // 边缘触发事件，需要I/O复用系统调用支持，比如epoll
```

## 三、event_base结构体

```c
struct event_base {
    /* eventop 实际上就是对系统提供的I/O复用接口进行封装（select、poll、epoll、kqueue...）
       这个赋值是在创建event_base的时候 event_base_new -> event_base_new_with_config，
       在这个函数中从 eventops 结构体数组中选出合适的I/O复用机制 */
    const struct eventop *evsel;
    
    /* 上面选出合适的I/O复用机制之后，通过base->evsel->init生成 evbase
       所以可以说evsel 和 evbase 的关系就是c++中类和类的实例的关系 */
    void *evbase;

    /* 使用changelist后，对事件的修改不会立即作用到epoll上，而是把这些修改保存到一个list上，
       在作用到epoll之前，这些修改可以抵消，合并 */
    struct event_changelist changelist;

    const struct eventop *evsigsel;
    struct evsig_info sig;

    int virtual_event_count;
    int virtual_event_count_max;
    int event_count;              // 事件总数
    int event_count_max;
    int event_count_active;       // 活跃事件数
    int event_count_active_max;

    int event_gotterm;            // 设置在处理完事件后是否应该终止循环
    int event_break;              // 设置是否应该立即终止循环
    int event_continue;           // 设置是否应该立即启动一个新的循环实例

    int event_running_priority;
    int running_loop;

    /* 触发的事件列表，后面会遍历这个列表，执行其中的回调 */
    struct evcallback_list *activequeues;
    int nactivequeues;
    struct evcallback_list active_later_queue;

    struct common_timeout_list **common_timeout_queues;
    int n_common_timeouts;
    int n_common_timeouts_allocated;

    struct event_io_map io;       // Mapping from file descriptors to events
    struct event_signal_map sigmap; // Mapping from signal numbers to events
    struct min_heap timeheap;     // Priority queue of events with timeouts

    struct timeval tv_cache;
    struct evutil_monotonic_timer monotonic_timer;

#ifndef EVENT__DISABLE_THREAD_SUPPORT
    unsigned long th_owner_id;
    void *th_base_lock;
    void *current_event_cond;
    int current_event_waiters;
#endif

    struct event_callback *current_event;
    enum event_base_config_flag flags;
    // ... 其他字段
};
```

## 四、eventop结构体

```c
struct eventop {
    const char *name;            // 后端名称
    /* 创建一个新结构，包含运行后端所需的任何信息 */
    void *(*init)(struct event_base *);
    /* 在给定的 fd 或信号上启用读/写 */
    int (*add)(struct event_base *, evutil_socket_t fd, short old, short events, void *fdinfo);
    /* 禁用事件 */
    int (*del)(struct event_base *, evutil_socket_t fd, short old, short events, void *fdinfo);
    /* 事件派遣分发 */
    int (*dispatch)(struct event_base *, struct timeval *);
    /* 释放资源 */
    void (*dealloc)(struct event_base *);
    int need_reinit;             // 是否需要重新初始化
    enum event_method_feature features;  // 支持的特性
    size_t fdinfo_len;
};
```

### 4.1 epoll后端示例

```c
const struct eventop epollops = {
    "epoll",
    epoll_init,
    epoll_nochangelist_add,
    epoll_nochangelist_del,
    epoll_dispatch,
    epoll_dealloc,
    1, /* need reinit */
    EV_FEATURE_ET|EV_FEATURE_O1|EV_FEATURE_EARLY_CLOSE,
    0
};
```

## 五、event_base API

### 5.1 创建event_base

```c
// 简单创建
struct event_base *event_base_new(void);

// 带配置创建
struct event_base *event_base_new_with_config(const struct event_config *cfg);

// 旧版本兼容
struct event_base *event_init(void);

// 释放
void event_base_free(struct event_base *base);
```

### 5.1.1 event_base_new 源码解析

`event_base_new` 函数的核心实现流程：

```c
struct event_base *event_base_new(void) {
    struct event_config *cfg = event_config_new();
    struct event_base *base = event_base_new_with_config(cfg);
    event_config_free(cfg);
    return base;
}

struct event_base *event_base_new_with_config(const struct event_config *cfg) {
    struct event_base *base;
    
    // 1. 分配event_base结构
    base = calloc(1, sizeof(struct event_base));
    if (!base) return NULL;
    
    // 2. 初始化基本字段
    base->evsel = NULL;
    base->evbase = NULL;
    
    // 3. 选择合适的I/O多路复用后端
    if (!event_base_choose_method(base, cfg)) {
        event_base_free(base);
        return NULL;
    }
    
    // 4. 初始化其他组件
    if (event_base_init_common_timeout_lists(base)) {
        event_base_free(base);
        return NULL;
    }
    
    // 5. 初始化信号处理
    if (evsig_init(base)) {
        event_base_free(base);
        return NULL;
    }
    
    return base;
}
```

### 5.1.2 后端选择机制

`event_base_choose_method` 函数会从 `eventops` 数组中选择最合适的后端：

```c
static int event_base_choose_method(struct event_base *base, const struct event_config *cfg) {
    const struct eventop *best_method = NULL;
    int best_priority = 0;
    
    // 遍历所有可用的后端
    for (const struct eventop **method = eventops; *method; method++) {
        // 检查是否满足配置要求
        if (!event_config_is_method_disabled(cfg, (*method)->name)) {
            // 选择优先级最高的方法
            if (!best_method || (*method)->features > best_priority) {
                best_method = *method;
                best_priority = (*method)->features;
            }
        }
    }
    
    if (!best_method) return 0;
    
    // 初始化选中的后端
    base->evsel = best_method;
    base->evbase = base->evsel->init(base);
    
    return 1;
}
```

### 5.1.3 后端优先级

| 后端 | 优先级 | 特性 |
|------|--------|------|
| epoll | 最高 | EV_FEATURE_ETEV_FEATURE_O1EV_FEATURE_EARLY_CLOSE |
| kqueue | 高 | EV_FEATURE_ETEV_FEATURE_O1EV_FEATURE_EARLY_CLOSE |
| poll | 中 | 基本功能 |
| select | 低 | 基本功能 |

### 5.1.4 创建流程图示

```
┌─────────────────────────────────────────────────────┐
│                event_base_new()                   │
├─────────────────────────────────────────────────────┤
│ 1. 创建event_config                               │
│ 2. 调用event_base_new_with_config()               │
│    ├─ 分配event_base结构                          │
│    ├─ 选择I/O多路复用后端                         │
│    │  ├─ 遍历eventops数组                        │
│    │  ├─ 检查配置要求                            │
│    │  └─ 选择优先级最高的方法                      │
│    ├─ 初始化后端                                  │
│    ├─ 初始化通用超时列表                          │
│    └─ 初始化信号处理                              │
│ 3. 释放event_config                              │
│ 4. 返回event_base指针                             │
└─────────────────────────────────────────────────────┘
```

`event_base_new` 从全局变量 `eventops` 中选出操作系统支持的最快方法：

```c
static const struct eventop *eventops[] = {
#ifdef EVENT__HAVE_EVENT_PORTS
    &evportops,
#endif
#ifdef EVENT__HAVE_WORKING_KQUEUE
    &kqops,
#endif
#ifdef EVENT__HAVE_EPOLL
    &epollops,
#endif
#ifdef EVENT__HAVE_DEVPOLL
    &devpollops,
#endif
#ifdef EVENT__HAVE_POLL
    &pollops,
#endif
#ifdef EVENT__HAVE_SELECT
    &selectops,
#endif
#ifdef _WIN32
    &win32ops,
#endif
    NULL
};
```

### 5.2 运行事件循环

```c
/* 阻塞等待事件的到来，如果列表中没有事件，或者事件中调用
   event_base_loopbreak() 或者 event_base_loopexit()，此函数将会退出阻塞 */
int event_base_dispatch(struct event_base *base);

/* 更细粒度控制的事件循环 */
int event_base_loop(struct event_base *base, int flags);
```

#### 5.2.1 event_base_loop 源码解析

`event_base_loop` 函数是事件循环的核心实现：

```c
int event_base_loop(struct event_base *base, int flags) {
    int res, done;
    struct timeval tv;
    struct timeval *tv_p;
    
    // 检查是否已经在运行
    if (base->running_loop) {
        return -1;
    }
    
    base->running_loop = 1;
    done = 0;
    
    while (!done) {
        // 1. 计算超时时间
        tv_p = &tv;
        if (!N_ACTIVE_CALLBACKS(base) && !(flags & EVLOOP_NONBLOCK)) {
            timeout = event_base_get_next_timeout(base, &tv);
        } else {
            // 如果有活跃回调或非阻塞模式，不等待
            evutil_timerclear(&tv);
        }
        
        // 2. 处理待处理的事件变更
        if (base->changelist) {
            event_process_changelist(base);
        }
        
        // 3. 调用后端的dispatch方法
        res = base->evsel->dispatch(base, tv_p);
        
        // 4. 处理定时器事件
        event_process_active(base);
        
        // 5. 检查是否需要退出
        if (base->event_gotterm) {
            done = 1;
        } else if (base->event_break) {
            done = 1;
        } else if ((flags & EVLOOP_ONCE) && !N_ACTIVE_CALLBACKS(base)) {
            done = 1;
        } else if ((flags & EVLOOP_NONBLOCK) && !N_ACTIVE_CALLBACKS(base)) {
            done = 1;
        }
    }
    
    base->running_loop = 0;
    return 0;
}
```

#### 5.2.2 事件循环流程

1. **计算超时时间**：根据定时器事件计算下次超时时间
2. **处理事件变更**：应用之前积累的事件添加/删除操作
3. **等待事件**：调用后端的dispatch方法等待事件触发
4. **处理活跃事件**：执行触发的事件回调
5. **检查退出条件**：根据标志和状态决定是否退出循环

#### 5.2.3 事件循环图示

```
┌─────────────────────────────────────────────────────┐
│             event_base_loop()                     │
├─────────────────────────────────────────────────────┤
│ 1. 检查是否已在运行                               │
│ 2. 进入主循环                                     │
│    ├─ 计算下次超时时间                             │
│    ├─ 处理待处理的事件变更                          │
│    ├─ 调用后端dispatch等待事件                      │
│    ├─ 处理定时器事件                                │
│    ├─ 处理活跃事件                                  │
│    └─ 检查退出条件                                  │
│ 3. 退出循环                                        │
└─────────────────────────────────────────────────────┘
```

#### 循环标志

```c
#define EVLOOP_ONCE            0x01  // 触发一次后退出
#define EVLOOP_NONBLOCK        0x02  // 非阻塞模式
#define EVLOOP_NO_EXIT_ON_EMPTY 0x04 // 无事件时不退出
```

### 5.3 停止事件循环

```c
/* 让 event_base 在给定时间之后停止循环
   如果tv参数NULL，event_base会立即停止循环 */
int event_base_loopexit(struct event_base *base, const struct timeval *tv);

/* event_base 立即退出循环，不会等待正在执行的事件完成 */
int event_base_loopbreak(struct event_base *base);

/* 检查退出原因 */
int event_base_got_exit(struct event_base *base);  // 因为loopexit退出
int event_base_got_break(struct event_base *base); // 因为loopbreak退出

/* 如果事件处理完后loop会退出，在回调中执行此函数则loop不会退出 */
int event_base_loopcontinue(struct event_base *base);
```

### 5.4 获取event_base信息

```c
/* 获取Libevent使用的内核I/O复用机制 */
const char *event_base_get_method(const struct event_base *base);

/* 获取支持的方法列表 */
const char **event_get_supported_methods(void);

/* 获取事件数量 */
int event_base_get_num_events(struct event_base *base, unsigned int type);
// type: EVENT_BASE_COUNT_ACTIVE, EVENT_BASE_COUNT_VIRTUAL, EVENT_BASE_COUNT_ADDED

/* 获取最大事件数量 */
int event_base_get_max_events(struct event_base *base, unsigned int type, int clear);
```

## 六、event_config配置

```c
struct event_config *event_config_new(void);
void event_config_free(struct event_config *cfg);

/* 设置不使用指定的I/O复用机制 */
int event_config_avoid_method(struct event_config *cfg, const char *method);
```

### 6.1 特性设置

```c
enum event_method_feature {
    EV_FEATURE_ET = 0x01,          // 要求支持边沿触发
    EV_FEATURE_O1 = 0x02,          // 要求O(1)复杂度
    EV_FEATURE_FDS = 0x04,         // 要求支持任意文件描述符
    EV_FEATURE_EARLY_CLOSE = 0x08  // 要求支持EV_CLOSED
};

int event_config_require_features(struct event_config *cfg, int feature);
int event_base_get_features(const struct event_base *base);
```

### 6.2 标志设置

```c
enum event_base_config_flag {
    EVENT_BASE_FLAG_NOLOCK = 0x01,              // 不分配锁
    EVENT_BASE_FLAG_IGNORE_ENV = 0x02,          // 忽略环境变量
    EVENT_BASE_FLAG_STARTUP_IOCP = 0x04,        // Windows IOCP
    EVENT_BASE_FLAG_NO_CACHE_TIME = 0x08,       // 不缓存时间
    EVENT_BASE_FLAG_EPOLL_USE_CHANGELIST = 0x10,// 使用epoll changelist
    EVENT_BASE_FLAG_PRECISE_TIMER = 0x20        // 精确计时器
};

int event_config_set_flag(struct event_config *cfg, int flag);
```

## 七、使用示例

```c
#include <stdio.h>
#include <event2/event.h>

int main() {
    // 简单创建
    struct event_base *base = event_base_new();
    
    // 带配置创建
    struct event_config *cfg = event_config_new();
    event_config_require_features(cfg, EV_FEATURE_ET | EV_FEATURE_O1);
    event_config_avoid_method(cfg, "select");
    struct event_base *base2 = event_base_new_with_config(cfg);
    event_config_free(cfg);
    
    printf("Using method: %s\n", event_base_get_method(base));
    
    event_base_free(base);
    event_base_free(base2);
    return 0;
}
```

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
