---
title: "\U0001F9F5 多线程编程 - libevent源码深度解析系列（十四）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🔀 多线程编程

## 一、概述

libevent本身是单线程设计，但提供了多线程支持。在多线程环境中使用libevent需要遵循特定的规则，否则会导致数据竞争和未定义行为。

## 二、多线程原则

### 2.1 基本原则

| 原则 | 说明 |
|------|------|
| **一个event_base一个线程** | 每个event_base只能在创建它的线程中使用 |
| **线程间通信** | 使用socket pair或bufferevent_pair进行线程间通信 |
| **锁保护** | 多线程共享资源需要使用锁保护 |
| **避免阻塞** | 回调函数中不要执行阻塞操作 |

### 2.2 线程安全初始化

```c
#include <event2/event.h>
#include <event2/thread.h>

int main() {
    // 初始化线程支持（必须在event_base_new之前调用）
#ifdef _WIN32
    evthread_use_windows_threads();
#else
    evthread_use_pthreads();
#endif
    
    // 现在可以创建线程安全的event_base
    struct event_config *cfg = event_config_new();
    event_config_set_flag(cfg, EVENT_BASE_FLAG_NOLOCK);  // 单线程可禁用锁提高性能
    
    struct event_base *base = event_base_new_with_config(cfg);
    event_config_free(cfg);
    
    // ...
    
    return 0;
}
```

## 三、线程API

### 3.1 线程支持初始化

```c
/* 使用pthreads（Linux/Unix） */
int evthread_use_pthreads(void);

/* 使用Windows线程 */
int evthread_use_windows_threads(void);

/* 自定义锁实现 */
int evthread_set_lock_callbacks(const struct evthread_lock_callbacks *cbs);
int evthread_set_condition_callbacks(const struct evthread_condition_callbacks *cbs);
int evthread_set_id_callback(unsigned long (*id_fn)(void));
```

### 3.2 锁回调结构体

```c
struct evthread_lock_callbacks {
    int lock_api_version;     // EVTHREAD_LOCK_API_VERSION
    unsigned supported_locktypes;  // 支持的锁类型
    void *(*alloc)(unsigned locktype);  // 分配锁
    void (*free)(void *lock, unsigned locktype);  // 释放锁
    int (*lock)(unsigned mode, void *lock);   // 加锁
    int (*unlock)(unsigned mode, void *lock); // 解锁
};

/* 锁模式 */
#define EVTHREAD_LOCK    0x01
#define EVTHREAD_TRY     0x02
#define EVTHREAD_UNLOCK  0x04

/* 锁类型 */
#define EVTHREAD_LOCKTYPE_RECURSIVE 1
#define EVTHREAD_LOCKTYPE_READWRITE 2
```

## 四、线程间通信

### 4.1 使用socket pair

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>
#include <event2/event.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>

static struct event_base *main_base = NULL;
static struct bufferevent *main_bev = NULL;

static void notify_cb(struct bufferevent *bev, void *arg) {
    struct evbuffer *input = bufferevent_get_input(bev);
    
    char buf[1024];
    size_t n;
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Received from worker: %s", buf);
    }
}

void *worker_thread(void *arg) {
    int notify_fd = *(int *)arg;
    
    // 模拟工作
    sleep(2);
    
    // 通知主线程
    const char *msg = "Work done!\n";
    write(notify_fd, msg, strlen(msg));
    
    return NULL;
}

int main() {
    evthread_use_pthreads();
    
    main_base = event_base_new();
    
    // 创建socket pair
    int pair[2];
    evutil_socketpair(AF_UNIX, SOCK_STREAM, 0, pair);
    
    // 主线程监听pair[0]
    main_bev = bufferevent_socket_new(main_base, pair[0], BEV_OPT_CLOSE_ON_FREE);
    bufferevent_setcb(main_bev, notify_cb, NULL, NULL, NULL);
    bufferevent_enable(main_bev, EV_READ);
    
    // 创建工作线程，传递pair[1]
    pthread_t tid;
    pthread_create(&tid, NULL, worker_thread, &pair[1]);
    
    // 设置5秒后退出
    struct timeval tv = {5, 0};
    event_base_loopexit(main_base, &tv);
    
    event_base_dispatch(main_base);
    
    pthread_join(tid, NULL);
    
    bufferevent_free(main_bev);
    event_base_free(main_base);
    
    return 0;
}
```

### 4.2 使用bufferevent_pair

```c
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <event2/event.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>

struct thread_data {
    struct event_base *base;
    struct bufferevent *bev;
};

static void worker_read_cb(struct bufferevent *bev, void *arg) {
    struct evbuffer *input = bufferevent_get_input(bev);
    
    char buf[1024];
    size_t n;
    while ((n = bufferevent_read(bev, buf, sizeof(buf) - 1)) > 0) {
        buf[n] = '\0';
        printf("Worker received: %s", buf);
        
        // 回复
        bufferevent_write(bev, "ACK\n", 4);
    }
}

