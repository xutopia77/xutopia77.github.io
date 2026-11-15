---
title: "\U0001F441️ watch模块 - libevent源码深度解析系列（十六）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 👁️ watch模块

## 一、概述

libevent的watch模块提供了在事件循环的不同阶段执行回调的能力。这对于监控、调试或在特定时机执行操作非常有用。

## 二、watch回调类型

| 回调类型 | 触发时机 |
|----------|----------|
| **prepare** | 在调用I/O复用机制（如epoll_wait）之前 |
| **check** | 在I/O复用机制返回之后，处理活跃事件之前 |
| **fork** | 在fork子进程之后 |

## 三、API

### 3.1 添加watch回调

```c
/* 添加prepare回调
 * 在每次调用I/O复用机制之前执行
 */
int event_base_add_virtual_event_(struct event_base *base, struct event *ev);

/* 添加check回调
 * 在I/O复用机制返回之后执行
 */
int event_base_add_virtual_event_(struct event_base *base, struct event *ev);
```

### 3.2 结构体

```c
struct evwatch {
    struct event_base *base;
    struct evwatch_callback callback;
    void *arg;
    TAILQ_ENTRY(evwatch) next;
};

typedef void (*evwatch_callback)(struct evwatch *, const struct evwatch_callbacks *, void *);
```

## 四、使用示例

### 4.1 监控事件循环

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <event2/event.h>

static int loop_count = 0;
static struct timeval last_time;

static void prepare_cb(struct evwatch *watcher, const struct evwatch_callbacks *cbs, void *arg) {
    struct timeval now;
    evutil_gettimeofday(&now, NULL);
    
    printf("[PREPARE] Loop iteration %d\n", loop_count);
    
    // 计算距离上次循环的时间
    if (last_time.tv_sec != 0) {
        long diff = (now.tv_sec - last_time.tv_sec) * 1000000 + 
                    (now.tv_usec - last_time.tv_usec);
        printf("[PREPARE] Time since last loop: %ld us\n", diff);
    }
    
    last_time = now;
}

static void check_cb(struct evwatch *watcher, const struct evwatch_callbacks *cbs, void *arg) {
    struct event_base *base = arg;
    
    int active_count = event_base_get_num_events(base, EVENT_BASE_COUNT_ACTIVE);
    int total_count = event_base_get_num_events(base, EVENT_BASE_COUNT_ADDED);
    
    printf("[CHECK] Active events: %d, Total events: %d\n", active_count, total_count);
    
    loop_count++;
}

static void timer_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer fired!\n");
}

int main() {
    struct event_base *base = event_base_new();
    
    // 添加watch回调
    struct evwatch *prepare_watcher = evwatch_prepare_new(base, prepare_cb, NULL);
    struct evwatch *check_watcher = evwatch_check_new(base, check_cb, base);
    
    // 创建定时器
    struct event *timer = event_new(base, -1, EV_PERSIST, timer_cb, NULL);
    struct timeval tv = {1, 0};
    event_add(timer, &tv);
    
    // 5秒后退出
    struct timeval exit_tv = {5, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    evwatch_free(prepare_watcher);
    evwatch_free(check_watcher);
    event_free(timer);
    event_base_free(base);
    
    printf("Total loop iterations: %d\n", loop_count);
    return 0;
}
```

### 4.2 性能监控

```c
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <event2/event.h>

struct perf_stats {
    long total_loops;
    long total_events;
    long max_latency;
    struct timeval last_prepare;
};

static void prepare_cb(struct evwatch *watcher, const struct evwatch_callbacks *cbs, void *arg) {
    struct perf_stats *stats = arg;
    evutil_gettimeofday(&stats->last_prepare, NULL);
}

static void check_cb(struct evwatch *watcher, const struct evwatch_callbacks *cbs, void *arg) {
    struct perf_stats *stats = arg;
    struct event_base *base = evwatch_get_base(watcher);
    
    struct timeval now;
    evutil_gettimeofday(&now, NULL);
    
    // 计算I/O复用耗时
    long latency = (now.tv_sec - stats->last_prepare.tv_sec) * 1000000 +
                   (now.tv_usec - stats->last_prepare.tv_usec);
    
    if (latency > stats->max_latency) {
        stats->max_latency = latency;
    }
    
    stats->total_loops++;
    stats->total_events += event_base_get_num_events(base, EVENT_BASE_COUNT_ACTIVE);
}

int main() {
    struct event_base *base = event_base_new();
    
    struct perf_stats stats = {0};
    
    struct evwatch *prepare = evwatch_prepare_new(base, prepare_cb, &stats);
    struct evwatch *check = evwatch_check_new(base, check_cb, &stats);
    
    // 创建一些事件
    struct event *timer = event_new(base, -1, EV_PERSIST, 
        [](evutil_socket_t fd, short events, void *arg) {}, NULL);
    struct timeval tv = {0, 100000};  // 100ms
    event_add(timer, &tv);
    
    // 运行10秒
    struct timeval exit_tv = {10, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    printf("Performance Statistics:\n");
    printf("  Total loops: %ld\n", stats.total_loops);
    printf("  Total events processed: %ld\n", stats.total_events);
    printf("  Max I/O latency: %ld us\n", stats.max_latency);
    printf("  Avg events per loop: %.2f\n", 
           (double)stats.total_events / stats.total_loops);
    
    evwatch_free(prepare);
    evwatch_free(check);
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

## 五、实际应用场景

| 场景 | 说明 |
|------|------|
| **性能监控** | 统计事件循环次数、延迟等指标 |
| **调试** | 在关键点打印调试信息 |
| **资源管理** | 在循环前后检查资源状态 |
| **心跳检测** | 检测事件循环是否正常运行 |
| **动态调整** | 根据负载动态调整参数 |

## 六、注意事项

| 注意事项 | 说明 |
|----------|------|
| **回调效率** | watch回调在每次循环都会执行，应尽量高效 |
| **避免阻塞** | 回调中不应执行阻塞操作 |
| **资源释放** | 使用evwatch_free释放watcher |
| **线程安全** | 多线程环境下需要加锁保护 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
