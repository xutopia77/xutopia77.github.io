---
title: ⏰ 定时器使用 - libevent源码深度解析系列（十二）
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# ⏰ 定时器使用

## 一、概述

libevent提供了定时器功能，允许在指定的时间后执行回调函数。定时器可以是一次性的，也可以是周期性的。

## 二、定时器API

### 2.1 创建定时器

```c
/* 创建定时器事件（宏定义）
 * @param base  event_base
 * @param cb    回调函数
 * @param arg   回调参数
 */
#define evtimer_new(base, cb, arg) event_new((base), -1, 0, (cb), (arg))

/* 分配定时器到现有结构体 */
#define evtimer_assign(ev, base, cb, arg) \
    event_assign((ev), (base), -1, 0, (cb), (arg))
```

### 2.2 添加和删除

```c
/* 添加定时器
 * @param tv 超时时间，NULL表示永不超时
 */
#define evtimer_add(ev, tv) event_add((ev), (tv))

/* 删除定时器 */
#define evtimer_del(ev) event_del(ev)
```

### 2.3 检查状态

```c
/* 检查定时器是否pending */
#define evtimer_pending(ev, tv) event_pending((ev), EV_TIMEOUT, (tv))

/* 检查定时器是否已初始化 */
#define evtimer_initialized(ev) event_initialized(ev)
```

## 三、时间结构体

```c
struct timeval {
    time_t      tv_sec;   // 秒
    suseconds_t tv_usec;  // 微秒
};

/* 辅助宏 */
#define EVUTIL_SEC_TO_USEC(sec) ((sec) * 1000000)
```

## 四、基本示例

### 4.1 一次性定时器

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>

static void timer_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer fired!\n");
    
    // 事件循环会自动退出，因为没有其他事件
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建一次性定时器（不带EV_PERSIST）
    struct event *timer = evtimer_new(base, timer_cb, NULL);
    
    // 设置3秒后触发
    struct timeval tv = {3, 0};
    evtimer_add(timer, &tv);
    
    printf("Timer set for 3 seconds...\n");
    
    event_base_dispatch(base);
    
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

### 4.2 周期性定时器

```c
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <event2/event.h>

static int counter = 0;

static void timer_cb(evutil_socket_t fd, short events, void *arg) {
    counter++;
    printf("Timer fired! Count: %d\n", counter);
    
    if (counter >= 5) {
        printf("Reached 5 ticks, exiting...\n");
        struct event_base *base = arg;
        event_base_loopexit(base, NULL);
    }
}

static void signal_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = arg;
    printf("Caught signal, exiting...\n");
    event_base_loopexit(base, NULL);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 创建周期性定时器（带EV_PERSIST）
    struct event *timer = event_new(base, -1, EV_PERSIST, timer_cb, base);
    
    // 设置每1秒触发一次
    struct timeval tv = {1, 0};
    event_add(timer, &tv);
    
    // 信号处理
    struct event *sig = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(sig, NULL);
    
    printf("Periodic timer started (1 second interval)\n");
    printf("Press Ctrl+C to exit\n");
    
    event_base_dispatch(base);
    
    event_free(sig);
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

## 五、高级用法

### 5.1 精确定时器

```c
#include <stdio.h>
#include <event2/event.h>

static void precise_timer_cb(evutil_socket_t fd, short events, void *arg) {
    struct timeval now;
    evutil_gettimeofday(&now, NULL);
    
    printf("Timer at %ld.%06ld\n", now.tv_sec, now.tv_usec);
}

int main() {
    struct event_config *cfg = event_config_new();
    event_config_set_flag(cfg, EVENT_BASE_FLAG_PRECISE_TIMER);
    
    struct event_base *base = event_base_new_with_config(cfg);
    event_config_free(cfg);
    
    struct event *timer = event_new(base, -1, EV_PERSIST, precise_timer_cb, NULL);
    
    // 每100毫秒触发
    struct timeval tv = {0, 100000};
    event_add(timer, &tv);
    
    // 5秒后退出
    struct timeval exit_tv = {5, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

### 5.2 多个定时器

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>

static void timer1_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer 1: 1 second\n");
}

static void timer2_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer 2: 2 seconds\n");
}

static void timer3_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Timer 3: 3 seconds\n");
}

static void exit_cb(evutil_socket_t fd, short events, void *arg) {
    printf("Exit timer: exiting...\n");
    struct event_base *base = arg;
    event_base_loopexit(base, NULL);
}

int main() {
    struct event_base *base = event_base_new();
    
    struct event *t1 = event_new(base, -1, EV_PERSIST, timer1_cb, NULL);
    struct event *t2 = event_new(base, -1, EV_PERSIST, timer2_cb, NULL);
    struct event *t3 = event_new(base, -1, EV_PERSIST, timer3_cb, NULL);
    struct event *exit_timer = evtimer_new(base, exit_cb, base);
    
    struct timeval tv1 = {1, 0};
    struct timeval tv2 = {2, 0};
    struct timeval tv3 = {3, 0};
    struct timeval tv_exit = {10, 0};
    
    event_add(t1, &tv1);
    event_add(t2, &tv2);
    event_add(t3, &tv3);
    event_add(exit_timer, &tv_exit);
    
    printf("Multiple timers started, will run for 10 seconds...\n");
    
    event_base_dispatch(base);
    
    event_free(t1);
    event_free(t2);
    event_free(t3);
    event_free(exit_timer);
    event_base_free(base);
    
    return 0;
}
```

### 5.3 动态调整定时器

```c
#include <stdio.h>
#include <stdlib.h>
#include <event2/event.h>

static int interval = 1;

static void dynamic_timer_cb(evutil_socket_t fd, short events, void *arg) {
    struct event *timer = arg;
    
    printf("Timer fired with interval %d second(s)\n", interval);
    
    // 动态调整间隔
    interval++;
    if (interval > 5) {
        interval = 1;
    }
    
    // 重新设置定时器
    struct timeval tv = {interval, 0};
    event_add(timer, &tv);
}

int main() {
    struct event_base *base = event_base_new();
    
    // 注意：不带EV_PERSIST，手动重新添加
    struct event *timer = event_new(base, -1, 0, dynamic_timer_cb, NULL);
    
    // 设置回调参数为timer本身
    event_assign(event_get_assignment(timer, &base, NULL, NULL, NULL, NULL),
                 base, -1, 0, dynamic_timer_cb, timer);
    
    struct timeval tv = {interval, 0};
    event_add(timer, &tv);
    
    // 20秒后退出
    struct timeval exit_tv = {20, 0};
    event_base_loopexit(base, &exit_tv);
    
    event_base_dispatch(base);
    
    event_free(timer);
    event_base_free(base);
    
    return 0;
}
```

## 六、定时器精度

| 因素 | 影响 |
|------|------|
| **系统时钟精度** | 通常为毫秒级 |
| **事件循环负载** | 高负载可能导致延迟 |
| **回调执行时间** | 长时间回调影响后续定时器 |
| **EVENT_BASE_FLAG_PRECISE_TIMER** | 启用高精度定时器 |

## 七、最佳实践

| 建议 | 说明 |
|------|------|
| **避免阻塞回调** | 回调函数应尽快返回 |
| **合理设置间隔** | 避免过于频繁的定时器 |
| **使用EV_PERSIST** | 周期性定时器使用EV_PERSIST更高效 |
| **及时清理** | 不再使用的定时器应及时删除 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
