---
title: "\U0001F310 TCP服务端与客户端 - libevent源码深度解析系列（十）"
published: '2026-04-11'
description: ''
tags:
  - libevent
category: libevent
---
# 🌐 TCP服务端与客户端

## 一、TCP服务端

### 1.1 使用event实现

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <event2/event.h>
#include <event2/listener.h>

#define PORT 8080
#define BUFFER_SIZE 1024

struct connection {
    struct event *read_event;
    struct event *write_event;
    char buffer[BUFFER_SIZE];
    size_t buffer_len;
};

static void read_cb(evutil_socket_t fd, short events, void *arg) {
    struct connection *conn = (struct connection *)arg;
    ssize_t n = recv(fd, conn->buffer, BUFFER_SIZE - 1, 0);
    
    if (n <= 0) {
        if (n == 0) {
            printf("Client disconnected\n");
        } else {
            perror("recv");
        }
        event_free(conn->read_event);
        close(fd);
        free(conn);
        return;
    }
    
    conn->buffer[n] = '\0';
    printf("Received: %s", conn->buffer);
    
    // 回显
    send(fd, conn->buffer, n, 0);
}

static void accept_cb(evutil_socket_t fd, short events, void *arg) {
    struct event_base *base = (struct event_base *)arg;
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    
    int client_fd = accept(fd, (struct sockaddr *)&client_addr, &client_len);
    if (client_fd < 0) {
        perror("accept");
        return;
    }
    
    printf("New connection from %s:%d\n",
           inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port));
    
    evutil_make_socket_nonblocking(client_fd);
    
    struct connection *conn = calloc(1, sizeof(struct connection));
    conn->read_event = event_new(base, client_fd, EV_READ | EV_PERSIST, read_cb, conn);
    event_add(conn->read_event, NULL);
}

int main() {
    struct event_base *base = event_base_new();
    
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    evutil_make_socket_nonblocking(listen_fd);
    
    int reuse = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    
    struct sockaddr_in server_addr;
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = INADDR_ANY;
    
    bind(listen_fd, (struct sockaddr *)&server_addr, sizeof(server_addr));
    listen(listen_fd, 10);
    
    printf("Server listening on port %d\n", PORT);
    
    struct event *accept_event = event_new(base, listen_fd, EV_READ | EV_PERSIST, accept_cb, base);
    event_add(accept_event, NULL);
    
    event_base_dispatch(base);
    
    event_free(accept_event);
    close(listen_fd);
    event_base_free(base);
    
    return 0;
}
```

### 1.2 使用bufferevent实现

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

#define PORT 8080

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    
    char *line;
    size_t len;
    while ((line = evbuffer_readln(input, &len, EVBUFFER_EOL_LF)) != NULL) {
        printf("Received: %s\n", line);
        evbuffer_add_printf(output, "Echo: %s\n", line);
        free(line);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & BEV_EVENT_EOF) {
        printf("Connection closed.\n");
    } else if (events & BEV_EVENT_ERROR) {
        printf("Got an error on the connection: %s\n", strerror(errno));
    }
    bufferevent_free(bev);
}

static void accept_conn_cb(struct evconnlistener *listener,
    evutil_socket_t fd, struct sockaddr *address, int socklen, void *ctx) {
    
    struct sockaddr_in *sin = (struct sockaddr_in *)address;
    printf("New connection from %s:%d\n",
           inet_ntoa(sin->sin_addr), ntohs(sin->sin_port));
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct bufferevent *bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

static void accept_error_cb(struct evconnlistener *listener, void *ctx) {
    struct event_base *base = evconnlistener_get_base(listener);
    int err = EVUTIL_SOCKET_ERROR();
    fprintf(stderr, "Listener error %d: %s\n", err, evutil_socket_error_to_string(err));
    event_base_loopexit(base, NULL);
}

static void signal_cb(evutil_socket_t sig, short events, void *ctx) {
    struct event_base *base = ctx;
    printf("Caught signal %d, exiting...\n", sig);
    event_base_loopexit(base, NULL);
}

int main() {
    struct event_base *base = event_base_new();
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(PORT);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    
    struct evconnlistener *listener = evconnlistener_new_bind(base,
        accept_conn_cb, NULL, LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE,
        -1, (struct sockaddr *)&sin, sizeof(sin));
    
    if (!listener) {
        perror("Couldn't create listener");
        return 1;
    }
    
    evconnlistener_set_error_cb(listener, accept_error_cb);
    
    struct event *signal_event = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(signal_event, NULL);
    
    printf("Server listening on port %d\n", PORT);
    event_base_dispatch(base);
    
    evconnlistener_free(listener);
    event_free(signal_event);
    event_base_free(base);
    
    return 0;
}
```

