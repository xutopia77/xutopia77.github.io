---
title: "\U0001F4D6 序言与简介 - libevent源码深度解析系列（一）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🚀 序言与简介

## 一、高性能服务器编程

### 1.1 高性能服务器特点

目前网络应用程序大多是C/S架构的，例如：
- 🍪 日常使用的邮箱，聊天软件QQ、微信
- 🍪 看视频的网站B站、腾讯视频
- 🍪 浏览网页用的浏览器

他们的基本特点就是，客户端软件从向服务端请求资源，服务端做一些处理之后，把资源返回给客户端。

高性能服务器的关键需求至少有如下几点：
- 👉 **效率高**：既然是高性能，那处理客户端请求的效率当然要很高了
- 👉 **高可用**：不能随便就挂掉了
- 👉 **编程简单**：基于此服务器进行业务开发需要足够简单
- 👉 **可扩展**：可方便的扩展功能（微服务）
- 👉 **可伸缩**：可简单的通过部署的方式进行容量的伸缩，也就是服务需要无状态

### 1.2 传统网络编程的局限

从上面描述也可以知道，高性能服务器的重要基石就是接受客户端的连接，处理客户端发送的网络请求。下面我们看一下基本的网络编程方式。

```c
while(1){
    listen(listen_socket);
    cli_socket = accept(listen_socket);
    while(read(cli_socket) > 0){
        //do something, cost some time
        write(cli_socket);
    }
    //peer close or peer err
    close(cli_socket)
}
```

服务端监听一个网络套接字，然后接受客户端的连接请求，并从客户端读取请求数据，然后做出响应。

上面程序中，accept和read的系统接口一般都是阻塞的，所以上面的编程示例同一时刻只能处理一个客户端的请求。但是我们知道，这在现实中基本还是不可使用的，例如B站，同一时刻不可能只为一个网络用户提供视频服务。

**改进方案**：每一个客户端连接上来就为他分配一个线程，处理这个客户的请求，然后主线程继续等待客户端的连接。

```c
void workThread(int cli_socket){
    while(read(cli_socket) > 0){
        //do something, cost some time
        write(cli_socket);
    }
    close(cli_socket)
}

main(){
    while(1){
        listen(listen_socket);
        cli_socket = accept(listen_socket);
        create_thread(workThread, listen_socket);
    }  
}
```

