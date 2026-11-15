---
title: "\U0001F3AD event详解 - libevent源码深度解析系列（六）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📦 event详解

## 一、概述

event是libevent的基本单元。事件添加到event_base中之后，如果触发条件发生（例如，文件描述符的状态发生改变、时间超时等），则事件就会被激活，然后事件中的回调函数就会被执行。如果事件被配置为了持久形的（EV_PERSIST），那么事件仍然在event_base中，继续等待下一次的条件被触发，否则事件就会从event_base中删除。

## 二、event结构体

```c
struct event {
    // 外部操作ev_evcallback时，是基于宏定义操作的
    #define ev_pri ev_evcallback.evcb_pri
    #define ev_flags ev_evcallback.evcb_flags
    #define ev_closure ev_evcallback.evcb_closure
    #define ev_callback ev_evcallback.evcb_cb_union.evcb_callback
    #define ev_arg ev_evcallback.evcb_arg
    struct event_callback ev_evcallback;

    /* for managing timeouts */
    union {
        TAILQ_ENTRY(event) ev_next_with_common_timeout;
        int min_heap_idx;
    } ev_timeout_pos;
    
    evutil_socket_t ev_fd;      // 文件句柄
    struct event_base *ev_base;

    union {
        /* used for io events */
        struct {
            LIST_ENTRY (event) ev_io_next;
            struct timeval ev_timeout;
        } ev_io;

        /* used by signal events */
        struct {
            LIST_ENTRY (event) ev_signal_next;
            short ev_ncalls;
            short *ev_pncalls;
        } ev_signal;
    } ev_;

    short ev_events;            // 事件集合
    struct timeval ev_timeout;
};
```

## 三、事件的创建

### 3.1 回调函数类型

```c
/**
 * @param fd    An fd or signal
 * @param events One or more EV_* flags
 * @param arg   A user-supplied argument
 */
typedef void (*event_callback_fn)(evutil_socket_t, short, void *);
```

### 3.2 创建函数

```c
/* 创建通用事件处理器
 * @param base     指定新创建的事件处理器从属的Reactor
 * @param fd       指定与事件处理器关联的句柄。创建I/O事件处理器时，传递文件描述符；
 *                 创建信号事件处理器时，传递信号值；创建定时事件处理器时传递-1
 * @param events   指定事件类型，详细见EV_XXX
 * @param cb       指定目标事件对应的回调函数
 * @param arg      Reactor传递给回调函数的参数
 */
struct event *event_new(struct event_base *, evutil_socket_t, short, 
                        event_callback_fn, void *);

/* 设置event参数，函数内部同时会设置事件的base */
void event_set(struct event *, evutil_socket_t, short, 
               void (*)(evutil_socket_t, short, void *), void *);

/* 同时设置事件的event_base
 * 不要对已经在event_base中的事件调用event_assign()，这可能会导致错误
 * 如果已经添加进来了，需要调用event_assign()之前先调用event_del()
 */
int event_assign(struct event* event, struct event_base * base,
                 evutil_socket_t fd, short what,
                 void (*callback)(evutil_socket_t, short, void*), void * arg);

/* 释放事件资源 */
void event_free(struct event *);

/* 返回sizeof(struct event) */
size_t event_get_struct_event_size(void);
```

### 3.3 添加和删除事件

```c
/* 如果 tv 为 NULL，添加的事件不会超时。否则，tv以秒和微秒指定超时值 */
int event_add(struct event* ev, const struct timeval * tv);
int event_del(struct event* ev);
int event_remove_timer(struct event* ev);
```

## 四、事件的信息获取

```c
// 获取信号事件的信号值
#define event_get_signal(ev) ((int)event_get_fd(ev))

// 获取信号事件的信号值，或者IO事件的描述符
evutil_socket_t event_get_fd(const struct event *ev);

// 获取事件所属的event_base
struct event_base *event_get_base(const struct event *ev);

// 获取事件类型（EV_READ, EV_WRITE等）
short event_get_events(const struct event *ev);

// 获取回调函数
event_callback_fn event_get_callback(const struct event *ev);

// 获取回调参数
void *event_get_callback_arg(const struct event *ev);

// 获取libevent版本
const char *event_get_version(void);
ev_uint32_t event_get_version_number(void);

// 检测事件是否被初始化
int event_initialized(const struct event *ev);

/* 检测事件是否处于pending状态
 * @param ev      事件
 * @param events  请求的事件类型：EV_TIMEOUT|EV_READ|EV_WRITE|EV_SIGNAL
 * @param tv      如果不为NULL，且事件有超时，设置超时时间
 * @return        如果事件pending返回true，否则返回0
 */
int event_pending(const struct event *ev, short events, struct timeval *tv);

/* 提取一个给定事件的所有参数 */
void event_get_assignment(const struct event *event,
    struct event_base **base_out, evutil_socket_t *fd_out, short *events_out,
    event_callback_fn *callback_out, void **arg_out);

/* 获取当前正在运行的事件，线程不安全 */
struct event* event_base_get_running_event(struct event_base * base);
```

