# 海豚AI（DolphinVoice）TTS 接入实战：从鉴权到声线、情绪调度

> 给智能管家加一张嘴：19 个声线、26 种情绪/风格，HTTP 和 WebSocket 两条路都能走。这篇把鉴权、参数、踩坑和 Bncr 集成一次讲完。

![海豚AI 语音接入实战](https://raw.githubusercontent.com/seven-XINZ/bncr/main/docs/tts-cover.webp)

## 0. 先分清你用的是哪个“海豚AI”

搜“海豚AI”会同时撞到两个东西：

| 产品 | 入口 | 公开 API | 说明 |
| --- | --- | --- | --- |
| DolphinVoice | `dolphinvoice.ai`，接口域名 `api.voice.dolphin-ai.jp` | 有 | AppID + AppSecret 换 Token，按调用计费，本文讲这套 |
| 海豚AI配音（网页版） | `ttson.cn` | 未见公开 API 文档 | 网页配音工具，声线叫艾墨、艾颖、知琪等 |

两套的声线名、情绪名不通用。你要接自动化、接机器人，走 DolphinVoice；只在网页上做几条配音，用网页版就行。下面所有 `voice`、`emotion` 都是 DolphinVoice 的 token。

## 1. 鉴权：HMAC-SHA1 换 7 天 Token

DolphinVoice 不用 AK/SK 直接调接口，而是先换一个短期 Token：

1. 把 `app_id`、`secret`、`timestamp`（秒）按字典序拼成字符串；
2. 用 AppSecret 做 HMAC-SHA1，再 Base64，得到 `signature`；
3. POST 到 `/platform/v1/auth/online/token`，拿 `data.token`；
4. 之后所有请求带 `Authorization: Bearer <token>`。

签名串长这样：

```
app_id=xxxx&secret=xxxx&timestamp=1700000000
```

Node 实现：

```js
const crypto = require('crypto');

const AUTH_URL = 'https://api.voice.dolphin-ai.jp/platform/v1/auth/online/token';

async function fetchToken(appId, appSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `app_id=${appId}&secret=${appSecret}&timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha1', appSecret).update(raw).digest('base64');

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, timestamp, signature }),
  });
  const json = await res.json();
  if (json.status !== '000000') {
    throw new Error(`换 Token 失败：${json.status} ${json.message}`);
  }
  return json.data; // { app_id, token, expiration_time }
}
```

返回示例：

```json
{
  "status": "000000",
  "message": "success",
  "data": {
    "app_id": "fb5c3de6-...",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiration_time": 1690370423
  }
}
```

`expiration_time` 是秒级时间。Token 默认 7 天有效，建议存文件或数据库，提前 1 小时刷新；多进程部署时只让一个进程刷新，避免互相覆盖。

**安全红线**：AppSecret 只能放服务端。不要写进前端、不要发到群里、不要提交到 Git。

## 2. HTTP 非流式合成：一次请求拿完整音频

```

POST https://api.voice.dolphin-ai.jp/v1/tts/api
Content-Type: application/json
Authorization: Bearer <TOKEN>

```

请求体核心字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| text | 是 | ≤1024 字节 UTF-8，中文约 300 字 |
| lang_type | 是 | `zh-cmn-Hans-CN` / `ja-JP` / `en-US` |
| voice | 是 | 声线 token，如 `Xiaohui` |
| emotion | 否 | 情绪/风格 token，如 `customer_service` |
| format | 否 | `mp3` / `wav` / `pcm`，默认看文档 |
| sample_rate | 否 | 8000 / 16000 / 24000 |
| speech_rate | 否 | 0.2–3，默认 1 |
| volume | 否 | 0.1–3，默认 1 |
| pitch_rate | 否 | 0.1–3，默认 1 |
| text_type | 否 | `plain` 或 `ssml` |
| silence_duration | 否 | 0–10000ms，默认 125 |
| enable_timestamp | 否 | 需要字幕对齐时开 |

封装成函数：

```js
const TTS_URL = 'https://api.voice.dolphin-ai.jp/v1/tts/api';

