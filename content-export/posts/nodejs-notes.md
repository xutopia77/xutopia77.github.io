---
title: "\U0001F7E2 Node.js 完整笔记"
published: '2026-04-20'
description: ''
tags:
  - 前端技术
  - web
category: 前端技术
---
# Node.js 笔记

## 目录

- [Node.js 简介](#nodejs-简介)
- [安装 Node.js](#安装-nodejs)
- [版本管理工具 nvm](#版本管理工具-nvm)
- [包管理器](#包管理器)
- [npm 常用命令](#npm-常用命令)
- [package.json 详解](#packagejson-详解)
- [模块系统](#模块系统)
- [核心模块](#核心模块)
- [环境配置](#环境配置)
- [常见问题](#常见问题)

---

## Node.js 简介

Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行时环境，允许在服务器端执行 JavaScript 代码。

**特点：**
- 事件驱动、非阻塞 I/O 模型
- 轻量高效，适合数据密集型实时应用
- npm 是全球最大的开源库生态系统

**版本说明：**
- **LTS** (Long Term Support)：长期稳定版，推荐生产环境使用
- **Current**：最新特性版，包含最新功能但可能不稳定

---

## 安装 Node.js

### Windows 系统

**方式一：官网下载安装包**
1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载 Windows Installer (.msi)
3. 运行安装程序，一路 Next 即可

**方式二：使用 Chocolatey**
```shell
# 安装 Chocolatey (需管理员权限)
iwr https://chocolatey.org/install.ps1 -UseBasicParsing | iex

# 安装 Node.js
choco install nodejs
```

**方式三：使用 Winget**
```shell
winget install OpenJS.NodeJS
winget install OpenJS.NodeJS.LTS
```

### macOS 系统

**方式一：官网下载安装包**
1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载 macOS Installer (.pkg)
3. 运行安装程序

**方式二：使用 Homebrew**
```shell
# 安装 Homebrew (若未安装)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node

# 安装 LTS 版本
brew install node@lts
```

**方式三：使用 nvm**
```shell
# 安装 nvm (见下文 nvm 章节)
```

### Linux 系统

#### Ubuntu / Debian

```shell
# 更新系统包
sudo apt update
sudo apt upgrade

# 移除旧版本(若有)
sudo apt remove nodejs npm

# 添加 NodeSource 仓库 (以 LTS 版本为例)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

# 安装 Node.js
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v
```

#### CentOS / RHEL / Fedora

```shell
# 添加 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 或使用 dnf
sudo dnf install -y nodejs
```

#### Arch Linux

```shell
sudo pacman -S nodejs npm
```

#### Alpine Linux

```shell
apk add nodejs npm
```

### Docker 环境中使用

```shell
# 拉取官方镜像
docker pull node:latest
docker pull node:lts

# 运行交互式容器
docker run -it node:latest bash

# 运行特定版本
docker run -it node:18 bash
```

---

## 版本管理工具 nvm

nvm (Node Version Manager) 允许在同一台机器上管理多个 Node.js 版本。

### 安装 nvm

**Linux / macOS**
```shell
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

或使用 wget：
```shell
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

**Windows**
Windows 系统使用 [nvm-windows](https://github.com/coreybutler/nvm-windows)：

1. 下载安装包：https://github.com/coreybutler/nvm-windows/releases
2. 运行安装程序

### nvm 常用命令

```shell
# 安装 nvm-windows 后验证
nvm version

# 查看可用版本
nvm list available

# 安装最新稳定版
nvm install lts
nvm install --lts

# 安装最新版本
nvm install latest

# 安装指定版本
nvm install 18.17.0
nvm install 20

# 查看已安装版本
nvm list
nvm ls

# 切换使用某个版本
nvm use 18.17.0
nvm use lts

# 设置默认版本
nvm alias default 18.17.0

# 卸载指定版本
nvm uninstall 16.20.0

# 查看当前版本
nvm current

# 允许在特定版本上运行命令
nvm run 18.17.0 --version
```

### nvm 高级配置

```shell
# 设置镜像 (解决国内下载慢的问题)
export NVM_NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node

# 开启/关闭 node 版本自动切换
echo 'autoload -U add-zsh-hook' >> ~/.zshrc
load-nvmrc() { ... }  # 可配置自动读取 .nvmrc 文件
```

---

## 包管理器

### npm (Node Package Manager)

npm 是 Node.js 默认的包管理器，集成在 Node.js 安装包中。

### pnpm (Performant npm)

pnpm 是一个快速、节省空间的包管理器，使用硬链接避免重复存储。

**安装 pnpm**
```shell
# 使用 npm 安装
npm install -g pnpm

# 使用 corepack 启用 (Node.js 16+)
corepack enable
corepack prepare pnpm@latest --activate

# 使用脚本安装
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

**pnpm 常用命令**
```shell
pnpm install
pnpm add <package>
pnpm add <package> -D          # 开发依赖
pnpm add <package> -g           # 全局安装
pnpm remove <package>
pnpm update
pnpm outdated
pnpm list
pnpm list -g
pnpm run <script>
pnpm init
```

### yarn

**安装 yarn**
```shell
# 使用 npm 安装
npm install -g yarn

# 使用 corepack 启用
corepack enable
corepack prepare yarn@stable --activate
```

**yarn 常用命令**
```shell
yarn install
yarn add <package>
yarn add <package> --dev
yarn add <package> -g
yarn remove <package>
yarn upgrade
yarn upgrade-interactive
yarn list
yarn run <script>
yarn init
yarn info <package>
```

---

## npm 常用命令

### 基础命令

```shell
# 查看 npm 版本
npm -v
npm --version

# 查看帮助
npm help
npm --help

# 查看命令列表
npm commands
```

### package.json 相关

```shell
# 初始化项目 (创建 package.json)
npm init
npm init -y                   # 跳过问答，全部默认
npm init --yes

# 设置初始值
npm init --scope=username     # 设置 scope 用户名
npm init --yes --scope=username --author-name="Your Name"
```

### 安装依赖

```shell
# 安装项目所有依赖
npm install
npm install --legacy-peer-deps  # 忽略 peer dependencies 冲突

# 安装指定包
npm install <package>
npm install <package>@<version>    # 指定版本
npm install <package>@latest       # 最新版本
npm install <package>@">=1.0.0 <2.0.0"  # 版本范围

# 安装并保存到 dependencies (生产依赖)
npm install <package> --save
npm install <package> -S
npm install <package> --save-prod

# 安装并保存到 devDependencies (开发依赖)
npm install <package> --save-dev
npm install <package> -D

# 安装全局包
npm install <package> -g
npm install --global <package>

# 从本地安装
npm install ./path/to/package
npm install /path/to/package.tgz

# 安装 Git URL
npm install git://github.com/user/project.git
npm install git+ssh://git@github.com:user/project.git
npm install git+https://github.com/user/project.git

# 安装特定 tag
npm install <package>@beta
npm install <package>@rc
```

### 更新依赖

```shell
# 查看可更新的包
npm outdated

# 更新所有包
npm update

# 更新指定包
npm update <package>

# 检查包最新版本
npm outdated <package>
```

### 卸载依赖

```shell
# 卸载指定包
npm uninstall <package>
npm remove <package>
npm rm <package>

# 卸载并从 package.json 移除
npm uninstall <package> --save
npm uninstall <package> -S
npm uninstall <package> --save-dev
npm uninstall <package> -D

# 卸载全局包
npm uninstall <package> -g
```

### 运行脚本

```shell
# 运行 package.json 中定义的脚本
npm run <script>

# 常用预设脚本
npm run start          # 启动项目
npm run dev            # 开发模式
npm run build          # 构建项目
npm run test           # 运行测试
npm run lint           # 代码检查
npm run format        # 代码格式化

# 直接执行 bin 命令
npx <command>
npx create-react-app my-app
```

### 包搜索与管理

```shell
# 在 npm 仓库搜索包
npm search <keyword>
npm s <keyword>

# 查看包信息
npm view <package>
npm v <package>

# 查看特定信息
npm view <package> version
npm view <package> versions
npm view <package> dependencies
npm view <package> repository.url
npm view <package>engines

# 查看包在仓库中的状态
npm pack <package>    # 下载包的 tarball
```

### 查看已安装的包

```shell
# 查看当前项目依赖树
npm list
npm ls

# 查看全局包
npm list -g
npm ls -g
npm list -g --depth=0

# 查看包的所有版本
npm view <package> versions --json
```

### 缓存管理

```shell
# 查看缓存
npm cache ls
npm cache ls <package>

# 清理缓存
npm cache clean
npm cache clean --force

# 验证缓存
npm cache verify
```

### npm 配置

```shell
# 查看配置
npm config list
npm config list -l          # 查看所有配置
npm config get <key>
npm config list --json      # JSON 格式输出

# 设置配置
npm config set <key> <value>
npm config set registry https://registry.npmjs.org
npm config set <key> <value> --location=user     # 用户配置
npm config set <key> <value> --location=project   # 项目配置

# 删除配置
npm config delete <key>

# 编辑配置文件
npm config edit
```

---

## package.json 详解

package.json 是 Node.js 项目的核心配置文件。

### 基本结构

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "description": "项目描述",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "build": "webpack --mode production",
    "test": "jest",
    "lint": "eslint ."
  },
  "keywords": ["nodejs", "javascript"],
  "author": "Your Name <email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/project.git"
  },
  "bugs": {
    "url": "https://github.com/username/project/issues"
  },
  "homepage": "https://github.com/username/project#readme",
  "dependencies": {},
  "devDependencies": {}
}
```

### 字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `name` | 项目名称 | `"my-project"` |
| `version` | 版本号 | `"1.0.0"` |
| `description` | 项目描述 | `"A cool project"` |
| `main` | 入口文件 | `"src/index.js"` |
| `type` | 模块类型 | `"module"` 或 `"commonjs"` |
| `scripts` | 命令别名 | `{"start": "node index.js"}` |
| `keywords` | 关键字 | `["web", "nodejs"]` |
| `author` | 作者 | `"Name <email>"` |
| `license` | 许可证 | `"MIT"` |
| `repository` | 仓库地址 | `{type: "git", url: "..."}` |
| `engines` | Node 版本要求 | `{"node": ">=16"}` |
| `os` | 支持的操作系统 | `["darwin", "linux"]` |
| `cpu` | 支持的 CPU 架构 | `["x64", "arm64"]` |

### dependencies vs devDependencies

**dependencies** - 生产环境依赖
```json
"dependencies": {
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "dotenv": "^16.3.1"
}
```

**devDependencies** - 开发环境依赖
```json
"devDependencies": {
  "webpack": "^5.88.0",
  "jest": "^29.6.0",
  "eslint": "^8.45.0"
}
```

### 版本号语义化 (SemVer)

```
major.minor.patch
  ^     ^    ^
  |     |    +-- patch: 修复 bug，完全向下兼容
  |     +------- minor: 新功能，向后兼容
  +------------- major: 破坏性更新，不向下兼容
```

| 符号 | 含义 | 示例 |
|------|------|------|
| `^` | 允许 minor 和 patch 更新 | `^1.2.3` → `1.x.x` |
| `~` | 允许 patch 更新 | `~1.2.3` → `1.2.x` |
| `*` | 最新版本 | `*` |
| `>=` | 大于等于 | `>=1.0.0` |
| `1.0.0 - 2.0.0` | 版本范围 | `1.0.0 - 2.0.0` |
| `latest` | 最新标签版本 | `latest` |

### scripts 变量

```json
{
  "scripts": {
    "build": "webpack --progress --config webpack.config.js",
    "postinstall": "if [ -f ./scripts/postinstall.js ]; then node ./scripts/postinstall.js; fi",
    "prebuild": "rimraf dist"
  }
}
```

常用生命周期钩子：
- `preinstall` - 安装前
- `postinstall` - 安装后
- `preuninstall` - 卸载前
- `postuninstall` - 卸载后
- `prepublish` - 发布前
- `preversion` - 版本更新前
- `postversion` - 版本更新后
- `pretest` / `posttest` - 测试前后
- `prestop` / `poststop` - 停止前后
- `prestart` / `poststart` - 启动前后

---

## 模块系统

### CommonJS (CJS)

Node.js 默认的模块系统，使用 `require()` 导入和 `module.exports` 导出。

```javascript
// 导出方式 1: module.exports
const add = (a, b) => a + b;
module.exports = add;

// 导出方式 2: module.exports = {}
module.exports = {
  add,
  subtract: (a, b) => a - b
};

// 导出方式 3: exports.alias
exports.add = add;
exports.subtract = (a, b) => a - b;

// 导入
const add = require('./math');
const { add, subtract } = require('./math');
```

### ES Modules (ESM)

ES6 引入的模块系统，使用 `import` 导入和 `export` 导出。

**注意：** 需要在 package.json 中设置 `"type": "module"`，或使用 `.mjs` 扩展名。

```javascript
// 导出方式 1: export
export const add = (a, b) => a + b;
export const subtract = (a, b) => a - b;

// 导出方式 2: export default
const add = (a, b) => a + b;
export default add;

// 导出方式 3: export { }
const add = (a, b) => a + b;
export { add };

// 导入
import add from './math.js';
import { add, subtract } from './math.js';
import * as math from './math.js';
```

### 模块解析

```javascript
// 相对路径
require('./utils');           // ./utils.js
require('./utils.js');       // 明确扩展名
require('./');                // 查找 ./index.js

// 绝对路径
require('/usr/local/utils');  // 绝对路径

// 模块路径 (node_modules)
require('express');           // 查找 node_modules/express
require('@babel/core');       // 查找 node_modules/@babel/core

// 目录作为模块
require('./dir');             // 查找 ./dir/index.js 或 ./dir/package.json 的 main 字段
```

### require() 缓存机制

```javascript
// 模块只会被加载一次，之后从缓存返回
console.log(require.cache);

// 清除特定模块缓存
delete require.cache[require.resolve('./module')];
```

---

## 核心模块

Node.js 内置的核心模块，无需额外安装即可使用。

### path - 路径操作

```javascript
const path = require('path');

// 路径拼接
path.join('/foo', 'bar', 'baz/asdf');
// → '/foo/bar/baz/asdf'

// 解析为绝对路径
path.resolve('index.js');
// → '/Users/me/project/index.js'

path.resolve('/foo', './bar');
// → '/foo/bar'

// 获取路径信息
path.basename('/foo/bar/index.js');  // → 'index.js'
path.dirname('/foo/bar/index.js');   // → '/foo/bar'
path.extname('/foo/bar/index.js');   // → '.js'

// 判断路径类型
path.isAbsolute('/foo/bar');   // → true
path.isAbsolute('./foo/bar');  // → false

// 解析路径
path.parse('/foo/bar/index.js');
// → { root: '/', dir: '/foo/bar', base: 'index.js', ext: '.js', name: 'index' }

// 路径格式化
path.format({
  dir: '/foo/bar',
  name: 'index',
  ext: '.js'
});
// → '/foo/bar/index.js'

// 跨平台路径分隔符
path.sep;           // Linux/macOS: '/', Windows: '\\'
path.delimiter;     // Linux/macOS: ':', Windows: ';'
```

### fs - 文件系统

```javascript
const fs = require('fs');
const fsPromises = require('fs').promises;  // Promise 风格

// 同步读取
const content = fs.readFileSync('./file.txt', 'utf8');

// 异步回调风格
fs.readFile('./file.txt', 'utf8', (err, data) => {
  if (err) throw err;
  console.log(data);
});

// Promise 风格 (Node.js 10+)
(async () => {
  const data = await fsPromises.readFile('./file.txt', 'utf8');
  console.log(data);
})();

// 同步方法列表
fs.readFileSync()
fs.writeFileSync()
fs.appendFileSync()
fs.mkdirSync()
fs.rmdirSync()
fs.readdirSync()
fs.statSync()
fs.existsSync()
fs.copyFileSync()
fs.unlinkSync()
fs.renameSync()

// 异步方法列表
fs.readFile()
fs.writeFile()
fs.appendFile()
fs.mkdir()
fs.rmdir()
fs.readdir()
fs.stat()
fs.access()
fs.copyFile()
fs.unlink()
fs.rename()

// Promise 方法 (fs.promises)
fsPromises.readFile()
fsPromises.writeFile()
fsPromises.mkdir()
fsPromises.readdir()
fsPromises.stat()
fsPromises.access()
```

### os - 操作系统信息

```javascript
const os = require('os');

os.platform();      // 'linux', 'darwin', 'win32'
os.arch();           // 'x64', 'arm64'
os.release();        // 操作系统版本
os.type();           // 'Linux', 'Darwin', 'Windows_NT'
os.homedir();        // 用户主目录
os.tmpdir();         // 临时文件目录
os.hostname();       // 主机名
os.EOL;              // 换行符 '\n' (Linux/macOS) 或 '\r\n' (Windows)
os.cpus();           // CPU 信息
os.totalmem();       // 总内存 (bytes)
os.freemem();        // 空闲内存 (bytes)
os.networkInterfaces();  // 网络接口
os.uptime();         // 系统运行时间 (秒)
os.loadavg();        // 平均负载 (Linux/macOS)
```

### util - 工具函数

```javascript
const util = require('util');
const { promisify } = util;
const { callbackify } = util;

// 将回调函数转为 Promise
const fsReadFile = promisify(fs.readFile);
const data = await fsReadFile('./file.txt', 'utf8');

// 将 async 函数转为回调风格
const asyncFn = async () => {};
const callbackFn = callbackify(asyncFn);

// 格式化字符串
util.format('%s:%d', 'hello', 123);  // 'hello:123'
util.format('%s:%s', 'hello');       // 'hello:%s'

// inspect 对象查看
util.inspect({ a: 1, b: { c: 2 } });
// → "{ a: 1, b: { c: 2 } }"

// 类型检查
util.types.isPromise(p);           // 是否为 Promise
util.types.isArray(arr);           // 是否为数组
util.types.isDate(date);           // 是否为日期
util.types.isRegExp(regex);        // 是否为正则
util.types.isMap(map);             // 是否为 Map
util.types.isSet(set);             // 是否为 Set
util.types.isAsyncFunction(fn);    // 是否为 async 函数
util.types.isGeneratorFunction(fn);// 是否为生成器函数
```

### events - 事件触发器

```javascript
const EventEmitter = require('events');

class MyEmitter extends EventEmitter {}

const emitter = new MyEmitter();

// 监听事件
emitter.on('event', (arg1, arg2) => {
  console.log('事件触发', arg1, arg2);
});

// 只触发一次的监听器
emitter.once('event', () => {
  console.log('只触发一次');
});

// 发送事件
emitter.emit('event', '参数1', '参数2');

// 移除监听器
emitter.off('event', listenerFn);
emitter.removeListener('event', listenerFn);

// 移除所有监听器
emitter.removeAllListeners();
emitter.removeAllListeners('event');

// 查看监听器数量
emitter.listenerCount('event');

// 查看所有监听器
emitter.listeners('event');

// 错误事件
emitter.on('error', (err) => {
  console.error('错误:', err);
});
```

### crypto - 加密模块

```javascript
const crypto = require('crypto');

// 创建哈希
const hash = crypto.createHash('sha256');
hash.update('hello');
console.log(hash.digest('hex'));

// 创建 HMAC
const hmac = crypto.createHmac('sha256', 'secret-key');
hmac.update('hello');
console.log(hmac.digest('hex'));

// 加密
const cipher = crypto.createCipher('aes192', 'password');
let encrypted = cipher.update('hello', 'utf8', 'hex');
encrypted += cipher.final('hex');

// 解密
const decipher = crypto.createDecipher('aes192', 'password');
let decrypted = decipher.update(encrypted, 'hex', 'utf8');
decrypted += decipher.final('utf8');

// 随机数据
crypto.randomBytes(16);            // 16 字节随机数据
crypto.randomUUID();               // UUID v4

// 生成密钥
crypto.generateKey('aes', { length: 256 });

// diffie-hellman 密钥交换
const dh = crypto.createDiffieHellman(2048);
```

### buffer - 二进制数据

```javascript
const buffer = Buffer.alloc(10);       // 创建 10 字节缓冲区
const buffer = Buffer.from('hello');   // 从字符串创建
const buffer = Buffer.from([1, 2, 3]);  // 从数组创建

// 编码转换
buffer.toString('utf8');
buffer.toString('hex');
buffer.toString('base64');

// 写入
buffer.write('hello', 0, 5, 'utf8');

// 拼接
Buffer.concat([buf1, buf2, buf3]);

// 复制
buf.copy(targetBuf, targetStart, sourceStart, sourceEnd);

// 比较
buffer.compare(otherBuffer);

// 切片
buffer.slice(0, 5);

// 长度
buffer.length;
```

### stream - 流

```javascript
const { Readable, Writable, Transform, Duplex, pipeline } = require('stream');
const fs = require('fs');

// 读取流
const readStream = fs.createReadStream('./file.txt');
readStream.on('data', chunk => { /* 处理数据块 */ });
readStream.on('end', () => { /* 读取完成 */ });
readStream.on('error', err => { /* 错误处理 */ });

// 写入流
const writeStream = fs.createWriteStream('./output.txt');
writeStream.write('hello');
writeStream.end();
writeStream.on('finish', () => { /* 写入完成 */ });

// 管道 (pipe)
readStream.pipe(writeStream);

// pipeline (更好的错误处理)
pipeline(
  fs.createReadStream('./file.txt'),
  gzip(),
  fs.createWriteStream('./file.txt.gz'),
  (err) => { if (err) console.error('失败:', err); }
);

// Transform 流
const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    this.push(chunk.toString().toUpperCase());
    callback();
  }
});
```

### http / https - HTTP 服务器

```javascript
const http = require('http');
const https = require('https');
const fs = require('fs');

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('服务器运行在 http://127.0.0.1:3000');
});

// HTTP 请求
http.get('http://api.example.com/data', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => { console.log(data); });
});

// HTTPS 请求
const options = {
  hostname: 'api.example.com',
  port: 443,
  path: '/data',
  method: 'GET'
};
https.request(options, (res) => {
  // 处理响应
});
```

### url - URL 解析

```javascript
const url = require('url');

// 解析 URL
const myURL = new URL('https://user:pass@host.com:8080/path?query=value#hash');

console.log(myURL.href);          // 完整 URL
console.log(myURL.protocol);      // 'https:'
console.log(myURL.host);           // 'host.com:8080'
console.log(myURL.hostname);       // 'host.com'
console.log(myURL.port);          // '8080'
console.log(myURL.pathname);       // '/path'
console.log(myURL.search);         // '?query=value'
console.log(myURL.searchParams);  // URLSearchParams
console.log(myURL.hash);          // '#hash'
console.log(myURL.username);      // 'user'
console.log(myURL.password);      // 'pass'

// URLSearchParams
const params = new URLSearchParams(myURL.search);
params.get('query');              // 'value'
params.set('query', 'newvalue');
params.append('page', '1');
params.has('query');              // true
params.delete('query');

// 旧式 url.parse (已废弃)
url.parse('https://example.com/path?query=value', true);
```

### querystring - 查询字符串

```javascript
const querystring = require('querystring');

// 解析查询字符串
querystring.parse('name=test&age=18');
// → { name: 'test', age: '18' }

// 构建查询字符串
querystring.stringify({ name: 'test', age: 18 });
// → 'name=test&age=18'

// 编码
querystring.escape('name=test&age=18');
// → 'name%3Dtest%26age%3D18'

// 解码
querystring.unescape('name%3Dtest');
// → 'name=test'
```

### zlib - 压缩

```javascript
const zlib = require('zlib');

// gzip 压缩
const gzip = zlib.createGzip();
const inp = fs.createReadStream('./file.txt');
const out = fs.createWriteStream('./file.txt.gz');
inp.pipe(gzip).pipe(out);

// 压缩数据
zlib.gzipSync(Buffer.from('hello'));

// 解压数据
zlib.unzipSync(Buffer.from(gzipData));

// 其他压缩格式
zlib.deflateSync();   // deflate
zlib.deflateRawSync(); // raw deflate
zlib.brotli*();       // brotli 压缩
```

### net - TCP 服务器

```javascript
const net = require('net');

// 创建 TCP 服务器
const server = net.createServer((socket) => {
  console.log('客户端连接:', socket.remoteAddress);

  socket.on('data', (data) => {
    console.log('收到数据:', data.toString());
    socket.write('服务器收到');
  });

  socket.on('end', () => {
    console.log('客户端断开');
  });

  socket.write('欢迎连接');
});

server.listen(8080, () => {
  console.log('TCP 服务器监听 8080 端口');
});

// 创建 TCP 客户端
const client = net.createConnection(8080, '127.0.0.1', () => {
  console.log('已连接到服务器');
  client.write('Hello Server');
});
```

### dns - 域名解析

```javascript
const dns = require('dns');
const dnsPromises = require('dns').promises;

// 解析域名
dns.resolve4('example.com', (err, addresses) => {
  if (err) throw err;
  console.log('IPv4 地址:', addresses);
});

dns.resolve6('example.com');
dns.resolveMx('example.com');
dns.resolveTxt('example.com');
dns.resolveNs('example.com');
dns.resolveCname('example.com');
dns.resolveSoa('example.com');
dns.resolveSrv('example.com');
dns.reverse('93.184.216.34');

// Promise 风格
(async () => {
  const addresses = await dnsPromises.resolve4('example.com');
  console.log(addresses);
})();

// 反向解析
dns.reverse('93.184.216.34');

// 查找
dns.lookup('example.com', (err, address, family) => {
  console.log('地址:', address, '类型:', family); // family: 4 或 6
});
```

### process - 进程信息

```javascript
// 进程信息
process.version;           // Node.js 版本
process.versions;          // 依赖库版本
process.platform;          // 平台 'linux', 'darwin', 'win32'
process.arch;              // 架构 'x64', 'arm64'
process.title;             // 进程标题
process.pid;               // 进程 ID
process.ppid;              // 父进程 ID

// 内存使用
process.memoryUsage();
// { rss: 23MB, heapTotal: 10MB, heapUsed: 7MB, external: 1MB }

process.memoryUsage().heapUsed;  // 堆内存使用量

// CPU 使用
process.cpuUsage();
// { user: 10000, system: 5000 }

// 运行时间
process.uptime();          // 进程运行秒数
process.hrtime.bigint();   // 高精度时间 (纳秒)

// 环境变量
process.env;               // 环境变量对象
process.env.NODE_ENV;     // 'development', 'production'
process.env.PATH;
process.env.HOME;

// 命令行参数
process.argv;             // ['node', 'script.js', 'arg1', 'arg2']
process.execArgv;         // Node 特殊参数

// 工作目录
process.cwd();             // 当前工作目录

// 用户信息
process.getuid();          // 用户 ID
process.getgid();          // 组 ID
process.groups;            // 附加组 ID

// 信号
process.on('SIGINT', () => { /* 处理 Ctrl+C */ });
process.on('SIGTERM', () => { /* 处理终止信号 */ });

// 退出
process.exit(0);           // 正常退出
process.exit(1);           // 异常退出
process.kill(pid, 'SIGTERM');

// 下一轮事件循环
process.nextTick(() => { /* 异步执行 */ });
process.setImmediate(() => { /* 立即执行 */ });

// 错误传播
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
});
```

---

## 环境配置

### npm 镜像源配置

```shell
# 查看当前镜像
npm config get registry

# 设置淘宝镜像
npm config set registry https://registry.npmmirror.com

# 设置官方镜像
npm config set registry https://registry.npmjs.org

# 还原默认镜像
npm config set registry https://registry.npmjs.org
```

### nrm - 镜像源管理器

```shell
# 安装 nrm
npm install -g nrm

# 查看可用镜像
nrm ls

# 切换镜像
nrm use taobao
nrm use npm

# 添加镜像
nrm add <name> <url>

# 删除镜像
nrm del <name>

# 测试镜像速度
nrm test
nrm test taobao

# 查看当前使用的镜像
nrm current
```

### cnpm - 淘宝镜像客户端

```shell
# 安装 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com

# 使用 cnpm 代替 npm
cnpm install <package>
cnpm install

# 或使用 npx 直接运行 cnpm
npx cnpm install <package>
```

### .npmrc 配置文件

在用户主目录或项目根目录创建 `.npmrc` 文件：

```ini
# 项目级 .npmrc
registry=https://registry.npmmirror.com
prefix=C:\Users\username\.npm-global
cache=C:\Users\username\.npm-cache
tmp=C:\Users\username\.npm-tmp
```

```ini
# 用户级 .npmrc (~/.npmrc)
registry=https://registry.npmmirror.com
```

### n 环境管理 (Node 版本切换)

```shell
# 全局安装 n
npm install -g n

# 安装稳定版
n stable

# 安装最新版
n latest

# 安装 LTS 版
n lts

# 安装指定版本
n 18.17.0

# 切换版本
n 16.20.0

# 列出已安装版本
n list

# 显示可安装版本
n list --all

# 移除版本
n rm 14.20.0

# 查看当前版本
n

# 使用指定版本执行脚本
n use 18.17.0 node script.js
```

---

## 常见问题

### 安装失败

**问题：npm 安装报错 EACCES (权限拒绝)**
```shell
# 解决方案：修改 npm 全局目录权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**问题：安装卡住不动**
```shell
# 清理缓存后重试
npm cache clean --force
npm install

# 或使用淘宝镜像
npm install --registry=https://registry.npmmirror.com
```

### 版本问题

**Node.js 和 npm 版本不匹配**
```shell
# 查看版本对应关系
# https://nodejs.org/zh-cn/download/releases/
# https://nodejs.org/en/download/releases/

# 升级 npm
npm install -g npm

# 升级 Node.js (使用 nvm)
nvm install lts
nvm use lts
```

### 权限问题

**问题：全局安装报 EACCES**
```shell
# 方法 1：使用 nvm 管理 Node
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install --lts
nvm use --lts

# 方法 2：修复 npm 目录权限
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

### 网络问题

**问题：下载慢或超时**
```shell
# 设置国内镜像
npm config set registry https://registry.npmmirror.com

# 或使用代理
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# 取消代理
npm config delete proxy
npm config delete https-proxy
```

### 其他问题

**Windows 下找不到 node_modules/.bin**
```shell
# 确保在项目根目录执行
cd project-dir
npm install

# Windows 下可能需要使用 Git Bash 或 WSL
```

**删除 node_modules**
```shell
# 使用 rimraf (推荐)
npm install -g rimraf
rimraf node_modules

# 或手动删除
rm -rf node_modules      # Linux/macOS
rd /s /q node_modules     # Windows CMD
```

**npm link 使用**
```shell
# 在开发包目录创建链接
cd package-dir
npm link

# 在项目中使用链接
cd project-dir
npm link package-name

# 取消链接
npm unlink package-name
npm unlink -g package-name
```

---

## 相关资源

- [Node.js 官网](https://nodejs.org/)
- [npm 官网](https://www.npmjs.com/)
- [Node.js 中文文档](https://nodejs.cn/)
- [npm 中文文档](https://www.npmjs.cn/)
- [nvm-windows releases](https://github.com/coreybutler/nvm-windows/releases)
- [Node.js 版本列表](https://nodejs.org/zh-cn/download/releases/)