void *worker_thread(void *arg) {
    struct thread_data *data = arg;
    
    bufferevent_setcb(data->bev, worker_read_cb, NULL, NULL, NULL);
    bufferevent_enable(data->bev, EV_READ | EV_WRITE);
    
    event_base_dispatch(data->base);
    
    return NULL;
}

int main() {
    evthread_use_pthreads();
    
    struct event_base *main_base = event_base_new();
    struct event_base *worker_base = event_base_new();
    
    // 创建bufferevent pair
    struct bufferevent *pair[2];
    bufferevent_pair_new(worker_base, BEV_OPT_THREADSAFE, pair);
    
    // pair[0]给工作线程
    struct thread_data data = {worker_base, pair[0]};
    
    // pair[1]给主线程
    struct bufferevent *main_bev = bufferevent_pair_new(main_base, BEV_OPT_THREADSAFE, pair);
    
    // 启动工作线程
    pthread_t tid;
    pthread_create(&tid, NULL, worker_thread, &data);
    
    // 主线程发送消息
    sleep(1);
    bufferevent_write(pair[1], "Hello from main\n", 16);
    
    // 等待回复
    sleep(1);
    
    // 退出
    event_base_loopexit(worker_base, NULL);
    event_base_loopexit(main_base, NULL);
    
    pthread_join(tid, NULL);
    
    bufferevent_free(pair[0]);
    bufferevent_free(pair[1]);
    event_base_free(worker_base);
    event_base_free(main_base);
    
    return 0;
}
```

## 五、HTTP服务器C++封装

```cpp
#include <iostream>
#include <string>
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <memory>
#include <event2/event.h>
#include <event2/http.h>
#include <event2/buffer.h>

class HttpServer {
public:
    HttpServer(int port, int thread_num = 4)
        : port_(port), thread_num_(thread_num), base_(nullptr) {
        evthread_use_pthreads();
    }
    
    ~HttpServer() {
        stop();
    }
    
    bool start() {
        base_ = event_base_new();
        if (!base_) return false;
        
        http_ = evhttp_new(base_);
        if (!http_) return false;
        
        if (evhttp_bind_socket(http_, "0.0.0.0", port_) != 0) {
            return false;
        }
        
        evhttp_set_gencb(http_, HttpServer::generic_callback, this);
        
        // 启动工作线程
        for (int i = 0; i < thread_num_; i++) {
            threads_.emplace_back(&HttpServer::worker_loop, this);
        }
        
        std::cout << "HTTP server started on port " << port_ << std::endl;
        
        event_base_dispatch(base_);
        
        return true;
    }
    
    void stop() {
        if (base_) {
            event_base_loopbreak(base_);
        }
        
        for (auto& t : threads_) {
            if (t.joinable()) {
                t.join();
            }
        }
        
        if (http_) {
            evhttp_free(http_);
            http_ = nullptr;
        }
        
        if (base_) {
            event_base_free(base_);
            base_ = nullptr;
        }
    }
    
private:
    static void generic_callback(struct evhttp_request *req, void *arg) {
        HttpServer *server = static_cast<HttpServer*>(arg);
        server->handle_request(req);
    }
    
    void handle_request(struct evhttp_request *req) {
        struct evbuffer *buf = evbuffer_new();
        
        evbuffer_add_printf(buf, "<html><body>");
        evbuffer_add_printf(buf, "<h1>Hello from libevent HTTP Server</h1>");
        evbuffer_add_printf(buf, "<p>URI: %s</p>", evhttp_request_get_uri(req));
        evbuffer_add_printf(buf, "</body></html>");
        
        evhttp_add_header(evhttp_request_get_output_headers(req), 
                          "Content-Type", "text/html");
        evhttp_send_reply(req, HTTP_OK, "OK", buf);
        
        evbuffer_free(buf);
    }
    
    void worker_loop() {
        // 工作线程可以处理其他任务
        while (true) {
            // 这里可以添加任务队列处理逻辑
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
    }
    
    int port_;
    int thread_num_;
    struct event_base *base_;
    struct evhttp *http_;
    std::vector<std::thread> threads_;
};

int main() {
    HttpServer server(8080, 4);
    
    if (!server.start()) {
        std::cerr << "Failed to start server" << std::endl;
        return 1;
    }
    
    return 0;
}
```

## 六、最佳实践

| 建议 | 说明 |
|------|------|
| **初始化顺序** | 先调用evthread_use_pthreads()，再创建event_base |
| **锁粒度** | 尽量减少锁的持有时间 |
| **避免死锁** | 注意锁的获取顺序 |
| **线程池** | 对于CPU密集型任务使用线程池 |
| **资源清理** | 确保线程退出前释放所有资源 |

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