## 二、TCP客户端

### 2.1 使用bufferevent实现

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/event.h>

#define SERVER_IP "127.0.0.1"
#define SERVER_PORT 8080

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    
    char buffer[1024];
    size_t n;
    while ((n = evbuffer_remove(input, buffer, sizeof(buffer) - 1)) > 0) {
        buffer[n] = '\0';
        printf("Server: %s", buffer);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    struct event_base *base = ctx;
    
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to server!\n");
        
        // 发送消息
        bufferevent_write(bev, "Hello, Server!\n", 15);
        
        // 设置读回调
        bufferevent_setcb(bev, read_cb, NULL, event_cb, base);
    } else if (events & BEV_EVENT_EOF) {
        printf("Connection closed.\n");
        event_base_loopexit(base, NULL);
    } else if (events & BEV_EVENT_ERROR) {
        printf("Connection error: %s\n", strerror(errno));
        event_base_loopexit(base, NULL);
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *bev = bufferevent_socket_new(base, -1, BEV_OPT_CLOSE_ON_FREE);
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_IP, &sin.sin_addr);
    
    bufferevent_setcb(bev, NULL, NULL, event_cb, base);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    if (bufferevent_socket_connect(bev, (struct sockaddr *)&sin, sizeof(sin)) < 0) {
        perror("Connection failed");
        bufferevent_free(bev);
        event_base_free(base);
        return 1;
    }
    
    event_base_dispatch(base);
    
    bufferevent_free(bev);
    event_base_free(base);
    
    return 0;
}
```

### 2.2 交互式客户端

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/event.h>

#define SERVER_IP "127.0.0.1"
#define SERVER_PORT 8080

static struct bufferevent *g_bev = NULL;

static void stdin_cb(evutil_socket_t fd, short events, void *arg) {
    char buffer[1024];
    ssize_t n = read(fd, buffer, sizeof(buffer) - 1);
    if (n > 0) {
        buffer[n] = '\0';
        if (g_bev) {
            bufferevent_write(g_bev, buffer, n);
        }
    }
}

static void server_read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    
    char buffer[1024];
    size_t n;
    while ((n = evbuffer_remove(input, buffer, sizeof(buffer) - 1)) > 0) {
        buffer[n] = '\0';
        printf("%s", buffer);
    }
    printf("> ");
    fflush(stdout);
}

static void server_event_cb(struct bufferevent *bev, short events, void *ctx) {
    struct event_base *base = ctx;
    
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to server!\n");
        printf("> ");
        fflush(stdout);
    } else if (events & (BEV_EVENT_EOF | BEV_EVENT_ERROR)) {
        printf("\nConnection closed.\n");
        event_base_loopexit(base, NULL);
    }
}

int main() {
    struct event_base *base = event_base_new();
    g_bev = bufferevent_socket_new(base, -1, BEV_OPT_CLOSE_ON_FREE);
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_IP, &sin.sin_addr);
    
    bufferevent_setcb(g_bev, server_read_cb, NULL, server_event_cb, base);
    bufferevent_enable(g_bev, EV_READ | EV_WRITE);
    
    // 监听标准输入
    struct event *stdin_event = event_new(base, STDIN_FILENO, EV_READ | EV_PERSIST, stdin_cb, NULL);
    event_add(stdin_event, NULL);
    
    if (bufferevent_socket_connect(g_bev, (struct sockaddr *)&sin, sizeof(sin)) < 0) {
        perror("Connection failed");
        return 1;
    }
    
    event_base_dispatch(base);
    
    event_free(stdin_event);
    bufferevent_free(g_bev);
    event_base_free(base);
    
    return 0;
}
```

## 三、编译运行

```bash
# 编译服务端
gcc -o server server.c -levent

# 编译客户端
gcc -o client client.c -levent

# 运行服务端
./server

# 运行客户端
./client
```

## 四、测试方法