async function synthesize(token, opts) {
  const body = {
    text: opts.text,
    lang_type: opts.langType || 'zh-cmn-Hans-CN',
    voice: opts.voice || 'Xiaohui',
    emotion: opts.emotion,
    format: opts.format || 'mp3',
    sample_rate: opts.sampleRate || 24000,
    speech_rate: opts.speechRate ?? 1,
    volume: opts.volume ?? 1,
    pitch_rate: opts.pitchRate ?? 1,
  };

  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.status !== '000000') {
    throw new Error(`合成失败：${json.status} ${json.message}`);
  }
  return {
    audio: Buffer.from(json.data.result, 'base64'),
    duration: json.data.duration,
  };
}
```

成功后 `data.result` 是 Base64 音频，`data.duration` 是毫秒时长。做字幕再读 `data.timestamp`，它是 JSON 字符串，不是对象。

## 3. WebSocket 流式：边合成边播

实时对话、长文本播报用流式更合适。地址：

```
wss://api.voice.dolphin-ai.jp/v1/tts/ws
```

握手头带 `Authorization: Bearer <token>`，连接后发一帧 JSON（字段和 HTTP 基本一致），服务端会推事件：

- `SynthesisStarted`：开始合成
- `SynthesisDuration`：总时长
- `SynthesisTimestamp`：时间戳
- `SynthesisCompleted`：结束

```js
const WebSocket = require('ws');

const ws = new WebSocket('wss://api.voice.dolphin-ai.jp/v1/tts/ws', {
  headers: { Authorization: `Bearer ${token}` },
});

