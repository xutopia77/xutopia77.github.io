---
title: "\U0001F4C1 源码文件组织 - libevent源码深度解析系列（三）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 📁 源码文件组织

## 一、源码目录结构

`libevent` 源码目录结构如下所示：

```
libevent/
├── include/                # 包含头文件
│   ├── event2/
│   │   ├── event.h         # 核心API头文件
│   │   ├── event-config.h  # 配置宏定义
│   │   ├── bufferevent.h   # 缓冲事件
│   │   ├── buffer.h        # 缓冲区
│   │   ├── http.h          # HTTP支持
│   │   ├── dns.h           # DNS支持
│   │   ├── rpc.h           # RPC支持
│   │   └── util.h          # 工具函数
│   └── event.h             # 旧版本兼容头文件
├── src/                    # 源代码文件
│   ├── event.c             # 事件核心实现
│   ├── evmap.c             # 事件映射
│   ├── evthread.c          # 线程支持
│   ├── evutil.c            # 工具函数
│   ├── buffer.c            # 缓冲区实现
│   ├── bufferevent.c       # 缓冲事件实现
│   ├── http.c              # HTTP实现
│   ├── evdns.c             # DNS实现
│   ├── evrpc.c             # RPC实现
│   └── ...
├── test/                   # 测试代码
├── sample/                 # 示例代码
├── configure               # 自动配置脚本
├── Makefile                # 编译规则
└── README                  # 项目说明文档
```

## 二、头文件分类

新版本使用的头文件是在 `include/event2` 文件夹中，但是旧版本的头文件仍然存在。

| 新版本头文件 | 旧版本头文件 |
|-------------|-------------|
| event2/event*.h, event2/buffer*.h, event2/bufferevent*.h, event2/tag*.h | event.h |
| event2/dns*.h | evdns.h |
| event2/rpc*.h | evrpc.h |
| event2/http*.h | evhttp.h |
| event2/util*.h | evutil.h |

## 三、源码文件分类

### 3.1 I/O多路复用机制封装

| 文件 | 说明 |
|------|------|
| epoll.c | 对linux I/O复用机制 epoll 的封装 |
| select.c | 对 linux I/O复用机制 select 的封装 |
| poll.c | 对 linux I/O复用机制 poll 的封装 |
| devpoll.c | 对 dev/poll 的封装 |
| kqueue.c | 对 kqueue 的封装 |
| evport.c | Solaris 10 的新增加的特性 |

### 3.2 基本数据结构

`compat/sys` 下的两个源文件：`queue.h` 是 libevent 基本数据结构的实现，包括链表，双向链表，队列等。

### 3.3 信号管理

`signal.c`：对信号事件的处理。

### 3.4 辅助功能函数

| 文件 | 说明 |
|------|------|
| evutil.c | 一些辅助功能函数，包括创建 socket pair 和一些时间操作函数 |
| arc4random.c, evutil_rand.c | 随机数的封装 |
| evutil_time.c | 时间函数的封装 |

### 3.5 日志

`log.h` 和 `log.c`：log 日志函数。

### 3.6 线程

`evthread.c`、`evthread_pthread.c`、`evthread_win32.c`：对系统的线程使用的封装。

### 3.7 事件的实现与管理

| 文件 | 说明 |
|------|------|
| event.c | event 整体框架的代码实现，包含event和event_base |
| evmap.c | 将每个文件描述符或者信号映射为事件，私有函数 |

### 3.8 缓冲区管理

`bufferevent.c`、`bufferevent_async.c`、`bufferevent_filter.c`、`bufferevent_openssl.c`、`bufferevent_pair.c`、`bufferevent_ratelim.c`、`bufferevent_sock.c` 和 `buffer.c`：libevent 对缓冲区的封装。

### 3.9 定时事件管理

`min-heap.h`：其实就是一个以时间作为 key 的小根堆结构。

### 3.10 网络库

| 文件 | 说明 |
|------|------|
| evdns.c | 异步 dns 查询库 |
| http.c | http 服务器的实现 |
| evrpc.c | rpc的实现 |

## 四、官方示例

```
sample/
├── dns-example.c
├── event-read-fifo.c
├── hello-world.c
├── hostcheck.c
├── hostcheck.h
├── http-connect.c
├── https-client.c
├── http-server.c
├── le-proxy.c
├── openssl_hostname_validation.c
├── openssl_hostname_validation.h
├── signal-test.c
└── time-test.c
```

## 五、模块划分

### 5.1 事件基 (event_base)

事件基是 `libevent` 的核心组件，它负责管理事件的调度。`event_base` 提供了事件的注册、取消、启动事件循环等功能。

### 5.2 事件 (event)

事件代表了一个可以被监控的对象，如文件描述符或信号。事件可以设置为监听读、写、定时器等不同的事件类型，并且可以指定事件触发时的回调函数。

### 5.3 缓冲区 (evbuffer)

`evbuffer` 是一个灵活的缓冲区管理工具，用于在网络通信中处理数据流。

### 5.4 线程安全 (evthread)

提供了线程安全的支持，使得 `libevent` 可以在多线程环境中安全使用。

### 5.5 I/O 多路复用机制封装

`libevent` 支持多种 I/O 多路复用机制，如 epoll、kqueue、select 等。这些机制在不同操作系统上的实现略有不同，因此 `libevent` 通过条件编译选择最适合当前操作系统的实现。

## 六、跨平台兼容性

`libevent` 的设计考虑到了跨平台兼容性，因此源码中包含了许多条件编译指令来适应不同的操作系统和编译器特性。例如：

```c
#if defined(EVENT__HAVE_EPOLL)
// 使用 epoll 的实现
#elif defined(EVENT__HAVE_KQUEUE)
// 使用 kqueue 的实现
#else
// 使用 select 或其他机制的实现
#endif
```

这种条件编译允许 libevent 在不同的平台上选择最适合的事件驱动机制。

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