```bash
# 使用telnet测试
telnet 127.0.0.1 8080

# 使用nc测试
nc 127.0.0.1 8080

# 使用自定义客户端
./client
```

## 五、高级实践案例

### 5.1 带配置管理的TCP服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>

// 服务器配置
struct server_config {
    int port;
    int backlog;
    int max_connections;
    int timeout;
};

// 连接管理
struct connection {
    int fd;
    struct bufferevent *bev;
    struct sockaddr_in addr;
    time_t last_activity;
};

static struct server_config config = {
    .port = 8080,
    .backlog = 10,
    .max_connections = 100,
    .timeout = 300 // 5分钟超时
};

static int connection_count = 0;

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct connection *conn = (struct connection *)ctx;
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    
    char *line;
    size_t len;
    while ((line = evbuffer_readln(input, &len, EVBUFFER_EOL_LF)) != NULL) {
        printf("Received from %s:%d: %s\n",
               inet_ntoa(conn->addr.sin_addr), ntohs(conn->addr.sin_port), line);
        
        // 处理命令
        if (strcmp(line, "ping") == 0) {
            evbuffer_add_printf(output, "pong\n");
        } else if (strcmp(line, "info") == 0) {
            evbuffer_add_printf(output, "Server: libevent TCP server\n");
            evbuffer_add_printf(output, "Connections: %d\n", connection_count);
        } else {
            evbuffer_add_printf(output, "Echo: %s\n", line);
        }
        free(line);
    }
    
    // 更新活动时间
    conn->last_activity = time(NULL);
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    struct connection *conn = (struct connection *)ctx;
    
    if (events & BEV_EVENT_EOF) {
        printf("Connection closed by %s:%d\n",
               inet_ntoa(conn->addr.sin_addr), ntohs(conn->addr.sin_port));
    } else if (events & BEV_EVENT_ERROR) {
        int err = EVUTIL_SOCKET_ERROR();
        printf("Error on connection from %s:%d: %s\n",
               inet_ntoa(conn->addr.sin_addr), ntohs(conn->addr.sin_port),
               evutil_socket_error_to_string(err));
    } else if (events & BEV_EVENT_TIMEOUT) {
        printf("Connection timeout from %s:%d\n",
               inet_ntoa(conn->addr.sin_addr), ntohs(conn->addr.sin_port));
    }
    
    bufferevent_free(conn->bev);
    free(conn);
    connection_count--;
    printf("Connection count: %d\n", connection_count);
}

static void accept_conn_cb(struct evconnlistener *listener, 
    evutil_socket_t fd, struct sockaddr *address, int socklen, void *ctx) {
    
    struct event_base *base = evconnlistener_get_base(listener);
    struct connection *conn = calloc(1, sizeof(struct connection));
    
    if (!conn) {
        perror("calloc");
        close(fd);
        return;
    }
    
    // 检查连接数限制
    if (connection_count >= config.max_connections) {
        printf("Connection limit reached, rejecting connection\n");
        close(fd);
        free(conn);
        return;
    }
    
    conn->fd = fd;
    memcpy(&conn->addr, address, sizeof(struct sockaddr_in));
    conn->last_activity = time(NULL);
    
    // 创建bufferevent
    conn->bev = bufferevent_socket_new(base, fd, BEV_OPT_CLOSE_ON_FREE);
    if (!conn->bev) {
        perror("bufferevent_socket_new");
        close(fd);
        free(conn);
        return;
    }
    
    // 设置回调
    bufferevent_setcb(conn->bev, read_cb, NULL, event_cb, conn);
    
    // 设置超时
    struct timeval tv = {config.timeout, 0};
    bufferevent_set_timeouts(conn->bev, &tv, NULL);
    
    // 启用读写
    bufferevent_enable(conn->bev, EV_READ | EV_WRITE);
    
    connection_count++;
    printf("New connection from %s:%d, count: %d\n",
           inet_ntoa(conn->addr.sin_addr), ntohs(conn->addr.sin_port), connection_count);
}

static void accept_error_cb(struct evconnlistener *listener, void *ctx) {
    struct event_base *base = evconnlistener_get_base(listener);
    int err = EVUTIL_SOCKET_ERROR();
    fprintf(stderr, "Listener error %d: %s\n", err, evutil_socket_error_to_string(err));
    event_base_loopexit(base, NULL);
}

