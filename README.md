<h1 align="center">无界 | Bncr | Xinz / XianYu </h1>
<div align="center">
 _
</div>

> **无界机器人插件以及其他的一些自己写的或者从开源项目二改的脚本 也是自己的备份 请勿乱用谢谢 尽量做到开源 可以自己修改 尽量做到web配置 **
 #xinz/ChatGPT.js   完美版
 ChatGpt聊天，适配无界3.0，增加  ai   画图  TTS 功能  请先到WEB界面完成插件首次配置 无界web插件配置  配置ChatGpt
# ChatGpt聊天UIL
 [大聪明gpt对接教程](https://www.master-jsx.top/docs/ChatNio/introduce) 
 [大聪明各种模型中转站](https://chatai.master-jsx.top/) 
 [TTS适配海豚Ai TTS-Online](https://www.ttson.cn/?source=qDBPb2) 
 [Github](https://github.com/seven-XINZ/bncr)
 [鑫仔博客教程](https://www.xinz.fun/archives/1717170773466) 
 
# xinz/Bncr_ChatGPT.js   
 1. 添加对话模型引入 ✔
 2. 添加对话模型选择 gpt3.5 gpt4 gpts(联网能力) ✔
 3. initPrompt,发起会话调用数据库内prompt，数据库内无数据则生成，prompt为默认，修改handleUserActions，添加当前使用模型xx
 4. gpt 4 mobile 的连续对话中对于img的传递 ✔
 5. handleInput对于用户输入的img的处理,如何修改ntqq适配器使其接收图片的输出为[CQ:image,file=xxx] ✔
 6. 取消模型的选择，加入命令ai model ,并在第一条输出中提示当前使用模型
 12.17 添加画图功能 ✔
 12.19 添加backendUrl，用于调用pandoraToV1Api ✔
 12.21 优化请求格式，实现连续对话中对于img的传递
 2024.2.8 取消画图 backendurl  * @rule ^(画图) ([\s\S]+)$ ✔
 2024.4.10 添加tts功能* @rule ^(yy) ([\s\S]+)$ ✔,重写调用chatgpt模块，got发送请求

#xinz/Gemini.js
 gemini聊天 来自谷歌的ai
 v1.0.1 优化代码，增加单问答模式，修改触发命令，界面增加Max Tokens选项
 v1.0.0 基于sumuen大佬的插件修改，本人仅修复bug和适配2.0界面
 v1.0.2 适配3.0

# xinz/IKUN.js 
 发送IKUN语录和表情包

#xinz/ping.js
 ping/web测速插件
 ping www.xinz.fun
 dns: 154.37.152.17
 地区: Los Angeles, California, US
 ip: 154.37.152.17
 延迟: 190.059 ms
 访问 https://www.xinz.fun 成功，用时: 2275 ms
 发包: 4
 接收: 4
 丢包率: 0%
 成功率: 0.00%

#xinz/qbittorent操作.js
 请发送磁力连接(发送'q'退出'u'返回

无界项目官网：https://anmours.github.io/Bncr/#/
无界tg群：https://t.me/BncrJSChat
无界插件商城订阅:https://github.com/seven-XINZ/bncr  XINZ
_
> **Bncr 是一个开箱即用的Nodejs Chat RoBot（会话式机器人）框架。它基于OOP函数响应式编程，具有占用小、响应快、开发易等特点，允许开发者创建高度可测试、可扩展、松散耦合且易于维护的应用程序。本项目架构深受Koishi与sillyGirl的启发；**
# 特性
* 多平台多账户接入系统 ： 2个qq/3个wx/4个tg? so easy!；
* 基于TypeScritp OOP函数响应式编程 ：源码仅1.5M，占用小，响应快，开发易 ；
* 极简的插件开发 ： 系统高度封装，提供简便人性化的系统方法，随心所欲开发插件；
* 异步同步执行自由控制 ： 基于nodejs async/await/Promise特性，你可以自由控制异步同步（阻塞非阻塞运行）；
* 不仅仅是Chat RoBot ： 原生支持npm/yarn，开发潜力无穷大，如果你愿意，可以在本框架上搭建网站、图片服务器、资源共享平台、并发请求等服务，在JavaScript上能做到的事情在这里都将被实现.

# 安装
参见 [安装文档](/docs/md/init.md)

# 开发

[开发文档](https://anmours.github.io/Bncr)
> 如果是手机端浏览开发文档，请点击开发文档左下角的按钮手动打开侧边栏目录

# 其他


 鑫仔
 [Github](https://github.com/seven-XINZ/bncr)
 [鑫仔博客教程](https://www.xinz.fun/archives/1717170773466) 
 官方
 [Github](https://github.com/Anmours/Bncr)   
 [TG频道](https://t.me/BncrJS)  
 [TG群组](https://t.me/BncrJSChat)  


## 请喝茶 ?
 [联系到我]([https://www.xinz.fun])  
您的支持是我更新的动力,Thank~

## 免责声明

> 任何用户在使用由 xinz/xianyu（以下简称「本团队」）研发的 Nodejs （js脚本）代码（以下简称「xinz.js」）前，请您仔细阅读并透彻理解本声明。您可以选择不使用xinz.js，若您一旦使用xinz.js，您的使用行为即被视为对本声明全部内容的认可和接受。  
1. 本框架内使用的部分包括但不限于字体、npm库等资源来源于互联网，如果出现侵权可联系本框架移除。  
2. 由于使用本仓库脚本产生的包括由于本协议或由于使用或无法使用本仓库脚本而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。   
3. 您承诺秉着合法、合理的原则使用xinz.js，不利用js进行任何违法、侵害他人合法利益等恶意的行为，亦不将js运用于任何违反我国法律法规的 Web 平台。  
4. 任何单位或个人因下载使用本仓库js而产生的任何意外、疏忽、合约毁坏、诽谤、版权或知识产权侵犯及其造成的损失 (包括但不限于直接、间接、附带或衍生的损失等)，本团队不承担任何法律责任。  
5. 用户明确并同意本声明条款列举的全部内容，对使用本仓库js可能存在的风险和相关后果将完全由用户自行承担，本团队不承担任何法律责任。  
6. 任何单位或个人在阅读本免责声明后，应在法律所允许的范围内进行合法的发布、传播和使用xinz.js等行为，若违反本免责声明条款或违反法律法规所造成的法律责任(包括但不限于民事赔偿和刑事责任），由违约者自行承担。
7. 传播:任何公司或个人在网络上发布,传播我们仓库js的行为都是允许的,但因公司或个人传播框架可能造成的任何法律和刑事事件框架作者不负任何责任。
8. 如果本声明的任何部分被认为无效或不可执行，则该部分将被解释为反映本团队的初衷，其余部分仍具有完全效力。不可执行的部分声明，并不构成我们放弃执行该声明的权利。
9. 本团队有权随时对本声明条款及附件内容进行单方面的变更，并以消息推送、网页公告等方式予以公布，公布后立即自动生效，无需另行单独通知；若您在本声明内容公告变更后继续使用的，表示您已充分阅读、理解并接受修改后的声明内容。
10. 本仓库部分开已开源代码遵循 MIT 开源许可协议。

