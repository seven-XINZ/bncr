# 海豚AI 情绪与风格清单（26 个）

`emotion` 字段的合法值一共 26 个：11 个基础情绪 + 15 个表达风格。它们不是“越强越好”，而是给整句定一个底色；语速、音调和文本内容要跟着配合。

## 基础情绪（11）

| token | 中文 | 听感 | 适合文本 | 建议参数 |
| --- | --- | --- | --- | --- |
| pleased | 愉悦 | 轻快、带笑意 | 问候、福利通知 | rate 1.05，pitch 1.05 |
| happy | 开心 | 明亮、上扬 | 庆祝、好消息 | rate 1.1，pitch 1.1 |
| sorry | 抱歉 | 低沉、歉意 | 道歉、失败提示 | rate 0.95，pitch 0.95 |
| sad | 悲伤 | 压抑、缓慢 | 告别、煽情 | rate 0.9，pitch 0.9 |
| angry | 生气 | 强硬、重音 | 冲突剧情、警告 | rate 1.0，pitch 0.95 |
| annoyed | 烦躁 | 不耐烦 | 吐槽、催促 | rate 1.05，pitch 0.95 |
| scare | 惊恐 | 紧张、发抖 | 悬疑、惊吓 | rate 1.1，pitch 1.1 |
| hate | 厌恶 | 冷淡、嫌弃 | 反派出场、差评 | rate 0.95，pitch 0.9 |
| surprise | 惊讶 | 拔高、短促 | 反转、发现 | rate 1.05，pitch 1.15 |
| tear | 哭泣 | 哽咽、破碎 | 虐心剧情 | rate 0.85，pitch 0.95 |
| novel_dialog | 平静对白 | 中性、叙事 | 小说对白、多人对话 | rate 0.95，pitch 1.0 |

## 表达风格（15）

| token | 中文 | 听感 | 适合场景 | 建议参数 |
| --- | --- | --- | --- | --- |
| customer_service | 客服 | 标准、耐心、清楚 | 售后、咨询、IVR | rate 1.0，pitch 1.0 |
| professional | 专业 | 克制、可信 | 课程、发布会、说明 | rate 0.95，pitch 0.95 |
| serious | 严肃 | 低沉、无起伏 | 公告、安全提醒 | rate 0.9，pitch 0.9 |
| narrator | 旁白 | 平稳、纪录片感 | 纪录片、科普 | rate 0.9，pitch 0.95 |
| narrator_immersive | 沉浸旁白 | 更有画面感 | 有声书、悬疑 | rate 0.85，pitch 0.9 |
| comfort | 安慰 | 轻、慢、贴近 | 情绪安抚、睡前 | rate 0.85，pitch 0.95 |
| lovey-dovey | 甜腻恋爱 | 撒娇、黏 | 恋爱剧情、女友音 | rate 1.0，pitch 1.15 |
| conniving | 心机/腹黑 | 带笑里藏刀 | 反派、宫斗 | rate 0.95，pitch 1.0 |
| tsundere | 傲娇 | 口是心非 | 二次元角色 | rate 1.05，pitch 1.05 |
| charming | 魅惑 | 低、慢、气声 | 广告、夜间电台 | rate 0.9，pitch 0.9 |
| storytelling | 讲故事 | 有节奏、留白 | 儿童故事、口播 | rate 0.95，pitch 1.0 |
| radio | 情感电台 | 温暖、倾诉 | 深夜电台、树洞 | rate 0.9，pitch 0.95 |
| yoga | 瑜伽/冥想 | 极慢、气息长 | 冥想、助眠 | rate 0.8，pitch 0.9 |
| advertising | 广告 | 有劲、促单 | 带货、促销 | rate 1.15，pitch 1.05 |
| assistant | 助手 | 中性、利落 | 智能管家、语音助手 | rate 1.0，pitch 1.0 |

## 使用规则

1. 一句话只给一个 `emotion`，不要叠加；要变化就切段，每段单独请求。
2. 先定场景再选情绪：客服用 `customer_service`，不要用 `happy` 硬顶。
3. `emotion` 必须和 `voice` 的支持列表匹配；不匹配时先降级为不传。
4. 情绪和标点要一致：文本全是句号却传 `happy`，听起来会假。
5. 长文本按 200–300 字切段，段间保持同一情绪，避免情绪跳变。

## 常见搭配

- 智能管家播报：`assistant` + rate 1.0
- 售后道歉：`sorry` + rate 0.95
- 晚安电台：`radio` 或 `comfort` + rate 0.85
- 产品广告：`advertising` + rate 1.1
- 悬疑有声书：`narrator_immersive` + rate 0.85
- 傲娇角色：`tsundere` + rate 1.05，pitch 1.05
