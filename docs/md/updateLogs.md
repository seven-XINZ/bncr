# 1.0.0
内测版本

# 1.0.1
内测版本

# 1.0.2
公测

# 1.0.3
## 优化reply/push/pushAdmin方法
* 需要传递字段放开，现已不限制字段(之前是写死的，无法拓展字段)，完全由开发者自定义 

## 优化适配器
* 所有官方适配器中原本发送媒体的分支中msg字段全部变更为path。 msg只作为纯文本消息（基于此次改动，人行tg可以发送图片/视频/文件 + 文字组合）

* 为了一致性 外置qq适配器的 ws监听地址更改为 
ws://bncrip:9090/api/qq/ws    ->   ws://bncrip:9090/api/bot/qqws

## BncrDB构造函数  新增获取全部数据库表名的方法 ，为可视化开发做准备
*  await new BncrDB('XX').getAllForm()  获取所有数据库表名 

## 修复读取插件名异常的bug
* 1.0.2版本 当插件名有多个.时(例如  官方命令1.0.0.js ) 会读取异常   现已修复

## router变更 
* 原本挂载在全局下的router路由全部在/api下，现在已移动至/  (根目录)

## 说明：
* 更新此版本必须前必须清空Adapter文件夹，会生成全新版本的适配器！（如果已经开发了三方适配器，请备份Adapter中的文件）
官方插件
官方命令.js 也有更新 如果需要 一并删除 
原（服务模块.js ）变更为 （定时任务.js）

# 1.0.4
## 优化性能 加快启动速度
 * 启动鉴权改为异步执行，网络不好重试10次
 * 启动判断模块是否存在改为在单模块中判断，进一步增加启动/重启速度

## 命令安装npm的模块内置到官方命令中，不在需要单独插件

## sysMethod新增2个方法
  * sysMethod.npmInstall npm包安装方法  
   await sysMethod.npmInstall(‘request’)  会返回执行信息String  
   await sysMethod.npmInstall(‘request’,{ outConsole: true })  将会在控制台实时打印安装情况，返回结果为null
 * sysMethod.testModule 测试模块是否安装，第一个参数必须为string[]  
    await sysMethod.testModule(['telegram', 'input']); 将只测试，返回结果  
    await sysMethod.testModule(['telegram', 'input'], { install: true }); 发现少模块自动安装

## 优化其他逻辑

* 更新此版本 需要更新配套适配器，清空Adapter文件夹更新，或者更新后自行在Github下载替换  
官方命令、命令重定向、Bncr_ChatGPT、HumanTG_Expand 均有更新，同上