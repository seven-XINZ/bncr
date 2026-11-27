# 海豚AI（DolphinVoice）TTS 对接总览

海豚AI 的开放语音服务（DolphinVoice）是一套云端 TTS：提供 HTTP 非流式合成和 WebSocket 流式合成，支持中/日/英共 19 个声线、11 种情绪和 15 种风格，适合做客服播报、有声书、旁白、角色扮演和短视频配音。

- 服务域名：`api.voice.dolphin-ai.jp`
- HTTP 合成：`POST https://api.voice.dolphin-ai.jp/v1/tts/api`
- WebSocket 流式：`wss://api.voice.dolphin-ai.jp/v1/tts/ws`
- 取 Token：`POST https://api.voice.dolphin-ai.jp/platform/v1/auth/online/token`
- 官方文档：`https://developers.dolphinvoice.ai/en/docs/api/tts/tts`

## 先分清两个“海豚AI”

| 产品 | 入口 | 是否有公开 API | 说明 |
| --- | --- | --- | --- |
| DolphinVoice | `dolphinvoice.ai` / `api.voice.dolphin-ai.jp` | 有，本文档就是它 | AppID + AppSecret 换 Token，按字节计费 |
| 海豚AI配音（网页版） | `ttson.cn` | 未见公开 API 文档 | 网页端配音工具，声线叫艾墨/艾颖/知琪等，和本文的 voice 名不是一套 |

两套的 voice 名、情绪名不能混用；要接 API 就用 DolphinVoice 的 `voice` token。

## 一、鉴权：AppID + AppSecret 换 Token

Token 有效期 7 天，建议服务端缓存并在到期前 1 小时刷新。AppSecret 只能放在服务端，不能下发到客户端。

### 1. 拼签名串

参数按字典序排列，去掉 signature 本身：

```
app_id=<APP_ID>&secret=<APP_SECRET>&timestamp=<秒级时间戳>
```

### 2. HMAC-SHA1 + Base64

用 AppSecret 作为 key，对上面的字符串做 HMAC-SHA1，再 Base64：

```python
import base64, hmac, hashlib, time
ts = str(int(time.time()))
raw = f"app_id={APP_ID}&secret={APP_SECRET}&timestamp={ts}"
sig = base64.b64encode(hmac.new(APP_SECRET.encode(), raw.encode(), hashlib.sha1).digest()).decode()
```

### 3. 请求 Token

```bash
curl -X POST https://api.voice.dolphin-ai.jp/platform/v1/auth/online/token \
  -H "Content-Type: application/json" \
  -d '{"app_id":"<APP_ID>","timestamp":1700000000,"signature":"<SIGNATURE>"}'
```

成功返回：

```json
{"status":"000000","message":"success","data":{"app_id":"...","token":"eyJhbGci...","expiration_time":1700600000}}
```

`data.expiration_time` 是秒级过期时间；`status` 不是 `000000` 就是失败，先看 `message`。

## 二、HTTP 非流式合成

### 请求

```
POST /v1/tts/api
Content-Type: application/json
Authorization: Bearer <TOKEN>
```

官方文档在 HTTP 示例里只写了 Content-Type，但鉴权章节明确要求所有服务端接口都带 `Authorization: Bearer <Token>`，实际调用请带上，否则容易 401。

### 参数

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| text | 是 | 待合成文本，≤1024 字节 UTF-8，约 300 汉字 |
| lang_type | 是 | 语言，如 `zh-cmn-Hans-CN`、`ja-JP`、`en-US` |
| text_type | 否 | `plain`（默认）或 `ssml` |
| voice | 是 | 声线 token，见 `voices.md` |
| sample_rate | 否 | 8000 / 16000 / 24000，默认 16000 |
| format | 否 | `wav` / `pcm` / `mp3`；wav 不支持流式 |
| speech_rate | 否 | 语速 0.2–3，默认 1 |
| volume | 否 | 音量 0.1–3，默认 1 |
| pitch_rate | 否 | 音调 0.1–3，默认 1 |
| emotion | 否 | 情绪/风格 token，见 `emotions.md`；不传为中性 |
| silence_duration | 否 | 句尾静音 0–10000ms，默认 125 |
| enable_timestamp | 否 | 是否返回时间戳，true/false |

