# 海豚AI 声线清单（19 个）

`voice` 字段直接填英文 token。同一句话换声线，气质差别很大；先按语言筛，再按场景选，最后用情绪 token 微调。

## 中文（14 个）

| voice | 性别/年龄 | 音色定位 | 官方标注可用的情绪/风格 | 适合场景 |
| --- | --- | --- | --- | --- |
| Xiaohui | 女 | 全能女声，情绪跨度最大 | pleased、sorry、annoyed、happy、sad、angry、scare、hate、surprise、tear、customer_service、professional、serious、comfort、lovey-dovey、conniving、tsundere、storytelling、radio、charming、yoga | 客服、助手、情感电台、角色扮演、广告 |
| Ruoxuan | 女 | 年轻女声，偏自然口语 | happy、sad、angry、scare、hate、surprise、customer_service、comfort、storytelling、advertising、assistant | 短视频口播、客服、种草 |
| Siyue | 男 | 标准男声，新闻感 | 未标注 | 新闻、通知、说明 |
| Mingcheng | 男 | 有声书男声，沉稳 | happy、sad、angry、scare、hate、surprise、tear、novel_dialog、narrator、narrator_immersive | 有声书、纪录片旁白 |
| Haoxuan | 男 | 磁性男声 | happy、sad、angry、scare、hate、surprise、novel_dialog、narrator | 旁白、故事 |
| Sida | 男 | 温和男声 | happy、sad、angry、scare、hate、surprise、novel_dialog、narrator | 知识讲解、冥想引导 |
| Ziyi | 男 | 温和男声，偏年轻 | happy、sad、angry、scare、hate、surprise、novel_dialog、narrator | 课程、产品介绍 |
| Ziyang | 男 | 古风男声 | happy、sad、angry、scare、hate、surprise、novel_dialog、narrator | 古风文案、国风短片 |
| Xiaoyue | 男 | 古风男声，清冷 | 未标注 | 诗词、古风独白 |
| Haoyu | 男 | 活力男声 | 未标注 | 广告、活动播报 |
| Mengqi | 女 | 活力女声 | 未标注 | 带货、综艺、社媒 |
| Tongtong | 男童 | 儿童声线 | 未标注 | 儿童故事、教育 |
| Huiya | 女 | 温柔女声 | 未标注 | 睡前故事、安慰 |
| Mingyu | 男 | 温和男声 | 未标注 | 助手、长文本朗读 |

## 日语（3 个）

| voice | 性别 | 音色定位 | 适合场景 |
| --- | --- | --- | --- |
| Yuko | 女 | 自然女声 | 日语客服、日常对话 |
| Norika | 女 | 偏温柔女声 | 日语旁白、治愈内容 |
| Yosuke | 男 | 标准男声 | 日语解说、通知 |

## 英语（2 个）

| voice | 性别 | 音色定位 | 适合场景 |
| --- | --- | --- | --- |
| Julie | 女 | 清晰女声 | 英语客服、课程 |
| John | 男 | 沉稳男声 | 英语旁白、产品介绍 |

## 选声速查

- 要“什么都能演”：先试 `Xiaohui`，它支持的情绪最全。
- 要“像真人客服”：`Xiaohui + customer_service` 或 `Ruoxuan + customer_service`。
- 要“纪录片”：`Mingcheng + narrator`，语速 0.9。
- 要“有声书”：`Haoxuan` 或 `Mingcheng + narrator_immersive`。
- 要“甜”：`Mengqi`（无情绪标注）或 `Xiaohui + lovey-dovey`。
- 要“古风”：`Ziyang` / `Xiaoyue`，情绪不要硬套现代风格。
- 要“儿童”：`Tongtong`，语速降到 0.9。
- 日语/英语内容必须换对应语言声线，不要用中文声线读外语。

> 说明：官方只对部分声线标注了可用情绪；表里写“未标注”的，传 `emotion` 可能被忽略或报参数错误，接入时先做一次探测再上线。
