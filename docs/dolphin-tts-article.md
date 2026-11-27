# 海豚AI（TTS-Online）开发文档与接入教程：Token、3751 个声线与 37 种情绪

> 本文分两部分：前半部分是**教程**，跟着命令从零跑通一条语音；后半部分是**开发文档**，查接口、字段、错误码和 Bncr 集成。海豚AI 不是“申请 API Key”那种开放平台，而是网页版配音站 + `/flashsummary` 接口。

![海豚AI 语音接入实战](https://raw.githubusercontent.com/seven-XINZ/bncr/main/docs/tts-cover.webp)

项目仓库：[github.com/seven-XINZ/bncr](https://github.com/seven-XINZ/bncr)

## 快速开始（教程）

5 分钟跑通一条语音，按顺序做：

1. 浏览器打开 `https://www.ttson.cn?token=<TOKEN>`，确认能登录、能看到额度。
2. F12 → Network，过滤 `flashsummary`，记下请求的 host，记为 `BASE`。
3. 查额度：`GET {BASE}/flashsummary/getTokenData?token=<TOKEN>`。
4. 选声线：`GET {BASE}/flashsummary/voices?language=zh-CN&tag_id=1&token=<TOKEN>`，记一个 `id`。
5. 合成：`POST {BASE}/flashsummary/tts?token=<TOKEN>`，body 见第 5 节。
6. 用返回的 `url + port + voice_path` 下载 mp3。

下面每一节都把这几步拆开讲；着急的话直接跳到第 5、6 节复制代码。

## 0. 先分清两个站

| 模式 | 入口 | 用途 |
| --- | --- | --- |
| 普通站 | `https://www.ttson.cn?token=<TOKEN>` | 通用声线、旁白、播报、中文角色 |
| 二次元站 | `https://acgn.ttson.cn?token=<会员TOKEN>` | 原神、星铁、鸣潮、日漫等 ACGN 角色 |

二次元角色要用 **acgn 会员凭证**。拿普通站 Token 去调二次元角色，常见结果是 `350`（余额/权限不足），不是代码坏了。把 `www` 换成 `acgn`、换会员 Token 再试。

海豚AI 和另一套海外 API“DolphinVoice（api.voice.dolphin-ai.jp）”不是同一个东西。DolphinVoice 是 AppID/AppSecret 换 JWT、19 个声线；海豚AI 是 Token 登录、3751 条声线、37 个情绪 id。两套参数不能混用。

## 1. Token 登录与额度

Token 直接拼在 URL 上：

```
https://www.ttson.cn?token=2103...
```

打开后网页会登录，并把 Token 存在本地。调接口时同样把 Token 作为查询参数：

```
GET {BASE}/flashsummary/getTokenData?token=<TOKEN>
```

返回：

```json
{"code":200,"data":{"limit":80000,"use_count":3,"expiry_date":"2028-08-08","vip_level":4,"concurrency":3}}
```

- `limit`：字符额度
- `use_count`：已用字符
- `expiry_date`：到期日
- `vip_level`：会员等级
- `concurrency`：并发数

Token 等于账号凭证，**不要提交到 Git、不要发到群里、不要写进前端**。泄露就去官网重新生成；给朋友体验，最好单独开子账号或短期 Token。

## 2. 接口地址是动态的

网页把接口挂在一台 GPU 实例上，当前是：

```
https://u95167-8ncb-3637bf8b.bjb1.seetacloud.com:8443
```

这个 host 会变。两种找法：

1. 打开 `https://www.ttson.cn`，F12 → Network，过滤 `flashsummary`，看请求的 host；
2. 看首页 `index.*.js` 里的 `Ja={host:"..."}`。

下面用 `BASE` 代表这个 host。**不要硬编码到代码里**，做成配置。

## 接口速查（开发文档）

| 用途 | 方法 | 路径 | 鉴权 |
| --- | --- | --- | --- |
| 查额度 | GET | `/flashsummary/getTokenData` | `?token=` |
| 声线列表 | GET | `/flashsummary/voices?language=zh-CN&tag_id=1` | `?token=` |
| 情绪列表 | GET | `/flashsummary/emotions` | `?token=` |
| 标签列表 | GET | `/flashsummary/voicetags` | `?token=` |
| 合成 | POST | `/flashsummary/tts` | `?token=` + JSON |
| 取音频 | GET | `/flashsummary/retrieveFileData?stream=True&voice_audio_path=` | `?token=` |

统一约定：

- `BASE` 从网页 Network 取，不固定；
- 所有请求都带 `token` 查询参数，没有 `Authorization` 头；
- POST 带 `Content-Type: application/json` 和 `X-checkout-Header: _checkout`；
- 业务成功看 `code === 200`，不是 HTTP 200。

## 3. 声线：3751 条，先分类再选

拉全量：

```
GET {BASE}/flashsummary/voices?language=zh-CN&tag_id=1&token=<TOKEN>
```

当前返回 **3751 条**，男性 1517、女性 2234。注意：同一个角色常有多个“情绪版本/语气版本”，3751 条不等于 3751 个角色。

主要分类：

| 标签 | 条目数 | 代表 |
| --- | --- | --- |
| 日漫1000+角色 | 1037 | 鬼灭、间谍过家家、Fate、GAL |
| 新原神星铁 | 949 | 原神、星穹铁道 |
| 蔚蓝档案 | 693 | 碧蓝档案（日语） |
| Fate系列 | 274 | Fate/Grand Order |
| 崩坏3 | 271 | 崩坏3 |
| 番剧GAL | 146 | 番剧、GALGAME |
| 鸣潮 | 123 | 鸣潮 |
| 原神 | 65 | 原神 |
| 星穹铁道 | 48 | 星铁 |
| 国漫 | 51 | 全职高手、一人之下 |
| APEX | 45 | APEX |
| 虚拟热门 | 43 | 初音、奶龙、三国 |
| 其他 | 58 | 王者、LOL、影视 |

### 热门角色 id 样例

| 角色 | voice_id | 角色 | voice_id |
| --- | --- | --- | --- |
| 胡桃（原神） | 479 | 甘雨（原神） | 486 |
| 影（原神） | 480 | 刻晴（原神） | 477 |
| 魈（原神） | 478 | 可莉（原神） | 1432 |
| 神里绫华（原神） | 1431 | 达达利亚（原神） | 1430 |
| 黑塔（星铁） | 429 | 镜流（星铁） | 424 |
| 银狼（星铁） | 423 | 符玄（星铁） | 416 |
| 长离（鸣潮） | 4328 | 维里奈（鸣潮） | 4315 |
| 鹤城（碧蓝档案） | 4260 | 阿斯托尔福（Fate） | 5155 |
| 炭治郎（鬼灭） | 1433 | 阿尼亚（间谍过家家） | 3579 |
| 初音未来 | 3553 | 旁白（通用） | 1841 |

通用旁白/播报：

- `1841` 旁白：纪录片、有声书
- `2082` 男声：低音解说
- `2044` 播报女声：新闻、客服、智能管家

找角色时直接在 `voice_name` 里搜中文名/作品名，别凭记忆填 id。

## 4. 情绪：37 个数字 id

```
GET {BASE}/flashsummary/emotions?token=<TOKEN>
```

完整表在仓库 `plugins/xinz/mod/kb/tts/emotions.md`，这里列常用的：

| id | 情绪 | 适合 |
| --- | --- | --- |
| 0 | 默认 | 通用 |
| 1 | 自然 | 日常对话 |
| 2 | 开心 | 好消息、庆祝 |
| 3 | 生气 | 冲突、警告 |
| 4 | 悲伤 | 告别、煽情 |
| 5 | 害怕 | 悬疑、惊吓 |
| 6 | 惊讶 | 反转、发现 |
| 9 | 感激 | 感谢、致谢 |
| 12 | 严肃 | 公告、安全提醒 |
| 17 | 深情 | 恋爱、独白 |
| 18 | 温柔 | 安慰、治愈 |
| 19 | 直播 | 带货、口播 |
| 20 | 小说 | 有声书 |
| 21 | 客服 | 售后、咨询 |
| 22 | 新闻播报 | 通知、播报 |
| 23 | 激动 | 广告、促销 |
| 24 | 哭腔 | 虐心、哭戏 |
| 25 | 旁白 | 纪录片 |
| 26 | 傲娇 | 二次元角色 |
| 27 | 抱歉 | 道歉 |
| 28 | 专业 | 课程、说明 |
| 30 | 紧张 | 悬疑 |
| 33 | 平静 | 冥想、助眠 |
| 50 | 稳定版 | 长文本 |

规则：一句一个情绪；角色不支持时先降级为 0/1；长文本用 50 减少情绪跳变。

## 5. 合成：一个 POST

```
POST {BASE}/flashsummary/tts?token=<TOKEN>
Content-Type: application/json
X-checkout-Header: _checkout
```

Body：

```json
{
  "voice_id": 1841,
  "to_lang": "ZH",
  "format": "mp3",
  "speed_factor": 1.0,
  "pitch_factor": 0,
  "volume_change_dB": 0,
  "emotion": 25,
  "text": "你好，这里是海豚AI语音测试。"
}
```

字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| voice_id | 是 | 声线 id |
| text | 是 | 待合成文本，长文本自己切段 |
| to_lang | 否 | `ZH` / `EN` / `auto` |
| format | 否 | `mp3` 常用 |
| speed_factor | 否 | 语速，1.0 原速 |
| pitch_factor | 否 | 音调偏移，0 原调 |
| volume_change_dB | 否 | 音量增益，0 原音量 |
| emotion | 否 | 情绪 id，0 默认 |
| client_ip | 否 | 二次元站填 `ACGN` |
| code | 否 | 网页验证码场景，普通调用不需要 |

成功返回：

```json
{"code":200,"voice_path":"./temp/tts/20261128/07bef2cf.mp3","url":"https://u95167-f6u8-340bb9f2.bjb1.seetacloud.com","port":8443}
```

它不直接返回音频字节，而是给你临时路径 + 另一台音频主机。

## 6. 取回音频

```
GET {url}:{port}/flashsummary/retrieveFileData?stream=True&token=<TOKEN>&voice_audio_path=<voice_path>
```

`Content-Type: audio/mpeg`，直接落盘。`voice_path` 有时效，生成后尽快下载。

Node 完整封装：

```js
const BASE = process.env.TTSON_BASE;   // 从网页 Network 取
const TOKEN = process.env.TTSON_TOKEN; // 只放服务端

async function synth({ text, voiceId, emotion = 0, speed = 1, pitch = 0, volume = 0, lang = 'ZH' }) {
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
const buf = await synth({ text: '欢迎使用鑫仔的智能管家。', voiceId: 2044, emotion: 1 });
fs.writeFileSync('hello.mp3', buf);
```

## 7. 接进 Bncr 的四个工程点

1. **配置**：`ttsonBase`、`ttsonToken`、默认 `voiceId`、默认 `emotion`，Token 不进仓库。
2. **切段**：按 `。！？；\n` 切 200–300 字，逐段请求；段间保持同一 voice/emotion/speed。
3. **取音频**：`voice_path` 有时效，拿到响应立刻下载，不要只存路径。
4. **额度与并发**：调 `/getTokenData` 检查余额；`concurrency` 限制内排队，超了就降级文字。

## 8. 错误码与异常（开发文档）

| 现象 | 含义 | 处理 |
| --- | --- | --- |
| `code: 200` | 成功 | 取 `voice_path/url/port` 下载音频 |
| `350` | 余额/权限不足，常见于普通 Token 调二次元角色 | 换 `acgn.ttson.cn` 会员 Token，或改用普通声线 |
| `401/403` | Token 无效、过期、无权限 | 重新生成 Token；确认没有多余空格 |
| `404` | 路径/主机不对 | 重新从 Network 取 `BASE`，注意 `/flashsummary` 前缀 |
| `500` | 服务端合成失败 | 换文本/声线重试；持续失败看官网状态 |
| 返回成功但下载 403 | 取音频没带同一个 Token | `retrieveFileData` 必须带 `token` |
| 文本超长 | 单次请求文本过长 | 按 200–300 字切段 |

## 9. 网页端常见问题

- **输入字数/统计消失**：关掉浏览器扩展（翻译、油猴、广告拦截类），再刷新。
- **无法生成/一直转圈**：换网络或换浏览器；网页端依赖长连接，代理不稳会失败。
- **二次元角色报 350**：确认用的是 `acgn.ttson.cn` 的会员 Token。
- **生成成功但没声**：先确认音频 URL 能打开；`retrieveFileData` 必须带同一个 Token。

## 10. 接口稳定性与版本（开发文档）

- **host 会变**：`BASE` 是动态 GPU 实例，换实例就换域名；必须配置化，不要写死。
- **声线会增减**：3751 是当前快照，角色上新/下线都会变；上线前拉一次 `/voices` 缓存，不要依赖固定 id。
- **Token 有到期日**：`/getTokenData` 的 `expiry_date` 要监控；到期前换 Token。
- **并发有限制**：`concurrency` 是并发上限，群聊批量合成要排队。
- **临时文件有时效**：`voice_path` 不是永久地址，生成后立刻下载。

## 11. 听书网关（社区玩法）

有把海豚AI 包成“阅读 App 书源”的网关，形如：

```
https://<host>/flashsummary/book?token=<TOKEN>&voice_id=<ID>&emotion=<ID>&speed_factor=1.0&pitch_factor=0&text=<文本>
```

它主要给阅读类 App 直接播放音频，不一定返回标准 JSON。Token 由分享者分发，额度用完会失败，适合体验，不建议当生产接口。公开 Token 要定期换，别把主账号 Token 放进去。

## 12. 仓库与知识库

- 项目仓库：[github.com/seven-XINZ/bncr](https://github.com/seven-XINZ/bncr)
- 知识库路径：`plugins/xinz/mod/kb/tts/`
  - `dolphin.md`：接口与排错
  - `voices.md`：3751 条声线、标签、热门角色 id
  - `emotions.md`：37 个情绪 id
  - `roles.md`：角色库与 15 套配方
- 博客封面与文章源文件：`docs/tts-cover.webp`、`docs/dolphin-tts-article.md`

## 13. 上线检查清单

- [ ] Token 只在服务端，仓库里搜不到
- [ ] API host 是配置项，不是硬编码
- [ ] 合成后立刻下载 `voice_path`，不依赖临时文件
- [ ] 文本按 200–300 字切段，不切断句子
- [ ] 二次元走 acgn 会员 Token，普通 Token 不硬调
- [ ] 有额度检查和并发排队
- [ ] 失败回文字，不把错误堆栈发群里

## 14. 小结

海豚AI 的难点不在“调通”，而在“调对”：

- Token 是登录凭证，不是 API Key，别泄露；
- 接口 host 会变，必须从网页 Network 取；
- 3751 条声线里大量是同角色多版本，先拿 id 再试听；
- 37 个情绪 id 是底色，文本、标点、语速要配合；
- 二次元角色是另一套站点和会员凭证，`350` 先查权限。

按这套接完，智能管家就能用固定角色声音说话：客服是客服，旁白是旁白，原神角色也不会串味。
