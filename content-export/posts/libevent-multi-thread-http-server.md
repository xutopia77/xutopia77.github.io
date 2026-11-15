---
title: "\U0001F5A5️ 基于libevent的多线程HTTP服务器实现"
published: '2022-12-11'
description: ''
tags:
  - libevent
  - cplusplus
category: code
---
项目需要实现一个HTTP/1.0版本的Web服务器，支持GET、POST方法，运行在嵌入式Linux系统中，并且需要处理大量并发请求。综合考虑后，选择使用libevent实现多线程HTTP服务器。

本文基于libevent-2.1.12-stable版本，从多线程使用注意事项到完整实现，手把手教你搭建高性能HTTP服务器。

<!-- more -->

## 📖 一、libevent简介

### 🎯 1.1 什么是libevent

官方介绍：

> The libevent API provides a mechanism to execute a callback function when a specific event occurs on a file descriptor or after a timeout has been reached. Furthermore, libevent also support callbacks due to signals or regular timeouts.
>
> libevent API提供了一种机制，可以在文件描述符上发生特定事件或超时后执行回调函数。此外，libevent还支持由于信号或常规超时而产生的回调。

百度百科介绍：

> Libevent是一个用C语言编写的、轻量级的开源高性能事件通知库，主要有以下几个亮点：事件驱动（event-driven），高性能；轻量级，专注于网络；源代码相当精炼、易读；跨平台，支持Windows、Linux、*BSD和Mac OS；支持多种I/O多路复用技术，epoll、poll、dev/poll、select和kqueue等；支持I/O，定时器和信号等事件；注册事件优先级。

**简单来说**：libevent是一个网络库，能够帮我们处理大量的网络编程细节，降低网络编程门槛，并具备良好的跨平台能力。使用者只需要向它注册事件，它就会在合适的时机（可读、可写或定时事件触发时）调用对应的回调函数。

### 🏗️ 1.2 libevent核心组件

| 组件 | 说明 |
|------|------|
| 事件管理 | 各种IO（socket）、定时器、信号等事件 |
| 缓存管理 | evbuffer功能 |
| DNS | 异步DNS查询功能 |
| HTTP | 轻量级HTTP实现，包括服务器和客户端 |
| 缓存事件 | 缓存事件处理 |

本文要实现的HTTP服务器，就是使用HTTP组件。需要注意的是，libevent虽然支持SSL，但HTTP Server的实现并不完善支持SSL。

### 📚 1.3 前置知识

阅读本文前，建议先了解：
- IO多路复用器（尤其是epoll）
- Reactor和Proactor模式

参考资料：[select，poll，epoll的区别以及使用方法](https://zhuanlan.zhihu.com/p/457920283)

单线程版本实现：[基于libevent的http服务器实现](https://zhuanlan.zhihu.com/p/458189076)

---

## ⚠️ 二、libevent多线程使用注意事项

关于libevent是否支持多线程，很多资料有争议。关键在于**多线程是怎么使用的，是怎么与libevent结合的**。

### ✅ 2.1 支持的使用方式

**不同线程使用不同的base**：每个线程拥有独立的event_base，事件注册到各自线程的base上。这是推荐的多线程使用方式。

### ❌ 2.2 不支持的使用方式

| 场景 | 原因 |
|------|------|
| 信号事件多线程 | 内部使用了全局变量，不支持多线程 |
| 不同线程共享同一个base | 即使加锁也不行，事件触发后可能被自动删除，导致并发问题 |

### 💡 2.3 核心结论

> **如果想要使用多线程，就需要每个线程中对应一个base，将线程里的事件注册到线程的base上。**

---

## 🛠️ 三、多线程HTTP服务器实现

### 📝 3.1 启动多线程HTTP服务

```cpp
int nfd = BindSocket(port);  // 监听端口

for (int i = 0; i < nthreads; i++)
{
    // 每个线程独有的环境参数，不使用局部变量，防止离开局部作用域后失效
    WorkRoom* w = new WorkRoom;
    
    // libevent使用多线程，每个线程中使用一个base
    w->base = event_init();
    
    // 初始化http
    w->httpd = evhttp_new(w->base);
    
    // 接受连接
    r = evhttp_accept_socket(w->httpd, nfd);
    
    // 设置http路由 404
    evhttp_set_gencb(w->httpd, GenericHandler, this);
    
    // 设置http路由
    evhttp_set_cb(w->httpd, "/test", ProcessRequest, this);
    
    // 每个base设置一个看门狗，可以做一些线程监控的工作
    event* watchdogEv = event_new(w->base, -1, EV_PERSIST|EV_TIMEOUT, watchdog, w);
    event_add(watchdogEv, &tv);
}
```

### 🚀 3.2 开启事件分发线程

```cpp
event_base_dispatch(w->base);
```

### 🛑 3.3 停止事件分发循环

在看门狗中关闭事件分发循环：

```cpp
struct timeval delay = { 0, 1 };
event_base_loopexit(w->base, &delay);  // 可设置延迟，参数为空则立即退出
```

### 🧹 3.4 资源释放

HTTP服务器停止时，需要注意资源释放，避免内存泄漏：

```cpp
event_free(w->watchdogEv);
evhttp_free(w->httpd);
event_base_free(w->base);
```

---

## 📋 四、完整使用示例

### 💻 4.1 程序Demo

```cpp
servers::HttpSrv s;
s.start(8080, 5);  // 监听8080端口，启动5个线程

sleep(10);

LOG_INFO("http to stop\n");
s.stop();  // 停止服务，释放所有资源
LOG_INFO("http stop\n");
```

### 📊 4.2 运行结果

```shell
dispatch start
dispatch start
dispatch start
dispatch start
dispatch start
http start port:8080, thNum:5
http to stop
dispatch stop
dispatch stop
dispatch stop
dispatch stop
dispatch stop
http stop
```

### 🔧 4.3 Postman请求测试

**请求**：
```http
GET http://192.168.31.106:8080/test
User-Agent: PostmanRuntime/7.28.4
Accept: */*
Host: 192.168.31.106:8080
```

**响应**：
```http
HTTP/1.1 200 OK
Date: Sat, 15 Jan 2022 10:16:26 GMT
Content-Length: 17
Content-Type: text/html; charset=ISO-8859-1

Requested: /test
```

---

## 📌 五、总结

本文介绍了基于libevent实现多线程HTTP服务器的完整流程：

| 要点 | 说明 |
|------|------|
| 多线程核心 | 每个线程对应一个独立的event_base |
| 启动流程 | BindSocket → 创建WorkRoom → event_init → evhttp_new → 设置路由 |
| 停止流程 | event_base_loopexit → 资源释放 |
| 注意事项 | 信号事件不支持多线程，禁止共享base |

libevent是一个非常优秀的跨平台网络库，通过学习它，可以深入理解网络库的设计思想。虽然短时间内难以掌握所有细节，但掌握基本的使用方法已经能够应对大多数场景。

> **源代码获取**：关注公众号 **xutopia77**，回复「**基于libevent的多线程http服务器**」获取完整源码。
