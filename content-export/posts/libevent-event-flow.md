---
title: "\U0001F504 事件触发流程 - libevent源码深度解析系列（十五）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔄 事件触发流程

## 一、概述

本文详细分析libevent事件触发的内部流程，从事件添加到回调执行的完整链路。

## 二、事件触发流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        事件触发流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │event_add │───>│epoll_ctl │───>│epoll_wait│───>│回调执行   │     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │加入事件   │    │注册到内核 │    │等待事件   │    │处理事件   │     │
│  │队列       │    │           │    │就绪       │    │           │     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 三、核心数据结构

### 3.1 event_base结构体关键字段

```c
struct event_base {
    const struct eventop *evsel;    // I/O复用机制（epoll/select等）
    void *evbase;                   // I/O复用机制的数据
    
    struct event_io_map io;         // fd到event的映射
    struct event_signal_map sigmap; // 信号到event的映射
    
    struct min_heap timeheap;       // 定时器小根堆
    
    struct evcallback_list *activequeues;  // 活跃事件队列
    int nactivequeues;              // 活跃队列数量
    
    int event_count;                // 事件总数
    int event_count_active;         // 活跃事件数
    // ...
};
```

### 3.2 eventop结构体

```c
struct eventop {
    const char *name;
    void *(*init)(struct event_base *);
    int (*add)(struct event_base *, evutil_socket_t fd, short old, short events, void *);
    int (*del)(struct event_base *, evutil_socket_t fd, short old, short events, void *);
    int (*dispatch)(struct event_base *, struct timeval *);
    void (*dealloc)(struct event_base *);
    int need_reinit;
    enum event_method_feature features;
    size_t fdinfo_len;
};
```

## 四、事件添加流程

### 4.1 event_add函数

```c
int event_add(struct event *ev, const struct timeval *tv) {
    struct event_base *base = ev->ev_base;
    
    // 1. 如果有超时，添加到定时器堆
    if (tv != NULL && !(ev->ev_flags & EVLIST_TIMEOUT)) {
        if (min_heap_reserve(&base->timeheap, 1) == -1)
            return -1;
        min_heap_push(&base->timeheap, ev);
    }
    
    // 2. 如果是I/O事件，添加到I/O映射
    if ((ev->ev_events & (EV_READ | EV_WRITE)) &&
        !(ev->ev_flags & (EVLIST_INSERTED | EVLIST_ACTIVE))) {
        
        // 调用底层I/O复用机制的add函数
        if (base->evsel->add(base, ev->ev_fd,
            old, ev->ev_events, ev->ev_.ev_io.ev_timeout) == -1)
            return -1;
        
        ev->ev_flags |= EVLIST_INSERTED;
    }
    
    return 0;
}
```

### 4.2 epoll_add函数

```c
static int epoll_add(struct event_base *base, int fd, 
                     short old, short events, void *p) {
    struct epoll *epollop = base->evbase;
    struct epoll_event epev;
    
    memset(&epev, 0, sizeof(epev));
    epev.data.fd = fd;
    
    if (events & EV_READ)
        epev.events |= EPOLLIN;
    if (events & EV_WRITE)
        epev.events |= EPOLLOUT;
    
    int op = old ? EPOLL_CTL_MOD : EPOLL_CTL_ADD;
    
    if (epoll_ctl(epollop->epfd, op, fd, &epev) == -1) {
        return -1;
    }
    
    return 0;
}
```

## 五、事件循环流程

### 5.1 event_base_dispatch函数

```c
int event_base_dispatch(struct event_base *base) {
    return event_base_loop(base, 0);
}
```

### 5.2 event_base_loop函数

```c
int event_base_loop(struct event_base *base, int flags) {
    while (!done) {
        // 1. 计算超时时间
        timeout = get_timeout(base);
        
        // 2. 调用I/O复用机制等待事件
        res = base->evsel->dispatch(base, timeout);
        
        // 3. 处理定时器事件
        process_timers(base);
        
        // 4. 处理活跃事件
        process_active_events(base);
        
        if (flags & EVLOOP_ONCE)
            break;
    }
    
    return 0;
}
```

### 5.3 epoll_dispatch函数