static void signal_cb(evutil_socket_t sig, short events, void *ctx) {
    struct event_base *base = ctx;
    printf("Caught signal %d, shutting down...\n", sig);
    event_base_loopexit(base, NULL);
}

static void load_config(const char *config_file) {
    // 这里可以实现从配置文件加载配置
    // 简化版本，使用默认配置
    printf("Loaded config: port=%d, backlog=%d, max_conn=%d, timeout=%d\n",
           config.port, config.backlog, config.max_connections, config.timeout);
}

int main(int argc, char **argv) {
    // 加载配置
    if (argc > 1) {
        load_config(argv[1]);
    } else {
        load_config(NULL);
    }
    
    struct event_base *base = event_base_new();
    if (!base) {
        fprintf(stderr, "Failed to create event base\n");
        return 1;
    }
    
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(config.port);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    
    struct evconnlistener *listener = evconnlistener_new_bind(base,
        accept_conn_cb, NULL, 
        LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE,
        config.backlog, 
        (struct sockaddr *)&sin, sizeof(sin));
    
    if (!listener) {
        perror("Couldn't create listener");
        event_base_free(base);
        return 1;
    }
    
    evconnlistener_set_error_cb(listener, accept_error_cb);
    
    // 信号处理
    struct event *signal_event = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(signal_event, NULL);
    
    printf("TCP server started on port %d\n", config.port);
    printf("Max connections: %d\n", config.max_connections);
    printf("Connection timeout: %d seconds\n", config.timeout);
    printf("Press Ctrl+C to exit\n");
    
    event_base_dispatch(base);
    
    printf("Server shutdown, cleaning up...\n");
    
    evconnlistener_free(listener);
    event_free(signal_event);
    event_base_free(base);
    
    printf("Server shutdown complete\n");
    return 0;
}
```

### 5.2 多线程TCP服务器

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <signal.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/listener.h>
#include <event2/event.h>
#include <event2/thread.h>

#define THREAD_COUNT 4
#define PORT 8080

struct thread_info {
    pthread_t thread_id;
    struct event_base *base;
    int pipefd[2];
    struct event *pipe_event;
};

static struct thread_info *threads;
static int next_thread = 0;
static pthread_mutex_t thread_lock = PTHREAD_MUTEX_INITIALIZER;

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    struct evbuffer *output = bufferevent_get_output(bev);
    
    char *line;
    size_t len;
    while ((line = evbuffer_readln(input, &len, EVBUFFER_EOL_LF)) != NULL) {
        printf("Thread %ld: Received: %s\n", pthread_self(), line);
        evbuffer_add_printf(output, "Echo: %s\n", line);
        free(line);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    if (events & BEV_EVENT_EOF) {
        printf("Thread %ld: Connection closed\n", pthread_self());
    } else if (events & BEV_EVENT_ERROR) {
        printf("Thread %ld: Connection error\n", pthread_self());
    }
    bufferevent_free(bev);
}

static void pipe_cb(evutil_socket_t fd, short events, void *arg) {
    struct thread_info *info = (struct thread_info *)arg;
    int client_fd;
    
    // 从管道读取客户端fd
    ssize_t n = read(fd, &client_fd, sizeof(client_fd));
    if (n != sizeof(client_fd)) {
        fprintf(stderr, "Error reading from pipe\n");
        return;
    }
    
    // 创建bufferevent
    struct bufferevent *bev = bufferevent_socket_new(info->base, client_fd, BEV_OPT_CLOSE_ON_FREE);
    if (!bev) {
        fprintf(stderr, "Error creating bufferevent\n");
        close(client_fd);
        return;
    }
    
    // 设置回调
    bufferevent_setcb(bev, read_cb, NULL, event_cb, NULL);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
}

static void *thread_main(void *arg) {
    struct thread_info *info = (struct thread_info *)arg;
    printf("Thread %ld started\n", info->thread_id);
    event_base_dispatch(info->base);
    printf("Thread %ld exiting\n", info->thread_id);
    return NULL;
}

static void accept_conn_cb(struct evconnlistener *listener, 
    evutil_socket_t fd, struct sockaddr *address, int socklen, void *ctx) {
    // 轮询选择线程
    pthread_mutex_lock(&thread_lock);
    struct thread_info *info = &threads[next_thread];
    next_thread = (next_thread + 1) % THREAD_COUNT;
    pthread_mutex_unlock(&thread_lock);
    
    // 发送fd到线程
    ssize_t n = write(info->pipefd[1], &fd, sizeof(fd));
    if (n != sizeof(fd)) {
        fprintf(stderr, "Error writing to pipe\n");
        close(fd);
    }
}

static void signal_cb(evutil_socket_t sig, short events, void *ctx) {
    struct event_base *base = ctx;
    printf("Caught signal %d, shutting down...\n", sig);
    
    // 停止所有线程
    for (int i = 0; i < THREAD_COUNT; i++) {
        event_base_loopbreak(threads[i].base);
    }
    
    event_base_loopbreak(base);
}

int main() {
    // 初始化线程支持
    if (evthread_use_pthreads() != 0) {
        fprintf(stderr, "Failed to initialize thread support\n");
        return 1;
    }
    
    // 创建主线程的event_base
    struct event_base *base = event_base_new();
    if (!base) {
        fprintf(stderr, "Failed to create event base\n");
        return 1;
    }
    
    // 创建工作线程
    threads = calloc(THREAD_COUNT, sizeof(struct thread_info));
    for (int i = 0; i < THREAD_COUNT; i++) {
        // 创建管道用于传递fd
        if (pipe(threads[i].pipefd) == -1) {
            perror("pipe");
            return 1;
        }
        
        // 设置管道非阻塞
        evutil_make_socket_nonblocking(threads[i].pipefd[0]);
        evutil_make_socket_nonblocking(threads[i].pipefd[1]);
        
        // 创建线程的event_base
        threads[i].base = event_base_new();
        if (!threads[i].base) {
            fprintf(stderr, "Failed to create thread event base\n");
            return 1;
        }
        
        // 创建管道事件
        threads[i].pipe_event = event_new(threads[i].base, threads[i].pipefd[0], 
            EV_READ | EV_PERSIST, pipe_cb, &threads[i]);
        event_add(threads[i].pipe_event, NULL);
        
        // 创建线程
        pthread_create(&threads[i].thread_id, NULL, thread_main, &threads[i]);
    }
    
    // 创建监听器
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(PORT);
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    
    struct evconnlistener *listener = evconnlistener_new_bind(base,
        accept_conn_cb, NULL, 
        LEV_OPT_REUSEABLE | LEV_OPT_CLOSE_ON_FREE,
        -1, 
        (struct sockaddr *)&sin, sizeof(sin));
    
    if (!listener) {
        perror("Couldn't create listener");
        return 1;
    }
    
    // 信号处理
    struct event *signal_event = evsignal_new(base, SIGINT, signal_cb, base);
    event_add(signal_event, NULL);
    
    printf("Multi-threaded TCP server started on port %d\n", PORT);
    printf("Thread count: %d\n", THREAD_COUNT);
    printf("Press Ctrl+C to exit\n");
    
    event_base_dispatch(base);
    
    // 等待所有线程退出
    for (int i = 0; i < THREAD_COUNT; i++) {
        pthread_join(threads[i].thread_id, NULL);
        event_free(threads[i].pipe_event);
        event_base_free(threads[i].base);
        close(threads[i].pipefd[0]);
        close(threads[i].pipefd[1]);
    }
    
    free(threads);
    evconnlistener_free(listener);
    event_free(signal_event);
    event_base_free(base);
    
    printf("Server shutdown complete\n");
    return 0;
}
```

