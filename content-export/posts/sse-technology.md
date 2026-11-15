---
title: "\U0001F504 Server-Sent Events (SSE) 技术详解"
published: '2026-04-20'
description: ''
tags:
  - 前端技术
  - web
category: 前端技术
---
# Server-Sent Events (SSE) 技术详解

## 目录

- [SSE 简介](#sse-简介)
- [SSE vs WebSocket vs Long Polling](#sse-vs-websocket-vs-long-polling)
- [SSE 协议格式](#sse-协议格式)
- [EventSource API](#eventsource-api)
- [服务端实现](#服务端实现)
- [浏览器兼容性](#浏览器兼容性)
- [重连机制](#重连机制)
- [字段说明](#字段说明)
- [安全考虑](#安全考虑)
- [实际应用场景](#实际应用场景)
- [性能优化](#性能优化)
- [完整示例](#完整示例)
- [调试工具](#调试工具)
- [常见问题](#常见问题)

---

## SSE 简介

Server-Sent Events (SSE) 是一种基于 HTTP 的单向通信技术，允许服务器主动向浏览器推送数据。SSE 是 HTML5 规范的一部分，提供了一种简单的方式来获取服务器的实时更新。

### 核心特点

- **单向通信**: 服务器 → 客户端，客户端不能向服务器发送数据
- **基于 HTTP/1.1**: 使用 HTTP 协议，兼容现有网络架构
- **自动重连**: 浏览器自动维护连接并在断线时重连
- **文本协议**: 数据格式简单，是 UTF-8 编码的文本
- **轻量级**: 相比 WebSocket 协议更简单，开销更小

### 工作原理

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ Browser │ ── HTTP Request ──▶│ Server  │                    │         │
│         │◀─ Keep-Alive ──────│         │◀── Data Stream ────┤  Data   │
│         │◀─ text/event-stream│         │                    │  Source │
│         │                    │         │                    │         │
│         │    (持久连接)        │         │                    │         │
└─────────┘                    └─────────┘                    └─────────┘
```

1. 客户端通过 `EventSource` API 发起 HTTP 请求到服务器
2. 服务器保持连接打开，不断发送事件
3. 客户端接收事件并触发相应的 JavaScript 回调
4. 连接断开时，浏览器自动尝试重连

---

## SSE vs WebSocket vs Long Polling

### 对比表

| 特性 | SSE | WebSocket | Long Polling |
|------|-----|-----------|--------------|
| **通信方向** | 单向 (服务器→客户端) | 全双工 (双向) | 半双工 (伪双向) |
| **协议** | HTTP/1.1 | WebSocket (ws/wss) | HTTP |
| **连接数限制** | 受浏览器同源连接限制 | 相同 | 每次轮询都是新连接 |
| **数据格式** | UTF-8 文本 | 二进制/文本 | 任意 |
| **自动重连** | 内置支持 | 需要手动实现 | 无 (轮询间隔) |
| **CORS** | 需要服务器配置 | 需要 WebSocket 服务器 | 需要服务器配置 |
| **防火墙/代理** | 友好 | 可能被阻止 | 友好 |
| **复杂度** | 低 | 中 | 低 |
| **服务器资源** | 较低 (持久连接) | 较高 (全双工) | 较高 (频繁建连) |
| **适合场景** | 实时通知、推送更新 | 实时游戏、聊天 | 简单轮询需求 |

### 如何选择

```
选择 SSE 的场景:
├── 只需要服务器向客户端推送数据
├── 需要通过 HTTP/HTTPS 传输
├── 需要自动重连功能
└── 需要兼容不支持 WebSocket 的环境

选择 WebSocket 的场景:
├── 需要双向通信
├── 传输延迟要求极低
├── 需要传输二进制数据
├── 高频数据交换
└── 实时游戏、在线协作、交易系统

选择 Long Polling 的场景:
├── 现有系统改造困难
├── 服务器不支持长连接
└── 数据更新频率很低
```

---

## SSE 协议格式

### 基本格式

SSE 数据以 `field: value` 的形式传输，以两个换行符 `\n\n` 结束一个事件。

```
field: value\n\n
```

### 字段说明

| 字段名 | 说明 |
|--------|------|
| `event` | 事件类型，客户端可据此区分不同事件 |
| `data` | 事件数据，可以有多行 |
| `id` | 事件 ID，客户端发送 `Last-Event-ID` 用于断线重连 |
| `retry` | 重连时间（毫秒），覆盖默认重连时间 |
| `:` | 注释，以冒号开头，用于心跳或传输注释 |

### 单行事件示例

```
data: {"message": "Hello World"}\n\n
```

### 多行数据

```
data: {"status": "ok",
data: "message": "Processing complete"
data: }\n\n
```

### 带事件类型

```
event: user-join\n
data: {"username": "Alice"}\n\n
```

### 带事件 ID (用于重连)

```
id: 123\n
data: {"message": "First event"}\n\n

id: 124\n
data: {"message": "Second event"}\n\n
```

### 指定重连时间

```
retry: 10000\n
data: {"message": "Set retry to 10 seconds"}\n\n
```

### 注释行 (心跳)

```
: This is a comment\n
data: ping\n\n
```

### 完整事件示例

```
event: notification\n
id: evt-001\n
retry: 5000\n
data: {"title": "New Message", "body": "You have a new notification", "timestamp": 1699000000}\n\n
```

---

## EventSource API

### 基本用法

```javascript
// 创建 EventSource 连接
const eventSource = new EventSource('/api/events');

// 监听默认事件 (message)
eventSource.onmessage = function(event) {
  console.log('Received:', event.data);
};

// 监听自定义事件
eventSource.addEventListener('notification', function(event) {
  const data = JSON.parse(event.data);
  console.log('Notification:', data);
});

// 监听连接打开
eventSource.onopen = function(event) {
  console.log('Connection opened');
};

// 监听错误
eventSource.onerror = function(event) {
  if (event.readyState === EventSource.CONNECTING) {
    console.log('Reconnecting...');
  } else if (event.readyState === EventSource.CLOSED) {
    console.log('Connection closed');
  } else {
    console.error('Error:', event);
  }
};
```

### EventSource 属性

```javascript
const eventSource = new EventSource('/api/events');

console.log(eventSource.url);          // 连接 URL
console.log(eventSource.readyState);  // 连接状态
console.log(eventSource.withCredentials); // 是否携带凭证
```

### readyState 状态

| 常量 | 值 | 说明 |
|------|-----|------|
| `EventSource.CONNECTING` | 0 | 连接中或重连中 |
| `EventSource.OPEN` | 1 | 连接已打开 |
| `EventSource.CLOSED` | 2 | 连接已关闭 |

```javascript
switch (eventSource.readyState) {
  case EventSource.CONNECTING:
    console.log('Connecting...');
    break;
  case EventSource.OPEN:
    console.log('Connected');
    break;
  case EventSource.CLOSED:
    console.log('Disconnected');
    break;
}
```

### 关闭连接

```javascript
// 手动关闭连接
eventSource.close();

console.log(eventSource.readyState); // EventSource.CLOSED
```

### 携带凭证 (CORS)

```javascript
// withCredentials 设置为 true 时，会携带 cookie、Authorization header 等
const eventSource = new EventSource('/api/events', {
  withCredentials: true
});
```

### 断线重连与 Last-Event-ID

服务器可发送 `id` 字段标记事件 ID。当连接断开重连时，浏览器会自动在请求头中携带 `Last-Event-ID`，服务器据此可以继续推送未发送的事件。

```javascript
// 服务器端发送带 ID 的事件
// id: 123\n
// data: {"message": "Event 123"}\n\n

// 客户端断开后重连时，HTTP 请求头会包含:
// Last-Event-ID: 123

// 服务器收到后可以发送 124 开始的后续事件
```

---

## 服务端实现

### Node.js + Express

```javascript
// server-express.js
const express = require('express');
const app = express();

// SSE 路由
app.get('/api/sse', (req, res) => {
  // 设置 SSE 相关 headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 发送初始连接消息
  res.write('event: connected\n');
  res.write('data: {"status": "connected"}\n\n');

  // 定时发送数据
  const intervalId = setInterval(() => {
    const data = {
      timestamp: Date.now(),
      random: Math.random().toFixed(4)
    };

    res.write(`event: heartbeat\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 5000);

  // 模拟事件推送
  const eventId = setInterval(() => {
    const messages = ['Hello!', 'New notification', 'System update'];
    const message = messages[Math.floor(Math.random() * messages.length)];

    res.write(`event: notification\n`);
    res.write(`id: ${Date.now()}\n`);
    res.write(`data: {"message": "${message}"}\n\n`);
  }, 15000);

  // 客户端断开连接时清理
  req.on('close', () => {
    clearInterval(intervalId);
    clearInterval(eventId);
    console.log('Client disconnected');
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### Node.js + 原生 HTTP

```javascript
// server-http.js
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // 禁用 Nginx 缓冲
    });

    const sendEvent = (eventName, data) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    const pushData = setInterval(() => {
      sendEvent('update', {
        time: new Date().toISOString(),
        value: Math.random()
      });
    }, 2000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clearInterval(pushData);
      console.log('Connection closed');
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(8080, () => {
  console.log('SSE Server running on http://localhost:8080');
});
```

### Node.js + Koa

```javascript
// server-koa.js
const Koa = require('koa');
const Router = require('@koa/router');

const app = new Koa();
const router = new Router();

router.get('/api/sse', async (ctx) => {
  ctx.set('Content-Type', 'text/event-stream');
  ctx.set('Cache-Control', 'no-cache');
  ctx.set('Connection', 'keep-alive');
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('X-Accel-Buffering', 'no');

  const encoder = new TextEncoder();

  const send = (eventName, data, eventId = null) => {
    let message = '';
    if (eventId) message += `id: ${eventId}\n`;
    message += `event: ${eventName}\n`;
    message += `data: ${JSON.stringify(data)}\n\n`;
    ctx.res.write(message);
  };

  send('connected', { status: 'connected' });

  const interval = setInterval(() => {
    send('heartbeat', { timestamp: Date.now() });
  }, 5000);

  ctx.req.on('close', () => {
    clearInterval(interval);
  });
});

app.use(router.routes());
app.listen(3000);
```

### Python + Flask

```python
# server-flask.py
from flask import Flask, Response, request
import json
import time
import random
from datetime import datetime

app = Flask(__name__)

def generate_events():
    """生成 SSE 事件流"""
    event_id = 0

    while True:
        event_id += 1
        data = {
            'id': event_id,
            'timestamp': datetime.now().isoformat(),
            'value': round(random.random() * 100, 2)
        }

        yield f"event: update\n"
        yield f"id: {event_id}\n"
        yield f"data: {json.dumps(data)}\n\n"

        time.sleep(2)

@app.route('/api/events')
def events():
    """SSE 端点"""
    last_event_id = request.headers.get('Last-Event-ID')

    if last_event_id:
        print(f"Reconnecting from event ID: {last_event_id}")

    return Response(
        generate_events(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no'
        }
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, threaded=True)
```

### Python + FastAPI

```python
# server-fastapi.py
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import asyncio
import json
import random
from datetime import datetime
from typing import AsyncGenerator

app = FastAPI()

@app.get("/api/events")
async def sse_endpoint(request: Request):
    """SSE 端点"""
    last_event_id = request.headers.get("last-event-id")

    async def event_generator() -> AsyncGenerator[str, None]:
        event_id = int(last_event_id) if last_event_id else 0

        while True:
            event_id += 1
            data = {
                "id": event_id,
                "timestamp": datetime.now().isoformat(),
                "value": round(random.random() * 100, 2)
            }

            yield f"event: update\n"
            yield f"id: {event_id}\n"
            yield f"data: {json.dumps(data)}\n\n"

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no"
        }
    )
```

### Go

```go
// server-go/main.go
package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

func sseHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	eventID := 0
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			log.Println("Client disconnected")
			return
		case <-ticker.C:
			eventID++
			data := map[string]interface{}{
				"id":        eventID,
				"timestamp": time.Now().Format(time.RFC3339),
				"value":     float64(eventID) * 1.5,
			}

			fmt.Fprintf(w, "id: %d\n", eventID)
			fmt.Fprintf(w, "event: update\n")
			fmt.Fprintf(w, "data: %s\n\n", toJSON(data))
			flusher.Flush()
		}
	}
}

func toJSON(data map[string]interface{}) string {
	return fmt.Sprintf(`{"id":%d,"timestamp":"%s","value":%.2f}`,
		data["id"], data["timestamp"], data["value"])
}

func main() {
	http.HandleFunc("/api/events", sseHandler)
	log.Println("Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
```

### Java + Spring Boot

```java
// SseController.java
@RestController
@RequestMapping("/api")
public class SseController {

    @GetMapping("/events")
    public SseEmitter streamEvents() {
        SseEmitter emitter = new SseEmitter(0L);

        ExecutorService executor = Executors.newCachedThreadPool();

        executor.execute(() -> {
            try {
                int[] eventId = {0};

                while (true) {
                    eventId[0]++;
                    Map<String, Object> data = new HashMap<>();
                    data.put("id", eventId[0]);
                    data.put("timestamp", Instant.now().toString());
                    data.put("value", Math.random() * 100);

                    emitter.send(SseEmitter.event()
                        .name("update")
                        .id(String.valueOf(eventId[0]))
                        .data(data));

                    Thread.sleep(2000);
                }
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });

        emitter.onCompletion(() -> log.info("SSE stream completed"));
        emitter.onError(e -> log.error("SSE error", e));
        emitter.onTimeout(() -> log.warning("SSE timeout"));

        return emitter;
    }
}
```

### Nginx 配置

```nginx
# nginx.conf
server {
    location /api/sse {
        # 禁用缓冲
        proxy_buffering off;
        proxy_cache off;

        # 禁用 gzip (SSE 需要原始流)
        gzip off;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

---

## 浏览器兼容性

### 支持情况

| 浏览器 | 支持版本 | 备注 |
|--------|----------|------|
| Chrome | 6+ | 完整支持 |
| Firefox | 6+ | 完整支持 |
| Safari | 5+ | 完整支持 |
| Edge | 79+ | 完整支持 (Chromium) |
| IE | 不支持 | 需要 polyfill |
| Opera | 11+ | 完整支持 |
| iOS Safari | 4+ | 完整支持 |
| Android Browser | 4.4+ | 完整支持 |

### Polyfill (兼容 IE)

```html
<!-- 使用 polyfill -->
<script src="https://cdn.jsdelivr.net/npm/event-source-polyfill@1.0.31/src/event_source_polyfill.js"></script>

<script>
  // 自动使用 polyfill (如果原生不支持)
  if (typeof EventSource === 'undefined') {
    EventSource = EventSourcePolyfill;
  }
</script>
```

### 检测支持

```javascript
if (typeof EventSource !== 'undefined') {
  // 支持 SSE
  const eventSource = new EventSource('/api/events');
} else {
  // 不支持，使用 Fallback
  console.warn('SSE not supported');
}
```

---

## 重连机制

### 自动重连

浏览器内置自动重连机制。连接断开后，浏览器会自动等待一段时间后重连，默认重连时间约 3 秒。

### 自定义重连时间

```javascript
// 服务器端设置重连时间 (毫秒)
retry: 10000\n
data: {"message": "Retry in 10 seconds"}\n\n
```

### 手动重连控制

```javascript
class SSEClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 3000;
  }

  connect() {
    this.eventSource = new EventSource(this.url);

    this.eventSource.onopen = () => {
      console.log('Connected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onmessage = (event) => {
      console.log('Message:', event.data);
    };

    this.eventSource.onerror = (event) => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(), this.reconnectDelay);
      } else {
        console.error('Max reconnect attempts reached');
        this.close();
      }
    };
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
```

### 重连与事件顺序

服务器需要确保事件的顺序和连续性：

```javascript
class EventPublisher {
  constructor() {
    this.events = [];
    this.maxStoredEvents = 100;
    this.lastEventId = 0;
  }

  publish(eventType, data) {
    const event = {
      id: ++this.lastEventId,
      type: eventType,
      data: data,
      timestamp: Date.now()
    };

    this.events.push(event);

    if (this.events.length > this.maxStoredEvents) {
      this.events.shift();
    }

    this.broadcast(event);
  }

  getEventsSince(lastEventId) {
    return this.events.filter(e => e.id > lastEventId);
  }

  broadcast(event) {
    this.clients.forEach(client => {
      client.send(event);
    });
  }
}
```

---

## 字段说明

### data 字段

数据内容，可以是多行。多行数据会自动用换行符连接。

```
data: First line\n
data: Second line\n
data: Third line\n\n

// 解析为:
// "First line\nSecond line\nThird line"
```

### event 字段

事件类型，客户端通过 `addEventListener` 监听。

```
event: custom-event\n
data: {"message": "Hello"}\n\n
```

### id 字段

事件唯一标识，用于断线重连时恢复。

```
id: 123\n
event: update\n
data: {"value": 100}\n\n
```

### retry 字段

指定重连时间（毫秒）。

```
retry: 5000\n
data: {"message": "Set 5s retry"}\n\n
```

### 冒号开头的注释

```
: This is a comment\n
data: ping\n\n
```

---

## 安全考虑

### CORS 配置

```javascript
app.get('/api/sse', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://yourdomain.com');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
});
```

### 认证与授权

```javascript
// 方式 1: Cookie (withCredentials)
const eventSource = new EventSource('/api/sse', {
  withCredentials: true
});

// 方式 2: 初始连接后验证
app.get('/api/sse', (req, res) => {
  const sessionId = req.cookies.sessionId;

  if (!validateSession(sessionId)) {
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  // ... 建立 SSE 连接
});
```

### 连接数限制

```javascript
const connections = new Map();
const MAX_CONNECTIONS_PER_IP = 5;

app.get('/api/sse', (req, res) => {
  const ip = req.ip;

  if (connections.get(ip) >= MAX_CONNECTIONS_PER_IP) {
    res.writeHead(429);
    res.end('Connection limit exceeded');
    return;
  }

  connections.set(ip, connections.get(ip) + 1);

  req.on('close', () => {
    connections.set(ip, connections.get(ip) - 1);
  });
});
```

### 速率限制

```javascript
const rateLimiter = {
  windowMs: 1000,
  maxEvents: 10,
  counts: {},

  check(clientId) {
    const now = Date.now();
    const key = `${clientId}:${Math.floor(now / this.windowMs)}`;
    this.counts[key] = (this.counts[key] || 0) + 1;
    return this.counts[key] <= this.maxEvents;
  }
};
```

---

## 实际应用场景

### 1. 实时通知系统

```javascript
// 服务器: 通知推送服务
class NotificationService {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(userId, client) {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, []);
    }
    this.subscribers.get(userId).push(client);
  }

  notify(userId, notification) {
    const clients = this.subscribers.get(userId);
    if (clients) {
      clients.forEach(client => {
        client.send({
          event: 'notification',
          data: notification
        });
      });
    }
  }
}

// 客户端
const eventSource = new EventSource(`/api/notifications/${userId}`);

eventSource.addEventListener('notification', (event) => {
  const notification = JSON.parse(event.data);
  showToast(notification.title, notification.body);
});
```

### 2. 实时数据仪表盘

```javascript
// 服务器: 系统监控
app.get('/api/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');

  const sendMetric = () => {
    const metrics = {
      cpu: os.loadavg()[0],
      memory: (1 - os.freemem() / os.totalmem()) * 100,
      connections: activeConnections.size()
    };
    res.write(`data: ${JSON.stringify(metrics)}\n\n`);
  };

  const interval = setInterval(sendMetric, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});
```

### 3. 聊天消息推送

```javascript
// 服务器: 消息推送
function handleChatSSE(req, res, userId) {
  res.setHeader('Content-Type', 'text/event-stream');

  const sendMessage = (message) => {
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  };

  subscribe(userId, sendMessage);

  req.on('close', () => {
    unsubscribe(userId, sendMessage);
  });
}
```

### 4. AI 流式响应

```javascript
// 服务器: AI 流式生成
app.post('/api/ai/chat', async (req, res) => {
  const { prompt } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');

  try {
    const stream = await ai.generateStream(prompt);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
    }

    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
  }

  res.end();
});
```

---

## 性能优化

### 1. 连接池管理

```javascript
class SSEConnectionPool {
  constructor(maxConnections = 100) {
    this.pool = new Map();
    this.maxConnections = maxConnections;
  }

  get(key) {
    if (this.pool.size >= this.maxConnections) {
      const oldest = this.findOldest();
      if (oldest) {
        oldest.close();
        this.pool.delete(oldest.key);
      }
    }

    const connection = new SSEConnection(key);
    this.pool.set(key, connection);
    return connection;
  }

  remove(key) {
    const connection = this.pool.get(key);
    if (connection) {
      connection.close();
      this.pool.delete(key);
    }
  }
}
```

### 2. 心跳优化

```javascript
const HEARTBEAT_INTERVAL = 30000; // 30 秒
let lastActivity = Date.now();

const heartbeat = setInterval(() => {
  if (Date.now() - lastActivity >= HEARTBEAT_INTERVAL) {
    res.write(`: heartbeat\n\n`);
    lastActivity = Date.now();
  }
}, HEARTBEAT_INTERVAL);

function onActivity() {
  lastActivity = Date.now();
}
```

### 3. 消息批量处理

```javascript
class MessageBuffer {
  constructor(callback, batchSize = 10, flushInterval = 100) {
    this.callback = callback;
    this.batchSize = batchSize;
    this.buffer = [];
    this.timer = null;
  }

  push(message) {
    this.buffer.push(message);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  flush() {
    if (this.buffer.length > 0) {
      this.callback([...this.buffer]);
      this.buffer = [];
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

---

## 完整示例

### 实时股票行情系统

**前端页面**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Real-time Stock Quotes</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .stock-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      transition: box-shadow 0.3s;
    }
    .stock-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .stock-symbol { font-weight: bold; font-size: 18px; }
    .stock-price { font-size: 24px; color: #333; margin: 8px 0; }
    .stock-change { font-size: 14px; }
    .up { color: #4caf50; }
    .down { color: #f44336; }
  </style>
</head>
<body>
  <h1>Real-time Stock Quotes</h1>
  <div id="stockGrid" class="stock-grid"></div>

  <script>
    const stocks = new Map();

    const eventSource = new EventSource('/api/stocks/stream');

    eventSource.addEventListener('initial-data', (event) => {
      const data = JSON.parse(event.data);
      data.forEach(stock => {
        stocks.set(stock.symbol, stock);
        createStockCard(stock);
      });
    });

    eventSource.addEventListener('stock-update', (event) => {
      const data = JSON.parse(event.data);
      updateStockCard(data);
    });

    function updateStockCard(stock) {
      const existing = stocks.get(stock.symbol);
      if (existing) {
        existing.price = stock.price;
        existing.change = stock.change;
        existing.changePercent = stock.changePercent;

        const card = document.querySelector(`[data-symbol="${stock.symbol}"]`);
        if (card) {
          const priceEl = card.querySelector('.stock-price');
          const changeEl = card.querySelector('.stock-change');

          priceEl.textContent = `$${stock.price.toFixed(2)}`;
          const isUp = stock.change >= 0;
          changeEl.textContent = `${isUp ? '+' : ''}${stock.change.toFixed(2)} (${isUp ? '+' : ''}${stock.changePercent.toFixed(2)}%)`;
          changeEl.className = `stock-change ${isUp ? 'up' : 'down'}`;
        }
      } else {
        stocks.set(stock.symbol, stock);
        createStockCard(stock);
      }
    }

    function createStockCard(stock) {
      const grid = document.getElementById('stockGrid');
      const isUp = stock.change >= 0;

      const card = document.createElement('div');
      card.className = 'stock-card';
      card.dataset.symbol = stock.symbol;
      card.innerHTML = `
        <div class="stock-symbol">${stock.symbol}</div>
        <div class="stock-price">$${stock.price.toFixed(2)}</div>
        <div class="stock-change ${isUp ? 'up' : 'down'}">
          ${isUp ? '+' : ''}${stock.change.toFixed(2)} (${isUp ? '+' : ''}${stock.changePercent.toFixed(2)}%)
        </div>
      `;

      grid.appendChild(card);
    }

    window.addEventListener('beforeunload', () => {
      eventSource.close();
    });
  </script>
</body>
</html>
```

**Node.js 服务器**

```javascript
// server-stock.js
const express = require('express');
const app = express();

const stocks = [
  { symbol: 'AAPL', basePrice: 175.50 },
  { symbol: 'GOOGL', basePrice: 140.25 },
  { symbol: 'MSFT', basePrice: 378.90 },
  { symbol: 'AMZN', basePrice: 178.50 },
  { symbol: 'TSLA', basePrice: 242.80 },
];

const stockPrices = new Map();
stocks.forEach(s => {
  stockPrices.set(s.symbol, {
    symbol: s.symbol,
    price: s.basePrice,
    change: 0,
    changePercent: 0
  });
});

const clients = new Set();

app.get('/api/stocks/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const initialData = Array.from(stockPrices.values());
  res.write(`event: initial-data\n`);
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  clients.add(res);
  console.log(`Client connected. Total: ${clients.size}`);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });
});

function broadcastUpdate() {
  const symbols = Array.from(stockPrices.keys());
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];

  const stock = stockPrices.get(symbol);
  const change = (Math.random() - 0.5) * 2;
  const newPrice = Math.max(1, stock.price + change);
  const totalChange = newPrice - stock.basePrice;
  const changePercent = (totalChange / stock.basePrice) * 100;

  stock.price = parseFloat(newPrice.toFixed(2));
  stock.change = parseFloat(totalChange.toFixed(2));
  stock.changePercent = parseFloat(changePercent.toFixed(2));

  const message = `event: stock-update\ndata: ${JSON.stringify(stock)}\n\n`;

  clients.forEach(client => {
    client.write(message);
  });
}

setInterval(broadcastUpdate, 1000);

app.listen(3000, () => {
  console.log('Stock SSE server running on http://localhost:3000');
});
```

---

## 调试工具

### curl 测试

```bash
# 测试 SSE 端点
curl -N -H "Accept: text/event-stream" http://localhost:3000/api/events

# 测试带 Last-Event-ID 的重连
curl -N -H "Accept: text/event-stream" -H "Last-Event-ID: 5" http://localhost:3000/api/events
```

### 浏览器开发者工具

1. **Network 面板**: 查看 SSE 连接，类型为 ` EventSource`
2. **Response 面板**: 实时查看接收到的数据

### JavaScript 调试技巧

```javascript
class DebugEventSource {
  constructor(url, options = {}) {
    this.original = new EventSource(url, options);
    this.debug = options.debug || false;

    this.original.onopen = (e) => this.log('OPEN', e);
    this.original.onmessage = (e) => this.log('MESSAGE', e.data);
    this.original.onerror = (e) => this.log('ERROR', e);

    return this.original;
  }

  log(type, data) {
    if (this.debug) {
      console.log(`[SSE ${type}]`, data);
    }
  }

  addEventListener(type, listener) {
    this.original.addEventListener(type, (e) => {
      if (this.debug) {
        console.log(`[SSE EVENT: ${type}]`, e.data);
      }
      listener(e);
    });
  }
}

const eventSource = new DebugEventSource('/api/events', { debug: true });
```

---

## 常见问题

### Q: 为什么收到两条相同的消息？

可能是重连导致的。检查 `Last-Event-ID` 是否正确传递，服务器需要实现去重逻辑。

```javascript
const processedEvents = new Set();

function sendEvent(res, eventId, data) {
  if (processedEvents.has(eventId)) {
    return;
  }
  processedEvents.add(eventId);
  res.write(`id: ${eventId}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

### Q: 连接经常断开？

检查网络和代理配置：

1. **Nginx 代理**: 确保 `proxy_buffering off;`
2. **Cloudflare**: SSE 可能被识别为爬虫
3. **AWS ALB**: 默认 60 秒超时，需要配置更长超时

### Q: 如何在 Vue/React 中使用？

**Vue 3 Composition API**

```javascript
import { ref, onMounted, onUnmounted } from 'vue';

export function useSSE(url) {
  const data = ref(null);
  const error = ref(null);
  const connected = ref(false);
  let eventSource = null;

  onMounted(() => {
    eventSource = new EventSource(url);

    eventSource.onopen = () => { connected.value = true; };
    eventSource.onmessage = (event) => { data.value = JSON.parse(event.data); };
    eventSource.onerror = (err) => { error.value = err; connected.value = false; };
  });

  onUnmounted(() => {
    if (eventSource) {
      eventSource.close();
    }
  });

  return { data, error, connected };
}
```

**React Hook**

```javascript
import { useState, useEffect, useRef } from 'react';

function useSSE(url) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => setConnected(true);
    eventSource.onmessage = (event) => setData(JSON.parse(event.data));
    eventSource.onerror = () => setConnected(false);

    return () => {
      eventSource.close();
    };
  }, [url]);

  return { data, connected };
}
```

### Q: SSE 与 WebSocket 同时使用？

可以共存，根据场景选择：

```javascript
// 简单推送场景用 SSE
const eventSource = new EventSource('/api/notifications');

// 实时交互场景用 WebSocket
const ws = new WebSocket('wss://api/ws');
```

### Q: 如何限制最大连接数？

```javascript
const MAX_CONNECTIONS = 1000;
const activeConnections = new Set();

app.get('/api/sse', (req, res) => {
  if (activeConnections.size >= MAX_CONNECTIONS) {
    res.writeHead(503, { 'Retry-After': 30 });
    res.end('Server busy');
    return;
  }

  activeConnections.add(res);

  res.on('close', () => {
    activeConnections.delete(res);
  });
});
```

### Q: 支持二进制数据？

SSE 本身是文本协议。传输二进制需要 Base64 编码：

```javascript
// Base64 编码
const binaryData = new Uint8Array([0x00, 0xFF, 0x42]);
const base64 = btoa(String.fromCharCode(...binaryData));

res.write(`data: ${base64}\n\n`);
```

---

## 参考资源

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [HTML5 Specification: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SSE Demo](https://www.html5rocks.com/en/tutorials/eventsource/basics/)
- [Can I Use: EventSource](https://caniuse.com/eventsource)
