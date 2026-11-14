![6bb2a486b967a89bf6727173296f2ce4_720](https://github.com/user-attachments/assets/c2a16144-58d8-4caf-a33c-19a427cb029b)

# 无界 Bncr 插件与自用脚本备份

作者：Xinz & 咸鱼 ｜ QQ 群：849427892

> 本库脚本一律不含非法行为、不涉及任何 CK 仓库；插件由 Xinz 与咸鱼共同维护，仅供娱乐学习使用，使用者一切后果自负。哪位大佬看完脚本觉得是盗用，联系我删除即可，谢谢。

## 仓库结构

```
Adapter/                  # 多平台接入适配器（Bncr 框架官方/二改适配器）
plugins/xinz/             # 自用插件集合
plugins/xinz/mod/         # 插件共用工具模块（CryptoJS、提示词 prompts、UA）
publicFileIndex.json      # 插件市场索引（系统自动生成，请勿手动编辑）
quantumult_xinz.conf      # Quantumult 配置
README.md
```

## 适配器（Adapter/）

覆盖 QQ、微信（企业微信 / 客服 / 公众号 / 千询 / KeAImao / 小鱼）、Telegram（tgBot / HumanTG）、Web、SSH、WechatFerry、Wechaty、pgm 等多平台接入适配器。

| 文件 | 用途 |
| --- | --- |
| `qq.js` | QQ 接入适配器 |
| `tgBot.js` / `HumanTG.js` | Telegram 机器人 / 人行适配器 |
| `wechatFerry.js` | WechatFerry 微信适配器 |
| `wechaty.js` | Wechaty 适配器 |
| `wxWork.js` / `wxWorkKF.js` | 企业微信 / 企业微信客服 |
| `wxMP.js` / `wxQianxun.js` / `wxKeAImao.js` / `wxXyo.js` | 公众号 / 千询 / KeAImao / 小鱼微信接入 |
| `web.js` | Web 接入适配器 |
| `ssh.js` | SSH 接入适配器 |
| `pgm.js` | pgm 适配器 |

## 自用插件（plugins/xinz/）

- **AI 对话**：`ChatGPT.js`、`Bncr_ChatGPT.js`、`dify.js`、`Gemini.js`
- **查询与工具**：`天气.js`、`星座运势.js`、`每天60s.js`、`二维码生成.js`、`博客文章搜索.js`、`命令大全.js`、`菜单.js`、`懒人菜单.js`、`自定义菜单.js`、`状态查询.js`、`运行状态美化版.js`、`ping.js`、`cd.js`
- **媒体资源**：`pixiv.js`、`pixiv完整版.js`、`各种小姐姐视频.js`、`tgstickstoqq.js`
- **下载器与容器**：`qbittorent操作.js`、`QBittorrent管家/`、`容器操作.js`
- **通知与消息**：`定时消息推送.js`、`消息转发.js`、`自定义通知人.js`、`微信好友申请、拉群.js`、`自动回复.js`、`联系管理员助手.js`
- **网络与设备**：`SSH终端管家Pro.js`、`bncr_ssh2.0.js`、`爱快重拨.js`、`热点趋势.js`
- **趣味**：`IKUN.js`、`摸鱼.js`、`疯狂星期四.js`、`舔狗日记.js`、`手动黑名单.js`

`plugins/xinz/mod/` 内为插件共用模块：`CryptoJS.js`（加密）、`prompts.json`（提示词）、`USER_AGENTS.js`（UA 池）。

## 相关链接

- [鑫仔博客教程](https://www.xinz.fun/archives/1717170773466)
- [鑫仔 TG](https://t.me/xinzfun) ｜ [鑫仔博客](https://www.xinz.fun) ｜ [咸鱼博客](http://blog.咸鱼.top)
- [ChatAI 大聪明交流群](https://qm.qq.com/q/6BqfPZ7vXO) ｜ [企鹅交流群](https://qm.qq.com/q/s8AdqbBMyW)
- [Bncr 官方 GitHub](https://github.com/Anmours/Bncr) ｜ [官方开发文档](https://anmours.github.io/Bncr)
- [Bncr 官方 TG 频道](https://t.me/BncrJS) ｜ [官方 TG 群组](https://t.me/BncrJSChat)

## 关于 Bncr 框架

Bncr 是一个开箱即用的 Node.js Chat Robot（会话式机器人）框架，基于 OOP 函数响应式编程，占用小、响应快、开发易，允许开发者创建可测试、可扩展、松散耦合且易于维护的应用程序，架构受 Koishi 与 sillyGirl 启发。

- 多平台多账户接入：QQ / 微信 / Telegram 等多账号同时在线
- TypeScript OOP 函数响应式，源码体积小，响应快
- 插件开发高度封装，提供简便的系统方法
- 异步 / 同步执行自由控制（async/await / Promise）
- 不止于聊天机器人：原生支持 npm/yarn，可扩展为网站、图片服务器、资源共享平台等服务

## 免责声明

> 任何用户在使用由 xinz/xianyu（以下简称「本团队」）研发的 Node.js（js 脚本）代码（以下简称「xinz.js」）前，请您仔细阅读并透彻理解本声明。您可以选择不使用 xinz.js，若您一旦使用 xinz.js，您的使用行为即被视为对本声明全部内容的认可和接受。

1. 本代码内使用的部分包括但不限于字体、npm 库等资源来源于互联网，如果出现侵权可联系本框架移除。
2. 由于使用本仓库脚本产生的包括由于本协议或由于使用或无法使用本仓库脚本而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
3. 您承诺秉着合法、合理的原则使用 xinz.js，不利用 js 进行任何违法、侵害他人合法利益等恶意的行为，亦不将 js 运用于任何违反我国法律法规的 Web 平台。
4. 任何单位或个人因下载使用本仓库 js 而产生的任何意外、疏忽、合约毁坏、诽谤、版权或知识产权侵犯及其造成的损失（包括但不限于直接、间接、附带或衍生的损失等），本团队不承担任何法律责任。
5. 用户明确并同意本声明条款列举的全部内容，对使用本仓库 js 可能存在的风险和相关后果将完全由用户自行承担，本团队不承担任何法律责任。
6. 任何单位或个人在阅读本免责声明后，应在法律所允许的范围内进行合法的发布、传播和使用 xinz.js 等行为，若违反本免责声明条款或违反法律法规所造成的法律责任（包括但不限于民事赔偿和刑事责任），由违约者自行承担。
7. 传播：任何公司或个人在网络上发布、传播我们仓库 js 的行为都是允许的，但因公司或个人传播框架可能造成的任何法律和刑事事件框架作者不负任何责任。
8. 如果本声明的任何部分被认为无效或不可执行，则该部分将被解释为反映本团队的初衷，其余部分仍具有完全效力。不可执行的部分声明，并不构成我们放弃执行该声明的权利。
9. 本团队有权随时对本声明条款及附件内容进行单方面的变更，并以消息推送、网页公告等方式予以公布，公布后立即自动生效，无需另行单独通知；若您在本声明内容公告变更后继续使用的，表示您已充分阅读、理解并接受修改后的声明内容。
10. 本仓库部分开源代码遵循 MIT 开源许可协议。