### 5.3 带超时处理的TCP客户端

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <event2/buffer.h>
#include <event2/bufferevent.h>
#include <event2/event.h>

#define SERVER_IP "127.0.0.1"
#define SERVER_PORT 8080
#define CONNECT_TIMEOUT 5
#define READ_TIMEOUT 30

static int g_connected = 0;

static void read_cb(struct bufferevent *bev, void *ctx) {
    struct evbuffer *input = bufferevent_get_input(bev);
    
    char buffer[1024];
    size_t n;
    while ((n = evbuffer_remove(input, buffer, sizeof(buffer) - 1)) > 0) {
        buffer[n] = '\0';
        printf("Server: %s", buffer);
    }
}

static void event_cb(struct bufferevent *bev, short events, void *ctx) {
    struct event_base *base = ctx;
    
    if (events & BEV_EVENT_CONNECTED) {
        printf("Connected to server!\n");
        g_connected = 1;
        
        // 发送测试命令
        bufferevent_write(bev, "ping\n", 5);
        bufferevent_write(bev, "info\n", 5);
    } else if (events & BEV_EVENT_EOF) {
        printf("Connection closed by server\n");
        event_base_loopexit(base, NULL);
    } else if (events & BEV_EVENT_ERROR) {
        int err = EVUTIL_SOCKET_ERROR();
        printf("Connection error: %s\n", evutil_socket_error_to_string(err));
        event_base_loopexit(base, NULL);
    } else if (events & BEV_EVENT_TIMEOUT) {
        if (events & BEV_EVENT_READING) {
            printf("Read timeout\n");
        } else if (events & BEV_EVENT_WRITING) {
            printf("Write timeout\n");
        }
        event_base_loopexit(base, NULL);
    }
}

