# 海豚AI 角色配方清单

“角色”= 声线 + 情绪/风格 + 语速/音调 + 文本语气。下面是可以直接抄的配方，参数都基于默认 1.0，按需微调。

## 1. 智能管家 / 语音助手

- 声线：Xiaohui 或 Mingyu
- 情绪：assistant
- 参数：rate 1.0，pitch 1.0，format mp3，sample_rate 24000
- 语气：短句、先说结论，不带表情符号
- 示例：“已为你打开客厅灯，亮度调到 60%。”

## 2. 电商客服

- 声线：Xiaohui / Ruoxuan
- 情绪：customer_service
- 参数：rate 1.0，pitch 1.0
- 语气：先致歉或确认，再给方案
- 示例：“非常抱歉让你久等，这边已经帮你加急处理。”

## 3. 售后道歉

- 声线：Huiya / Xiaohui
- 情绪：sorry
- 参数：rate 0.95，pitch 0.95
- 示例：“这次确实是我们没做好，给你添麻烦了。”

## 4. 纪录片旁白

- 声线：Mingcheng
- 情绪：narrator
- 参数：rate 0.9，pitch 0.95，silence_duration 300
- 示例：“在这片高原上，风一年只停两次。”

## 5. 有声书 / 悬疑叙事

- 声线：Mingcheng / Haoxuan
- 情绪：narrator_immersive
- 参数：rate 0.85，pitch 0.9
- 提示：段落之间留 300–500ms，别一句一换情绪。

## 6. 傲娇大小姐

- 声线：Huiya / Xiaohui
- 情绪：tsundere
- 参数：rate 1.05，pitch 1.05
- 示例：“才、才不是特意等你的呢。”

## 7. 甜系女友 / 恋爱剧情

- 声线：Mengqi / Huiya
- 情绪：lovey-dovey
- 参数：rate 1.0，pitch 1.15
- 注意：只用于合规的虚构内容，别做成骚扰话术。

## 8. 腹黑反派

- 声线：Xiaohui
- 情绪：conniving
- 参数：rate 0.95，pitch 1.0
- 示例：“你以为你赢了？好戏才刚开始。”

## 9. 深夜情感电台

- 声线：Ruoxuan / Huiya
- 情绪：radio
- 参数：rate 0.9，pitch 0.95，silence_duration 400
- 示例：“今天辛苦了，把耳机戴上，听我讲一会儿。”

## 10. 睡前故事 / 冥想

- 声线：Huiya / Sida
- 情绪：yoga 或 comfort
- 参数：rate 0.8，pitch 0.9，silence_duration 600
- 示例：“慢慢吸气……再慢慢呼出去。”

## 11. 儿童故事

- 声线：Tongtong（男童）或 Huiya
- 情绪：storytelling（Tongtong 未标注，可不传）
- 参数：rate 0.9，pitch 1.0
- 示例：“小海豚摆摆尾巴，钻进了蓝色的浪花里。”

## 12. 广告 / 带货

- 声线：Haoyu / Mengqi / Ruoxuan
- 情绪：advertising
- 参数：rate 1.15，pitch 1.05
- 示例：“今晚八点，直播间到手价只要两位数。”

## 13. 新闻 / 公告

- 声线：Siyue
- 情绪：serious 或 professional
- 参数：rate 0.95，pitch 0.95
- 示例：“下面播报一则通知，请各位业主注意。”

## 14. 古风独白

- 声线：Ziyang / Xiaoyue
- 情绪：narrator（若声线支持）
- 参数：rate 0.9，pitch 0.95，silence_duration 300
- 示例：“山雨欲来，故人已去。”

## 15. 日语 / 英语角色

- 日语：Yuko（女）、Yosuke（男）
- 英语：Julie（女）、John（男）
- 情绪：按 `emotions.md` 选，但先确认声线是否支持
- 语言参数：`ja-JP` / `en-US`，文本必须和目标语言一致

## 搭配原则

1. 先定角色，再定声线，最后定情绪；顺序反了会一直换声线。
2. 一个角色固定一套参数，做成配置，不要每次手调。
3. 情绪是“底色”，不是“演技”；文本和标点不配合，再强的情绪也假。
4. 同一角色跨段合成时，保持 voice/emotion/rate 不变，只切文本。