**问题**：每一个客户端就需要一个线程，如果面对大量用户，那就需要创建大量线程，可是服务器的硬件资源是有限制的。具体问题详见 [The C10K Problem](http://www.kegel.com/c10k.html)。

针对这个问题可以使用linux的多路复用机制来解决。

---

## 二、Reactor模型

从上述的demo中可以看出，在wait的地方阻塞等待，直到有事件触发，然后就可以调用事件的回调进行处理。这就是Reactor网络编程模型。

### 2.1 Reactor模型结构

下面这个模型图片在计算机业内的公认讲Reactor模型最好的论文。

![Reactor模型](https://imgbed.xutopia.top/image-assets/83b659e4df8e53e7d13fa403a31da6b9.png)

简单解释一下这个模型图：

| 组件 | 说明 |
|------|------|
| **Synchronous Event Demultiplexer** | 同步事件分离器，用于监听各种事件，调用方调用监听方法的时候会被阻塞，直到有事件发生，才会返回。对于Linux来说，同步事件分离器指的就是IO多路复用模型，比如epoll，poll，select 等。 |
| **Handler** | 本质上是文件描述符，是一个抽象的概念，可以简单的理解为一个一个事件，该事件可以来自于外部，比如客户端连接事件，客户端的写事件等等，也可以是内部的事件，比如操作系统产生的定时器事件等等。 |
| **Event Handler** | 事件处理器，本质上是回调方法，当有事件发生后，框架会根据Handler调用对应的回调方法，在大多数情况下，是虚函数，需要用户自己实现接口，实现具体的方法。 |
| **Concrete Event Handler** | 具体的事件处理器，是Event Handler的具体实现。 |
| **Initiation Dispatcher** | 初始化事件分发器，实际上就是Reactor角色，提供了一系列方法，对Event Handler进行注册和移除；还会调用Synchronous Event Demultiplexer监听各种事件；当有事件发生后，还要调用对应的Event Handler。 |

### 2.2 简化的Reactor模型图

![简化Reactor模型](https://imgbed.xutopia.top/image-assets/63b27530b79ffb5ea1197b3fb8de1c4c.png)

这是一个最简单的Reactor网络模型，Reactor处理多个client的连接处理请求，Reactor模型负责把产生的事件（连接，可读，可写，异常等）通过dispatch分发给各回调函数进行处理。

**注意**：上述是单线程的Reactor处理模型，单线程的Reactor要求每个处理回调不能卡死，业务处理尽可能快，否则会影响后续的事件处理，导致事件队列阻塞。

---

## 三、libevent简介

### 3.1 libevent特点

Libevent 是一个用C语言编写的、轻量级的开源高性能事件通知库，主要有以下几个亮点：

- 🔷 **事件驱动（event-driven）**，高性能
- 🔷 **轻量级**，专注于网络，不如 ACE 那么臃肿庞大
- 🔷 **源代码相当精炼、易读**
- 🔷 **跨平台**，支持 Windows、Linux、*BSD 和 Mac Os
- 🔷 **支持多种 I/O 多路复用技术**，epoll、poll、dev/poll、select 和 kqueue 等
- 🔷 **支持 I/O，定时器和信号等事件**
- 🔷 **注册事件优先级**

Libevent 已经被广泛的应用，作为底层的网络库；比如 memcached、Vomit、Nylon、Netchat等等。

### 3.2 libevent组件

libevent包括事件管理、缓存管理、DNS、HTTP、缓存事件几大部分：

| 组件 | 说明 |
|------|------|
| **事件管理** | 包括各种IO（socket）、定时器、信号等事件 |
| **缓存管理** | evbuffer功能 |
| **DNS** | libevent提供的一个异步DNS查询功能 |
| **HTTP** | libevent的一个轻量级http实现，包括服务器和客户端 |

libevent也支持ssl，这对于有安全需求的网络程序非常的重要，但是其支持不是很完善，比如http server的实现就不支持ssl。

### 3.3 libevent的历史背景

`libevent` 的起源可以追溯到 2003 年，由美国加州大学伯克利分校的研究员 Brad Fitzpatrick 开发。最初，它是为了解决在构建高性能网络应用时面临的挑战，特别是在 Linux 和 BSD 系统上实现高效的事件处理机制。Fitzpatrick 在开发 LiveJournal 项目的过程中遇到了性能瓶颈，传统的同步 I/O 模型无法满足大规模并发访问的需求。因此，他设计并实现了 `libevent`，以提供一种更为灵活和高效的事件处理框架。

最初的 `libevent` 实现基于 `select()` 系统调用，但很快就转向了更为先进的 `poll()` 和 `kqueue()`（针对 BSD 系统）。随着 Linux 内核的发展，特别是引入了 `epoll` 机制之后，`libevent` 迅速采用了这一新技术，进一步提升了性能。

### 3.4 libevent的API基本使用步骤

```c
event_base_new()    // 创建初始化event_base
event_new()         // 创建事件
event_add()         // 将event添加到事件链表上，注册事件
event_base_dispatch() // 循环、检测、分发事件
```

---

## 四、事件驱动编程

### 4.1 事件驱动编程概述

事件驱动编程（Event-Driven Programming，EDP）是一种编程范式，因其高效率和灵活性而受到广泛关注，它强调程序的执行是由外部事件触发的，而非通过预定的顺序流程控制。

事件驱动编程的核心思想是"被动等待"和"主动响应"。程序在大部分时间内处于等待状态，一旦检测到某个感兴趣的事件发生，就会触发相应的处理逻辑。这种方法不仅减少了不必要的计算开销，还能显著提高系统的响应速度和整体性能。

### 4.2 事件驱动编程的优势

1. **高效性**：事件驱动编程模型允许程序在没有事件发生时处于休眠状态，这大大减少了 CPU 的空闲时间，提高了系统的整体效率。
2. **可扩展性**：由于事件驱动模型可以同时处理多个并发事件，因此非常适合构建高并发的应用程序。
3. **灵活性**：事件驱动编程模型允许开发者更灵活地组织代码结构，通过注册不同的事件处理函数来实现模块化的设计。
4. **异步处理**：事件驱动模型天然支持异步处理方式，这意味着程序可以同时处理多个任务，无需等待某个操作完成后再继续执行后续逻辑。

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
