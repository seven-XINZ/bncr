# Bncr 无界机器人 部署与踩坑手册

本机在飞牛 NAS 上用 Docker 跑 Bncr（无界），容器名 `bncr`，数据卷 `/vol1/1000/docker/1panel/apps/BncrData` 挂到容器 `/bncr/BncrData`，Web 端口 9099 → 容器 9090。

## 启动命令（官方 docker run，不用 compose）

```bash
docker run -d --name bncr --restart=always \
  -p 9099:9090 \
  -v /vol1/1000/docker/1panel/apps/BncrData:/bncr/BncrData \
  -e TZ=Asia/Shanghai \
  --add-host bncr.619030.xyz:172.67.170.203 \
  anmour/bncr:latest
```

`--add-host` 是必须的：授权中心 `bncr.619030.xyz` 只解析出 IPv6，容器没有 IPv6 出口，会卡在「正在初始化...」并伴随 `EAI_AGAIN`。

## 目录结构

- 数据根：`/bncr/BncrData`
- 插件：`/bncr/BncrData/plugins/<team>/<插件名>.js`，本机自建插件在 `plugins/xinz/`
- 适配器：仓库 `Adapter/` 下 15 个（wxClawBot、wxKeAImao、wechaty、wechatFerry、qq、tgBot、HumanTG、pgm、web、ssh、wxMP、wxQianxun、wxWork、wxWorkKF、wxXyo）
- 本机 mod：`plugins/xinz/mod/`，`store.js` 把数据写 `mod/data/<ns>.json`，`skills.json` 登记 Python 技能

## 插件规则与优先级

- 文件头注释里写 `@name`、`@rule`、`@priority`、`@admin`、`@public`，框架按优先级从高到低依次执行，某个插件 `reply` 后链条终止，所以不会双回复
- 智能管家优先级 `999999`，规则 `^([\s\S]+)$`，靠 `takeover` 开关接管全部插件
- 源码里**除注释外不能出现字面量 `@rule`/`@cron`**，否则框架会把它当规则编译，每条消息报 `SyntaxError: Invalid regular expression`
- 正则要写双反斜杠，例如 `new RegExp('@ru' + 'le\\s+')`；直接写 `/@rule/` 在模板字符串拼接时容易多转义

## 常见坑

1. **容器重启循环、卡在初始化**：授权中心域名只有 IPv6，容器无 IPv6。加 `--add-host` 指到 Cloudflare IPv4（172.67.170.203 / 104.21.39.136）。
2. **插件扫描为 0**：Bncr 沙箱里 `readdirSync(withFileTypes)` 的 `Dirent.isDirectory()` 不可靠，改用 `readdirSync(dir)` + `statSync` 判断；扩展名判断别多转义。
3. **docker compose 反复失败**：容器名冲突、卷 merge 会误删 `publicFileIndex.json`；用官方 `docker run` 更稳。
4. **GitHub Actions 自动提交**：仓库每次 push 会追加「插件市场 JSON 索引」提交，推前先 `git fetch && git rebase origin/main`；git 身份缺失会导致 rebase 中断，先设 `user.name` / `user.email`。
5. **微信 ClawBot 登录**：扫码后长轮询，发送要限速；TTS 默认关闭，开了会把文本转语音再发。
6. **tenapi.cn/v2 已停服**：热点插件改用微博官方 `weibo.com/ajax/statuses/hot_band`，失败再回退第三方。

## 智能管家能力（v1.6）

- 词库意图 + 同义词归一 + 错字容错（bigram/字符重合，阈值 0.66）
- 内置时间、日期、计算、抛硬币、骰子、随机选
- 多意图拆分（和/、/；，最多 3 段）
- 插件检索 `找插件`、技能 `技能` / `跑`
- 群聊回应判断：问句/动作/兴趣词/心情/好感度打分，静音、免打扰、冷却硬拦
- 记忆、词库、情绪、好感度，数据落 `mod/data/smart.json`

## 常用命令

```text
ai 你会什么        能力清单
ai 回应            回应判断日志
ai 想不想回 xxx     预演打分
ai 闭嘴 30 / 说话   本群静音与解禁
ai 阈值 45 / 冷却 60
ai 找插件 快递
ai 技能 / ai 跑 技能测试 你好
ai 刷新插件
ai 记住 xxx / ai 你记得什么
```

## 已知未完成

- 大模型 Key 未配置，人格与自主生成仍走离线；填 Ark Key 后 `think()` 才生效
- 插件工坊生成插件依赖大模型，未配 Key 时只做模板