## 五、手动激活事件

```c
/* EV_READ、EV_WRITE、EV_TIMEOUT的组合 */
void event_active(struct event* ev, int what, short ncalls);
```

**注意**：尽量不要在事件回调本身里激活自身，否则会一直循环激活。

## 六、定时器事件

```c
/**
 * @name evtimer_* macros
 * Aliases for working with one-shot timer events
 * If you need EV_PERSIST timer use event_*() functions.
 */
#define evtimer_assign(ev, b, cb, arg) \
    event_assign((ev), (b), -1, 0, (cb), (arg))
#define evtimer_new(b, cb, arg)        event_new((b), -1, 0, (cb), (arg))
#define evtimer_add(ev, tv)            event_add((ev), (tv))
#define evtimer_del(ev)                event_del(ev)
#define evtimer_pending(ev, tv)        event_pending((ev), EV_TIMEOUT, (tv))
#define evtimer_initialized(ev)        event_initialized(ev)
```

## 七、信号事件

```c
/**
 * @name evsignal_* macros
 * Aliases for working with signal events
 */
#define evsignal_add(ev, tv)           event_add((ev), (tv))
#define evsignal_assign(ev, b, x, cb, arg) \
    event_assign((ev), (b), (x), EV_SIGNAL|EV_PERSIST, cb, (arg))
#define evsignal_new(b, x, cb, arg) \
    event_new((b), (x), EV_SIGNAL|EV_PERSIST, (cb), (arg))
#define evsignal_del(ev)               event_del(ev)
#define evsignal_pending(ev, tv)       event_pending((ev), EV_SIGNAL, (tv))
#define evsignal_initialized(ev)       event_initialized(ev)
```

### 使用信号时的注意事项

当前版本的信号大多数运行在后台，每个进程只能有一个event_base可以同时监控信号，如果同时添加两个event到event_base，即使信号是不同的，也只会有一个event_base会接收到信号。

## 八、事件优先级

当多个event同时触发，libevent并没有定义回调函数执行要遵循的任何顺序。可以用优先级来决定当多个事件同时发生时的回调函数执行顺序。

默认情况下，Libevent为所有事件分配中间优先级，除非它们的优先级被明确设置。

```c
int event_priority_set(struct event* event, int priority);
int event_get_priority(const struct event *ev);

/** Largest number of priorities that Libevent can support. */
#define EVENT_MAX_PRIORITIES 256

/* 设置优先级的最大数量 */
int event_base_priority_init(struct event_base *, int);

/* 获取优先级的最大数量 */
int event_base_get_npriorities(struct event_base *eb);
```

## 九、事件的生命周期

事件的生命周期包括创建、添加、触发、移除和销毁等阶段：

1. **创建**：通过 `event_new` 或 `event_assign` 创建事件
2. **添加**：通过 `event_add` 将事件添加到事件基中
3. **触发**：事件条件满足时，`libevent` 自动调用回调函数，也可以通过 `event_active` 手动触发
4. **移除**：通过 `event_del` 将事件从事件基中移除
5. **销毁**：通过 `event_free` 销毁事件

## 十、使用示例

### 10.1 基本事件使用

```c
#include <stdio.h>
#include <event.h>

void callback(evutil_socket_t fd, short events, void *arg) {
    printf("Event triggered, events=%d\n", events);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建事件
    struct event *ev = event_new(base, -1, EV_TIMEOUT, callback, NULL);
    
    // 添加事件，1秒后触发
    struct timeval tv = {1, 0};
    event_add(ev, &tv);
    
    // 开始事件循环
    event_base_dispatch(base);
    
    // 清理
    event_free(ev);
    event_base_free(base);
    return 0;
}
```

### 10.2 持久事件

```c
#include <stdio.h>
#include <event.h>

void callback(evutil_socket_t fd, short events, void *arg) {
    printf("Persistent event triggered\n");
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建持久事件
    struct event *ev = event_new(base, -1, EV_TIMEOUT | EV_PERSIST, callback, NULL);
    
    struct timeval tv = {1, 0};  // 每1秒触发一次
    event_add(ev, &tv);
    
    event_base_dispatch(base);
    
    event_free(ev);
    event_base_free(base);
    return 0;
}
```

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
