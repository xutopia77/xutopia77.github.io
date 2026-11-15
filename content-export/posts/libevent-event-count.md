---
title: "\U0001F4CA 事件数量分析 - libevent源码深度解析系列（十七）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📊 事件数量分析

## 一、概述

libevent内部维护了事件数量的统计信息，这对于监控和调试非常有用。本文分析事件数量的含义和使用方法。

## 二、事件数量类型

```c
/* 事件数量类型 */
#define EVENT_BASE_COUNT_ACTIVE   0x01  // 活跃事件数量
#define EVENT_BASE_COUNT_VIRTUAL  0x02  // 虚拟事件数量
#define EVENT_BASE_COUNT_ADDED    0x04  // 已添加事件数量
```

### 2.1 各类型说明

| 类型 | 说明 |
|------|------|
| **ACTIVE** | 当前处于活跃状态的事件数量，即已触发但尚未处理的事件 |
| **VIRTUAL** | 虚拟事件数量，用于内部机制（如定时器、信号等） |
| **ADDED** | 已添加到event_base的事件总数 |

## 三、API

### 3.1 获取事件数量

```c
/**
 * 获取事件数量
 * @param base  event_base
 * @param type  事件类型（EVENT_BASE_COUNT_*的组合）
 * @return 事件数量
 */
int event_base_get_num_events(struct event_base *base, unsigned int type);

/**
 * 获取最大事件数量
 * @param base  event_base
 * @param type  事件类型
 * @param clear 是否清除最大值
 * @return 最大事件数量
 */
int event_base_get_max_events(struct event_base *base, unsigned int type, int clear);
```

## 四、event_base结构体中的计数器

```c
struct event_base {
    // ...
    int virtual_event_count;        // 虚拟事件计数
    int virtual_event_count_max;    // 虚拟事件最大计数
    
    int event_count;                // 事件总数
    int event_count_max;            // 事件最大总数
    
    int event_count_active;         // 活跃事件数
    int event_count_active_max;     // 活跃事件最大数
    // ...
};
```

## 五、事件计数更新时机

### 5.1 事件添加时

```c
int event_add_nolock_(struct event *ev, const struct timeval *tv, int tv_is_absolute) {
    struct event_base *base = ev->ev_base;
    
    // 增加事件计数
    base->event_count++;
    if (base->event_count > base->event_count_max)
        base->event_count_max = base->event_count;
    
    // 如果是定时器，增加虚拟事件计数
    if (tv != NULL) {
        base->virtual_event_count++;
        if (base->virtual_event_count > base->virtual_event_count_max)
            base->virtual_event_count_max = base->virtual_event_count;
    }
    
    // ...
}
```

### 5.2 事件删除时

```c
int event_del_nolock_(struct event *ev, int blocking) {
    struct event_base *base = ev->ev_base;
    
    // 减少事件计数
    base->event_count--;
    
    // 如果是定时器，减少虚拟事件计数
    if (ev->ev_flags & EVLIST_TIMEOUT) {
        base->virtual_event_count--;
    }
    
    // 如果在活跃队列中，减少活跃事件计数
    if (ev->ev_flags & EVLIST_ACTIVE) {
        base->event_count_active--;
    }
    
    // ...
}
```

### 5.3 事件激活时

```c
void event_active_nolock_(struct event *ev, int res, short ncalls) {
    struct event_base *base = ev->ev_base;
    
    // 增加活跃事件计数
    base->event_count_active++;
    if (base->event_count_active > base->event_count_active_max)
        base->event_count_active_max = base->event_count_active;
    
    // ...
}
```

## 六、使用示例

### 6.1 监控事件数量

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <event2/event.h>

static void print_event_stats(struct event_base *base) {
    int active = event_base_get_num_events(base, EVENT_BASE_COUNT_ACTIVE);
    int virtual = event_base_get_num_events(base, EVENT_BASE_COUNT_VIRTUAL);
    int added = event_base_get_num_events(base, EVENT_BASE_COUNT_ADDED);
    
    printf("Event Statistics:\n");
    printf("  Active events: %d\n", active);
    printf("  Virtual events: %d\n", virtual);
    printf("  Total added events: %d\n", added);
}

static void timer_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    static int count = 0;
    
    count++;
    printf("Timer %d fired\n", count);
    print_event_stats(base);
    
    if (count >= 5) {
        event_base_loopexit(base, NULL);
    }
}

int main() {
    struct event_base *base = event_base_new();
    
    printf("Initial state:\n");
    print_event_stats(base);
    
    // 创建多个定时器
    struct event *timers[3];
    for (int i = 0; i < 3; i++) {
        timers[i] = event_new(base, -1, EV_PERSIST, timer_cb, base);
        struct timeval tv = {i + 1, 0};
        event_add(timers[i], &tv);
    }
    
    printf("\nAfter adding timers:\n");
    print_event_stats(base);
    
    event_base_dispatch(base);
    
    printf("\nFinal state:\n");
    print_event_stats(base);
    
    for (int i = 0; i < 3; i++) {
        event_free(timers[i]);
    }
    event_base_free(base);
    
    return 0;
}
```

### 6.2 性能监控

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <event2/event.h>

struct monitor_data {
    struct event_base *base;
    int check_interval;
};

static void monitor_cb(evutil_socket_t fd, short events, void *arg) {
    struct monitor_data *data = arg;
    
    int active = event_base_get_num_events(data->base, EVENT_BASE_COUNT_ACTIVE);
    int added = event_base_get_num_events(data->base, EVENT_BASE_COUNT_ADDED);
    int max_active = event_base_get_max_events(data->base, EVENT_BASE_COUNT_ACTIVE, 0);
    
    printf("[Monitor] Active: %d, Added: %d, Max Active: %d\n", 
           active, added, max_active);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建监控定时器
    struct monitor_data data = {base, 1};
    struct event *monitor = event_new(base, -1, EV_PERSIST, monitor_cb, &data);
    struct timeval tv = {1, 0};
    event_add(monitor, &tv);
    
    // 创建一些工作定时器
    for (int i = 0; i < 5; i++) {
        struct event *ev = event_new(base, -1, EV_PERSIST, 
            [](evutil_socket_t fd, short events, void *arg) {}, NULL);
        struct timeval t = {0, (i + 1) * 200000};
        event_add(ev, &t);
    }
    
    // 运行10秒
    struct timeval exit_tv = {10, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    event_free(monitor);
    event_base_free(base);
    
    return 0;
}
```

## 七、虚拟事件详解

虚拟事件是libevent内部使用的事件，主要用于：

| 类型 | 说明 |
|------|------|
| **定时器** | 每个定时器都是一个虚拟事件 |
| **信号** | 信号处理使用虚拟事件 |
| **内部通知** | 线程间通信等内部机制 |

### 7.1 虚拟事件计数

```c
// 定时器添加时
event_count_added = 1
virtual_event_count = 1

// 定时器触发时
event_count_active = 1

// 定时器回调执行后（非EV_PERSIST）
event_count_added = 0
virtual_event_count = 0
event_count_active = 0
```

## 八、最佳实践

| 建议 | 说明 |
|------|------|
| **定期监控** | 在生产环境中定期检查事件数量 |
| **设置阈值** | 设置合理的最大事件数阈值 |
| **资源预警** | 事件数量异常时发出警告 |
| **调试辅助** | 使用事件数量帮助调试内存泄漏 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
