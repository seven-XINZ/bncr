# 海豚AI 怎么接（TTS-Online / ttson.cn）对接教程

海豚AI 是网页版配音平台，有两个声线池：普通站 537 条通用声线、二次元站 3751 条角色声线（ID 不重叠），共 37 种情绪。二次元池覆盖原神、星穹铁道、鸣潮、蔚蓝档案、Fate、日漫等角色。它不是“注册后给你一个 API Key”那种开放平台，而是 **Token 登录 + 网页同款 `/flashsummary` 接口**，所以文档重点是 Token、接口地址、请求体和音频取回。

## 0. 站点与两个模式

| 模式 | 入口 | 用途 |
| --- | --- | --- |
| 普通站 | `https://www.ttson.cn?token=<TOKEN>` | 通用声线、旁白、播报、中文角色 |
| 二次元站 | `https://acgn.ttson.cn?token=<会员TOKEN>` | 原神/星铁/鸣潮/日漫等 ACGN 角色 |

注意：**二次元角色要用 acgn 会员凭证**。拿普通站 Token 去调二次元角色，常见结果是 `350`（余额/权限不足），不是接口坏了。把 `www` 换成 `acgn`、换会员 Token 再试。

## 1. Token 怎么用

海豚AI 的 Token 直接拼在 URL 上：

```
https://www.ttson.cn?token=2103...
```

打开后网页会登录并把 Token 存到本地。调接口时同样把 Token 作为查询参数：

```
GET /flashsummary/getTokenData?token=<TOKEN>
```

可以先用它查额度：

```json
{"code":200,"data":{"limit":80000,"use_count":3,"expiry_date":"2028-08-08","vip_level":4,"concurrency":3}}
```

- `limit`：字符额度
- `use_count`：已用字符
- `expiry_date`：到期日
- `vip_level`：会员等级
- `concurrency`：并发数

Token 等于账号凭证，**不要提交到 Git、不要发到群里、不要写进前端**。泄露就去官网重新生成。

## 2. 接口地址

网页把接口挂在一台动态 GPU 实例上，当前是：

```
https://u95167-8ncb-3637bf8b.bjb1.seetacloud.com:8443
```

这个 host 会变。不要硬编码，两种找法：

1. 打开 `https://www.ttson.cn`，F12 → Network，过滤 `flashsummary`，看请求的 host；
2. 看首页 `index.*.js` 里的 `Ja={host:"..."}`。

下面用 `BASE` 代表这个 host。

## 3. 拉声线与情绪

### 声线列表

```
GET {BASE}/flashsummary/voices?language=zh-CN&tag_id=1&token=<TOKEN>
```

返回 3751 条，字段：

```json
{
  "id": 1433,
  "voice_name": "炭治郎 鬼灭之刃 花江夏树 | 竈門炭治郎 鬼滅の刃 花江夏樹",
  "gender": "male",
  "language": "zh-CN",
  "description": "",
  "tags": [{"tag_name":"日漫1000+角色","custom_order":10000}],
  "voice_audio_path_v2": [{"emotion":0,"demoPath":"69ceea32.mp3"}]
}
```

- `id` 就是 TTS 请求里的 `voice_id`
- `voice_name` 里常带“角色 | 作品 | 声优”，同名角色可能有多个情绪版本
- `tags` 用来分类，完整标签见 `voices.md`

### 情绪列表

```
GET {BASE}/flashsummary/emotions?token=<TOKEN>
```

返回 37 个 `{id, name_cn, name_en}`，完整表见 `emotions.md`。TTS 请求里的 `emotion` 填数字 id。

### 标签列表

```
GET {BASE}/flashsummary/voicetags?token=<TOKEN>
```

返回普通标签和 `acgn_tags`，用于筛选角色。

## 4. 合成：POST /flashsummary/tts

请求：

```
POST {BASE}/flashsummary/tts?token=<TOKEN>
Content-Type: application/json
X-checkout-Header: _checkout
```

Body：