### 示例

```bash
curl -X POST https://api.voice.dolphin-ai.jp/v1/tts/api \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "text":"欢迎使用鑫仔的智能管家，海豚AI 语音服务已就绪。",
    "lang_type":"zh-cmn-Hans-CN",
    "voice":"Xiaohui",
    "emotion":"customer_service",
    "format":"mp3",
    "sample_rate":24000,
    "speech_rate":1.0,
    "pitch_rate":1.0
  }'
```

### 响应

```json
{"status":"000000","message":"success","data":{"result":"<Base64音频>","duration":3200,"timestamp":"[...]"}}
```

- `data.result` 是 Base64 音频，按 `format` 解码后写文件或直接推流。
- `data.duration` 是音频时长，单位毫秒，可用于估算播放进度。
- `data.timestamp` 是 JSON 字符串（开启 `enable_timestamp` 时才有），用于字幕对齐。

Node 落盘：

```js
const buf = Buffer.from(resp.data.result, 'base64');
fs.writeFileSync('tts.mp3', buf);
```

## 三、WebSocket 流式合成

适合边合成边播放，首包延迟低。连接 `wss://api.voice.dolphin-ai.jp/v1/tts/ws`，握手头带 `Authorization: Bearer <TOKEN>`。

发送首帧（JSON）：

```json
{
  "text": "今天成都天气多云，气温 12 到 18 度。",
  "lang_type": "zh-cmn-Hans-CN",
  "voice": "Xiaohui",
  "emotion": "assistant",
  "format": "mp3",
  "sample_rate": 24000,
  "speech_rate": 1.0
}
```

服务端事件：

- `SynthesisStarted`：开始合成，返回本次会话信息
- `SynthesisDuration`：音频总时长
- `SynthesisTimestamp`：时间戳数据
- `SynthesisCompleted`：合成结束，随后连接关闭

注意：`format=wav` 不支持流式，流式请用 `mp3` 或 `pcm`。

## 四、接进 Bncr 的建议

1. 配置项只存 `appId`、`appSecret`、默认 `voice`、默认 `emotion`，不要硬编码到源码。
2. Token 放 `modStore` 或 `mod/data/tts-token.json`，记录 `expiration_time`，提前 1 小时刷新；多进程共用一个文件时加锁或只让主进程刷新。
3. 文本先按 300 汉字切段，按标点切，别把句子切断；每段单独请求后按顺序拼接。
4. 群聊场景默认 `format=mp3`、`sample_rate=24000`，文件更小；做字幕才开 `enable_timestamp`。
5. 失败降级：Token 失效自动重取一次；仍失败就回文字，不要把错误堆栈发到群里。
6. 缓存相同文本的音频（按 `voice+emotion+rate+text` 做 key），天气、问候这类高频句能省不少调用。

## 五、排错清单

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 401 / 110001 | Token 缺失、错误或过期 | 重新取 Token，检查 `Bearer ` 后面有空格 |
| 110008 | 签名不对 | 检查参数顺序、timestamp 是否为秒、Base64 是否标准 |
| 110007 | AppID 不存在 | 核对控制台 AppID |
| 110009 | Token 过期 | 按 `expiration_time` 提前刷新 |
| 300000 | 参数非法 | 看 message 里的字段名，常见是 lang_type 与 voice 不匹配 |
| 返回有 result 但没声音 | Base64 没解码 / format 与扩展名不符 | mp3 存 .mp3，pcm 需要播放器按 raw 处理 |
| 文本超长 | 超过 1024 字节 | 切段，中文约 300 字以内存疑 |
