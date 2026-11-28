# 第三方依赖与来源说明

本仓库 `xinz/` 下的插件均为明文源码，不包含 Bncr `Code Encryption Block`、`HideStart/HideEnd` 加密块或混淆压缩代码。

## 运行时依赖

插件通过 `require()` 使用以下第三方 npm 包，均为公开开源项目；具体许可证以各包内 `LICENSE` 为准：

| 包 | 用途 | 常见许可证 |
| --- | --- | --- |
| axios | HTTP 请求 | MIT |
| cheerio | HTML 解析 | MIT |
| ssh2 | SSH 连接 | MIT |
| systeminformation | 主机状态采集 | MIT |
| mqtt | MQTT 客户端 | MIT |
| jsonpath-plus | JSONPath 取值 | MIT |
| xml2js | XML 解析 | MIT |
| uuid | 唯一 ID | MIT |
| md5 | 摘要 | BSD-3-Clause |
| mime-types | MIME 类型 | MIT |
| fluent-ffmpeg | 音视频处理 | MIT |
| puppeteer | 无头浏览器 | Apache-2.0 |
| @google/generative-ai | Gemini 接口 | Apache-2.0 |
| got | HTTP 请求 | MIT |

`node:crypto`、`fs`、`path`、`os`、`net`、`tls`、`http`、`https`、`dns`、`vm`、`events`、`child_process` 为 Node.js 内置模块，不属于第三方依赖。

## 代码来源

- `plugins/xinz/`：本项目自用改造版，作者 seven / xinz。
- `plugins/娱乐`、`plugins/实用工具`、`plugins/效率工具`、`plugins/数据统计`、`plugins/群管理`：来自 Bncr 社区或公开插件仓库，版权归原作者，已保留原有头部注释。
- 已移除：`plugins/xinz/mod/CryptoJS.js`（无任何插件引用的历史第三方库）、三个加密插件文件（均有仓库内明文等价实现）。

如发现遗漏的第三方来源或需要补充许可证，请提交 Issue。