```json
{
  "voice_id": 1433,
  "to_lang": "ZH",
  "format": "mp3",
  "speed_factor": 1.0,
  "pitch_factor": 0,
  "volume_change_dB": 0,
  "emotion": 2,
  "text": "你好，我是海豚AI语音测试。"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| voice_id | 是 | 声线 id，来自 `/voices` |
| text | 是 | 待合成文本，长文本要自己切段 |
| to_lang | 否 | `ZH` / `EN` / `auto`；跨语种角色按角色语种填 |
| format | 否 | `mp3` 常用；也支持 wav 等 |
| speed_factor | 否 | 语速，1.0 为原速 |
| pitch_factor | 否 | 音调偏移，0 为原调 |
| volume_change_dB | 否 | 音量增益，0 为原音量 |
| emotion | 否 | 情绪 id，0 为默认 |
| client_ip | 否 | 二次元站调用时填 `ACGN`，普通站不填 |
| code | 否 | 网页验证码场景使用，普通 API 调用不需要 |

成功返回：

```json
{"code":200,"voice_path":"./temp/tts/20261128/07bef2cf.mp3","url":"https://u95167-f6u8-340bb9f2.bjb1.seetacloud.com","port":8443}
```

它不直接返回音频字节，而是给你一个临时文件路径和另一台音频主机。

## 5. 取回音频

```
GET {url}:{port}/flashsummary/retrieveFileData?stream=True&token=<TOKEN>&voice_audio_path=<voice_path>
```

例如：

```
https://u95167-f6u8-340bb9f2.bjb1.seetacloud.com:8443/flashsummary/retrieveFileData?stream=True&token=<TOKEN>&voice_audio_path=./temp/tts/20261128/07bef2cf.mp3
```

`Content-Type` 是 `audio/mpeg`，直接落盘即可。`voice_path` 有时效，生成后尽快下载。

## 6. Node 完整调用

```js
const BASE = process.env.TTSON_BASE; // 从网页 Network 取，别硬编码
const TOKEN = process.env.TTSON_TOKEN;

async function tts({ text, voiceId, emotion = 0, speed = 1, pitch = 0, volume = 0, lang = 'ZH' }) {
  const res = await fetch(`${BASE}/flashsummary/tts?token=${TOKEN}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-checkout-Header': '_checkout',
    },
    body: JSON.stringify({
      voice_id: voiceId,
      to_lang: lang,
      format: 'mp3',
      speed_factor: speed,
      pitch_factor: pitch,
      volume_change_dB: volume,
      emotion,
      text,
    }),
  });
  const json = await res.json();
  if (json.code !== 200) throw new Error(`TTS 失败：${json.code} ${json.msg || ''}`);

  const audioUrl = `${json.url}:${json.port}/flashsummary/retrieveFileData?stream=True&token=${TOKEN}&voice_audio_path=${encodeURIComponent(json.voice_path)}`;
  const audio = await fetch(audioUrl);
  if (!audio.ok) throw new Error(`取音频失败：${audio.status}`);
  return Buffer.from(await audio.arrayBuffer());
}
```

调用：

```js
const buf = await tts({ text: '欢迎使用鑫仔的智能管家。', voiceId: 1841, emotion: 1 });
fs.writeFileSync('hello.mp3', buf);
```

## 7. 接进 Bncr 的要点

1. **配置**：只存 `ttsonBase`、`ttsonToken`、默认 `voiceId`、默认 `emotion`，Token 不进仓库。
2. **切段**：按 `。！？；\n` 切成 200–300 字，逐段请求；段间保持同一 `voice_id/emotion/speed`。
3. **取音频**：`voice_path` 有时效，拿到响应立刻下载，不要只存路径。
4. **额度**：调 `/getTokenData` 做余额检查；`use_count` 接近 `limit` 就降级为文字或换 Token。
5. **二次元**：ACGN 角色必须用 acgn 会员 Token；普通 Token 报 `350` 不是代码 bug。
6. **并发**：Token 有 `concurrency` 限制，群聊里同时多条合成要排队。

## 8. 网页端常见问题

- **输入字数/字数统计消失**：关掉浏览器扩展（尤其是翻译、油猴、广告拦截类），再刷新。
- **无法生成/一直转圈**：换网络或换浏览器；网页端依赖 WebSocket/长连接，代理不稳会失败。
- **二次元角色报 350**：确认用的是 `acgn.ttson.cn` 的会员 Token，而不是普通站 Token。
- **生成成功但没声**：先确认音频 URL 能打开；`retrieveFileData` 必须带同一个 Token。

## 9. 和 DolphinVoice 的区别

DolphinVoice（`api.voice.dolphin-ai.jp`）是另一套海外 API：AppID/AppSecret 换 JWT，19 个声线、26 个情绪 token。海豚AI（ttson.cn）是网页平台 + `/flashsummary` 接口，3751 个角色、37 个情绪 id。两套的 `voice`、`emotion` 不能混用，本文只讲后者。

## 10. 听书网关（社区玩法）

网上有把海豚AI 包成“阅读 App 书源”的网关，形如：

```
https://<host>/flashsummary/book?token=<TOKEN>&voice_id=<ID>&emotion=<ID>&speed_factor=1.0&pitch_factor=0&text=<文本>
```

它返回的不一定是标准 JSON，更多是给阅读类 App 直接播放的音频流。Token 由分享者分发，额度用完会失败，建议只做体验、不要当生产接口。公开分享的 Token 要定期换，别把主账号 Token 放进去。