static void stdin_cb(evutil_socket_t fd, short events, void *arg) {
    struct bufferevent *bev = (struct bufferevent *)arg;
    char buffer[1024];
    ssize_t n = read(fd, buffer, sizeof(buffer) - 1);
    
    if (n > 0) {
        buffer[n] = '\0';
        if (g_connected) {
            bufferevent_write(bev, buffer, n);
        } else {
            printf("Not connected yet\n");
        }
    }
}

int main() {
    struct event_base *base = event_base_new();
    struct bufferevent *bev = bufferevent_socket_new(base, -1, BEV_OPT_CLOSE_ON_FREE);
    
    // 设置超时
    struct timeval connect_tv = {CONNECT_TIMEOUT, 0};
    struct timeval read_tv = {READ_TIMEOUT, 0};
    bufferevent_set_timeouts(bev, &read_tv, NULL);
    
    // 设置回调
    bufferevent_setcb(bev, read_cb, NULL, event_cb, base);
    bufferevent_enable(bev, EV_READ | EV_WRITE);
    
    // 连接服务器
    struct sockaddr_in sin;
    memset(&sin, 0, sizeof(sin));
    sin.sin_family = AF_INET;
    sin.sin_port = htons(SERVER_PORT);
    inet_pton(AF_INET, SERVER_IP, &sin.sin_addr);
    
    printf("Connecting to %s:%d...\n", SERVER_IP, SERVER_PORT);
    printf("Connect timeout: %d seconds\n", CONNECT_TIMEOUT);
    printf("Read timeout: %d seconds\n", READ_TIMEOUT);
    
    if (bufferevent_socket_connect(bev, (struct sockaddr *)&sin, sizeof(sin)) < 0) {
        fprintf(stderr, "Connection failed\n");
        bufferevent_free(bev);
        event_base_free(base);
        return 1;
    }
    
    // 监听标准输入
    struct event *stdin_event = event_new(base, STDIN_FILENO, EV_READ | EV_PERSIST, stdin_cb, bev);
    event_add(stdin_event, NULL);
    
    // 设置连接超时
    struct timeval tv = {CONNECT_TIMEOUT, 0};
    struct event *timeout_event = evtimer_new(base, 
        [](evutil_socket_t fd, short events, void *arg) {
            struct event_base *base = arg;
            if (!g_connected) {
                printf("Connection timeout\n");
                event_base_loopexit(base, NULL);
            }
        }, base);
    event_add(timeout_event, &tv);
    
    event_base_dispatch(base);
    
    event_free(stdin_event);
    event_free(timeout_event);
    bufferevent_free(bev);
    event_base_free(base);
    
    return 0;
}
```

## 六、编译与运行

### 6.1 编译高级示例

```bash
# 编译带配置管理的TCP服务器
gcc -o tcp_server_config tcp_server_config.c -levent

# 编译多线程TCP服务器
gcc -o tcp_server_threaded tcp_server_threaded.c -levent -lpthread

# 编译带超时处理的TCP客户端
gcc -o tcp_client_timeout tcp_client_timeout.c -levent
```

### 6.2 运行示例

```bash
# 运行带配置管理的服务器
./tcp_server_config

# 运行多线程服务器
./tcp_server_threaded

# 运行带超时处理的客户端
./tcp_client_timeout
```

---

**其他相关资料 请移步到[个人主页](https://xutopia.top/)**