ws.on('open', () => {
  ws.send(JSON.stringify({
    text: '今晚八点，直播间到手价只要两位数。',
    lang_type: 'zh-cmn-Hans-CN',
    voice: 'Haoyu',
    emotion: 'advertising',
    format: 'mp3',
    sample_rate: 24000,
  }));
});

ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.event === 'SynthesisCompleted') ws.close();
});
```

注意：`wav` 不支持流式，流式用 `mp3` 或 `pcm`。

## 4. 声线怎么选：先语言，再场景，最后情绪

官方一共 19 个声线：中文 14、日语 3、英语 2。完整清单和每个声线支持的情绪，我整理在知识库里；这里给结论。

### 中文主力

| 声线 | 定位 | 一句话建议 |
| --- | --- | --- |
| Xiaohui | 全能女声 | 不知道选谁就先选它，情绪支持最全 |
| Ruoxuan | 年轻女声 | 短视频口播、客服 |
| Siyue | 标准男声 | 新闻、通知 |
| Mingcheng | 有声书男声 | 纪录片、有声书 |
| Haoxuan | 磁性男声 | 旁白、故事 |
| Sida / Ziyi / Mingyu | 温和男声 | 课程、讲解、助手 |
| Ziyang / Xiaoyue | 古风男声 | 国风文案、诗词 |
| Haoyu | 活力男声 | 广告、活动 |
| Mengqi | 活力女声 | 带货、综艺 |
| Tongtong | 男童 | 儿童内容 |
| Huiya | 温柔女声 | 睡前、安慰 |

### 日语 / 英语

- 日语：`Yuko`（女）、`Norika`（女）、`Yosuke`（男）
- 英语：`Julie`（女）、`John`（男）

读日语就用 `ja-JP` + 日语音色，读英语就用 `en-US` + 英语音色。用中文声线读外语，口音会很怪。

### 选声顺序

1. 先按内容语言筛；
2. 再按场景筛（客服 / 旁白 / 有声书 / 广告 / 儿童）；
3. 最后用 `emotion` 微调，不要反过来。

## 5. 情绪与风格：26 个 token，别乱叠

`emotion` 分两类：11 个基础情绪 + 15 个表达风格。

### 基础情绪

`pleased` 愉悦、`happy` 开心、`sorry` 抱歉、`sad` 悲伤、`angry` 生气、`annoyed` 烦躁、`scare` 惊恐、`hate` 厌恶、`surprise` 惊讶、`tear` 哭泣、`novel_dialog` 平静对白。

### 表达风格

`customer_service` 客服、`professional` 专业、`serious` 严肃、`narrator` 旁白、`narrator_immersive` 沉浸旁白、`comfort` 安慰、`lovey-dovey` 甜腻、`conniving` 腹黑、`tsundere` 傲娇、`charming` 魅惑、`storytelling` 讲故事、`radio` 情感电台、`yoga` 冥想、`advertising` 广告、`assistant` 助手。

### 三条规则

1. 一句只给一个 `emotion`，要变化就切段；
2. 必须和 `voice` 的支持列表匹配，不匹配就降级为不传；
3. 情绪要和文本、标点一致，全句句号却传 `happy`，听起来一定假。

## 6. 角色配方：直接抄作业

| 角色 | 声线 | 情绪 | 参数 |
| --- | --- | --- | --- |
| 智能管家 | Xiaohui / Mingyu | assistant | rate 1.0，pitch 1.0 |
| 电商客服 | Xiaohui / Ruoxuan | customer_service | rate 1.0 |
| 售后道歉 | Huiya | sorry | rate 0.95 |
| 纪录片旁白 | Mingcheng | narrator | rate 0.9，pitch 0.95 |
| 悬疑有声书 | Mingcheng | narrator_immersive | rate 0.85，pitch 0.9 |
| 傲娇大小姐 | Huiya | tsundere | rate 1.05，pitch 1.05 |
| 甜系女友 | Mengqi / Huiya | lovey-dovey | rate 1.0，pitch 1.15 |
| 腹黑反派 | Xiaohui | conniving | rate 0.95 |
| 深夜电台 | Ruoxuan / Huiya | radio | rate 0.9，silence 400 |
| 睡前冥想 | Huiya / Sida | yoga / comfort | rate 0.8，pitch 0.9 |
| 儿童故事 | Tongtong | 不传或 storytelling | rate 0.9 |
| 广告带货 | Haoyu / Mengqi | advertising | rate 1.15 |
| 新闻公告 | Siyue | serious / professional | rate 0.95 |
| 古风独白 | Ziyang / Xiaoyue | narrator | rate 0.9 |

## 7. 接进 Bncr 智能管家：四个工程问题

### 7.1 配置只放四样

```js
{
  dolphinAppId: '',
  dolphinAppSecret: '',
  dolphinVoice: 'Xiaohui',
  dolphinEmotion: 'assistant'
}
```

声线、情绪做成默认值，具体指令可以覆盖；Secret 不写进代码，也不回显到群里。

### 7.2 Token 缓存

Token 存 `mod/data/tts-token.json`：

```json
{ "token": "...", "expire": 1690370423 }
```

读取时判断 `expire - now < 3600` 就刷新。刷新失败但旧 Token 还没过期，继续用旧的，别直接让业务挂掉。

### 7.3 文本切段

接口限制 1024 字节，中文约 300 字。按标点切，优先 `。！？；\n`，每段不超过 250 字，段间保持同一 `voice/emotion/rate`。

```js
function splitText(text, max = 250) {
  const parts = text.split(/(?<=[。！？；\n])/).filter(Boolean);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > max && buf) { out.push(buf); buf = p; }
    else buf += p;
  }
  if (buf) out.push(buf);
  return out;
}
```

### 7.4 缓存与降级

- 高频句（问候、天气、开关灯结果）按 `voice+emotion+rate+text` 做 key 缓存音频，能省大量调用；
- Token 失效自动重取一次；
- 仍失败就回文字，不要把错误堆栈发到群里；
- 群聊默认 `mp3 + 24000`，文件小、兼容好。

## 8. 错误码速查

| 状态码 | 含义 | 处理 |
| --- | --- | --- |
| 110000 | Token 缺失 | 检查 `Authorization` 头 |
| 110001 | Token 无效 | 重取 Token |
| 110006 | Token 创建失败 | 看 message，检查 AppID/Secret |
| 110007 | AppID 不存在 | 核对控制台 |
| 110008 | 签名错误 | 检查参数顺序、时间戳、Base64 |
| 110009 | Token 过期 | 按 `expiration_time` 提前刷新 |
| 140004 | AppID/Secret 为空 | 检查配置 |
| 300000 | 参数非法 | 看 message 里的字段名 |

## 9. 上线前检查清单

- [ ] AppSecret 只在服务端，仓库里搜不到明文
- [ ] Token 能自动刷新，过期不会导致整条链路挂掉
- [ ] 文本按 1024 字节切段，不切断句子
- [ ] 每个声线只传它支持的情绪，不支持的自动降级
- [ ] 群聊默认 mp3，做字幕才开 timestamp
- [ ] 失败回文字，有日志但不刷屏
- [ ] 高频句有缓存，避免重复计费

## 10. 小结

海豚AI 的接入难度不在“调通”，而在“调好”：

- 鉴权用 HMAC-SHA1 换 7 天 Token，Secret 永远留在服务端；
- HTTP 适合一次性播报，WS 适合实时对话；
- 声线先按语言和场景筛，情绪只做底色；
- 接进 Bncr 要把 Token、切段、缓存、降级四件事做扎实。

按这套接完，智能管家就不只是“会回文字”，而是能用一个固定的角色声音说话：客服是客服，旁白是旁白，晚安是晚安。