```c
static int epoll_dispatch(struct event_base *base, struct timeval *tv) {
    struct epoll *epollop = base->evbase;
    struct epoll_event events[32];
    int timeout = -1;
    
    // 计算超时时间（毫秒）
    if (tv != NULL) {
        timeout = tv->tv_sec * 1000 + tv->tv_usec / 1000;
    }
    
    // 调用epoll_wait
    int n = epoll_wait(epollop->epfd, events, 32, timeout);
    
    if (n > 0) {
        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            short what = 0;
            
            if (events[i].events & EPOLLIN)
                what |= EV_READ;
            if (events[i].events & EPOLLOUT)
                what |= EV_WRITE;
            if (events[i].events & EPOLLERR)
                what |= EV_READ | EV_WRITE;
            
            // 将事件加入活跃队列
            event_active(evmap_io_get_event(base, fd), what, 1);
        }
    }
    
    return 0;
}
```

## 六、事件激活流程

### 6.1 event_active函数

```c
void event_active(struct event *ev, int what, short ncalls) {
    struct event_base *base = ev->ev_base;
    
    // 如果已经在活跃队列中，不重复添加
    if (ev->ev_flags & EVLIST_ACTIVE)
        return;
    
    // 设置活跃事件类型
    ev->ev_.ev_io.ev_res = what;
    
    // 加入活跃队列
    ev->ev_flags |= EVLIST_ACTIVE;
    TAILQ_INSERT_TAIL(&base->activequeues[ev->ev_pri], 
                      ev->ev_.ev_io.ev_active_next);
}
```

### 6.2 process_active_events函数

```c
static void process_active_events(struct event_base *base) {
    struct event *ev;
    
    // 按优先级处理活跃事件
    for (int i = 0; i < base->nactivequeues; i++) {
        while ((ev = TAILQ_FIRST(&base->activequeues[i])) != NULL) {
            // 从活跃队列移除
            TAILQ_REMOVE(&base->activequeues[i], ev, ev_.ev_io.ev_active_next);
            ev->ev_flags &= ~EVLIST_ACTIVE;
            
            // 执行回调
            if (ev->ev_events & EV_SIGNAL) {
                ev->ev_.ev_signal.ev_ncalls = ev->ev_.ev_signal.ev_pncalls;
                while (ev->ev_.ev_signal.ev_ncalls--) {
                    ev->ev_callback(ev->ev_fd, ev->ev_.ev_signal.ev_res, ev->ev_arg);
                }
            } else {
                ev->ev_callback(ev->ev_fd, ev->ev_.ev_io.ev_res, ev->ev_arg);
            }
            
            // 如果是持久事件，重新添加
            if (ev->ev_flags & EVLIST_INSERTED) {
                // 事件仍在插入状态，如果是EV_PERSIST，保持
            }
        }
    }
}
```

## 七、完整流程图

```
┌──────────────────────────────────────────────────────────────────────┐
│                          完整事件流程                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. 初始化阶段                                                        │
│     event_base_new()                                                 │
│         │                                                            │
│         ├── 选择I/O复用机制（epoll/select/poll等）                     │
│         └── 初始化数据结构                                            │
│                                                                      │
│  2. 事件注册阶段                                                      │
│     event_new() → event_add()                                        │
│         │                                                            │
│         ├── I/O事件 → evmap_io_add → epoll_ctl(EPOLL_CTL_ADD)        │
│         ├── 定时器 → min_heap_push                                   │
│         └── 信号 → evmap_signal_add                                  │
│                                                                      │
│  3. 事件循环阶段                                                      │
│     event_base_dispatch()                                            │
│         │                                                            │
│         ┌─────────────────────────────────────────┐                  │
│         │  while (!done) {                         │                  │
│         │      1. 计算超时时间                      │                  │
│         │      2. epoll_wait() 等待事件            │                  │
│         │      3. 处理定时器超时                   │                  │
│         │      4. 处理活跃事件                     │                  │
│         │  }                                      │                  │
│         └─────────────────────────────────────────┘                  │
│                                                                      │
│  4. 事件处理阶段                                                      │
│     process_active_events()                                          │
│         │                                                            │
│         ├── 按优先级遍历活跃队列                                       │
│         ├── 取出事件                                                  │
│         └── 执行回调函数                                              │
│                                                                      │
│  5. 清理阶段                                                          │
│     event_free() → event_base_free()                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 八、性能优化点

| 优化点 | 说明 |
|--------|------|
| **epoll ET模式** | 使用边缘触发减少系统调用次数 |
| **changelist** | 批量处理事件修改，减少epoll_ctl调用 |
| **优先级队列** | 高优先级事件优先处理 |
| **时间缓存** | 避免频繁调用gettimeofday |
| **最小堆** | 高效管理定时器 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
