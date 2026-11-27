# NAS / 家庭服务器折腾清单

自托管、家用服务器、飞牛 fnOS / 群晖 / 绿联 上值得装的东西。问「NAS 装什么」「家庭服务器项目」「有没有类似 XX」时从这里检索。

## 机器人 / AI 接入

- **AstrBot**：多平台 LLM 聊天机器人框架，支持 QQ、微信、TG、飞书等，插件化，WebUI 配置。Docker 一键起，常与 NapCat 对接。https://github.com/AstrBotDevs/AstrBot
- **NapCat（NapCatQQ）**：QQ 协议端，扫码登录、OneBot v11、WebUI 6099、WS 3001。注意官方镜像 `mlikiowa/napcat-docker` 已从 Docker Hub 下架，需换可用镜像源或 `napcat-framework-docker`。https://github.com/NapNeko/NapCatQQ
- **OpenClaw**：2026 年很火的个人 AI 网关，绿联等 NAS 应用商店已上架，可接 QQ 官方机器人、微信、TG，支持自定义模型。https://github.com/openclaw/openclaw
- **Bncr（无界）**：Node 写的多平台机器人框架，插件市场 + JS 插件，适配微信/QQ/TG/Web/SSH 等 15 个平台。本机正在用。https://github.com/seven-XINZ/bncr
- **Koishi**：跨平台机器人框架，插件生态大，适合 QQ/TG/Discord。https://github.com/koishijs/koishi
- **NoneBot2**：Python 异步机器人框架，OneBot 协议，插件丰富。https://github.com/nonebot/nonebot2

## 面板 / 运维

- **1Panel**：现代化 Linux 运维面板，应用商店一键装 Halo、MySQL、OpenResty，飞牛上常用。https://github.com/1Panel-dev/1Panel
- **Dockge**：compose 栈管理面板，比 Portainer 轻，YAML 直接编辑。https://github.com/louislam/dockge
- **Portainer**：老牌容器管理面板，多节点、权限、模板齐全。https://github.com/portainer/portainer
- **Uptime Kuma**：自托管探活监控，HTTP/TCP/Ping/DNS，告警到 TG/企微/邮件。https://github.com/louislam/uptime-kuma
- **Sun-Panel**：轻量导航首页，容器/网站卡片，适合做家庭入口。https://github.com/hslr-s/sun-panel
- **NAS 助手（fnOS 工具箱）**：飞牛本地运维工具箱，一键体检、系统清理、网络测速、Docker 管理、硬盘监控，数据不上传。GitHub 开源，社区有 fpk。
- **fndepot**：第三方飞牛应用商店，fpk 离线安装，补充官方商店没有的应用。

## 媒体影音

- **Emby / Jellyfin / Plex**：三选一即可。Jellyfin 免费开源，Emby 硬解与客户端成熟，Plex 生态最省心。https://github.com/jellyfin/jellyfin
- **MoviePilot**：自动化追剧/订阅/整理，对接 qBittorrent、Transmission、Jackett、Prowlarr，插件化。https://github.com/jxxghp/MoviePilot
- **Navidrome**：自托管音乐服务器，Subsonic 协议，手机端 Symfonium / substreamer 可播。https://github.com/navidrome/navidrome
- **Komga**：漫画/电子书库，支持 CBZ、PDF，Web 阅读。https://github.com/Komga/Komga
- **HomeTube**：把 1700+ 站点视频下载进 Plex/Jellyfin 库，去广告段、字幕、切片。https://github.com/HomeTube/HomeTube

## 下载 / 资源

- **qBittorrent**：BT/PT 首选，WebUI 好用，配合 MoviePilot 自动整理。https://github.com/qbittorrent/qBittorrent
- **Transmission**：轻量 BT 客户端，PT 站兼容好。
- **Jackett / Prowlarr**：索引器聚合，把各家 PT/BT 站转成统一 API。https://github.com/Prowlarr/Prowlarr
- **OpenList（原 AList）**：网盘聚合挂载，阿里/百度/夸克/OneDrive 统一成 WebDAV。https://github.com/OpenListTeam/OpenList
- **qBittorrent + Sonarr/Radarr**：剧集/电影自动订阅、下载、重命名、刮削一条龙。

## 照片 / 网盘 / 文档

- **Immich**：自托管相册，手机自动备份、人脸识别、地图，体验接近 Google Photos。https://github.com/immich-app/immich
- **Nextcloud**：私有云盘全家桶，文件同步、日历、联系人、在线 Office。https://github.com/nextcloud/server
- **Seafile**：同步性能强，适合大文件团队协作。https://github.com/haiwen/seafile
- **Paperless-ngx**：纸质文档扫描 OCR、自动分类、全文检索，报税神器。https://github.com/paperless-ngx/paperless-ngx
- **Syncthing**：点对点文件同步，无中心服务器。https://github.com/syncthing/syncthing

## 网络 / 远程

- **Tailscale**：零配置组网，CGNAT 下也能回家，NAS 装一个即可全屋访问。https://tailscale.com
- **frp**：自建内网穿透，需公网 VPS 做服务端。https://github.com/fatedier/frp
- **Cloudflare Tunnel**：不用公网 IP，cloudflared 一条命令暴露 Web 服务。https://github.com/cloudflare/cloudflared
- **AdGuard Home / Pi-hole**：全网 DNS 去广告，家长控制。https://github.com/AdguardTeam/AdGuardHome
- **Nginx Proxy Manager / Caddy**：反代 + 自动证书，多站点管理。https://github.com/NginxProxyManager/nginx-proxy-manager

## 自动化 / 效率

- **n8n**：可视化工作流自动化，400+ 集成，可自托管，适合把 NAS 服务串起来。https://github.com/n8n-io/n8n
- **Home Assistant**：家庭自动化中枢，灯光/传感器/空调/摄像头统一接入，配合 MQTT、Zigbee2MQTT。https://github.com/home-assistant/core
- **青龙**：定时任务/签到脚本面板，Python/JS 脚本，环境变量管理。
- **RSSHub + FreshRSS / Miniflux**：把没有 RSS 的站点生成订阅源，再统一阅读。https://github.com/DIYgod/RSSHub
- **Halo**：Java 博客系统，1Panel 一键装，主题多，本机博客就是它。https://github.com/halo-dev/halo
- **Memos**：轻量碎片笔记，类 flomo，API 友好。https://github.com/usememos/memos
- **SiYuan 思源笔记**：块级笔记、双链、本地优先。https://github.com/siyuan-note/siyuan

## 密码 / 备份 / 安全

- **Vaultwarden**：Bitwarden 兼容的轻量密码服务，Rust 写的，内存占用低。https://github.com/dani-garcia/vaultwarden
- **Duplicati / restic**：加密增量备份到网盘或另一台 NAS。https://github.com/duplicati/duplicati
- **Synology Hyper Backup / 飞牛备份**：整机与套件级备份，异机还原。
- **Gotify**：自托管推送服务，脚本告警直接推到手机。https://github.com/gotify/server

## 清单 / 社区（找项目用）

- **awesome-selfhosted**：自托管项目总目录，按分类和协议筛选，最全。https://github.com/awesome-selfhosted/awesome-selfhosted
- **awesome-homelab**：家庭实验室硬件、软件、教程合集。https://github.com/mattermost/awesome-homelab
- **selfhosted 主题页**：GitHub Topics 按 star 排序，适合扫新项目。https://github.com/topics/self-hosted
- **r/selfhosted / r/homelab**：Reddit 社区，真实踩坑讨论多。
- **飞牛论坛 / 绿联社区 / 群晖中文社区**：国内 NAS 玩法与 fpk 资源。

## 装机顺序建议

1. 先解决入口与远程：Sun-Panel 导航 + Tailscale/Cloudflare Tunnel
2. 再解决安全与备份：Vaultwarden + restic/Duplicati + Uptime Kuma
3. 影音按需：qBittorrent → MoviePilot → Emby/Jellyfin
4. 照片与文档：Immich、Paperless-ngx
5. 最后才是玩具：机器人、AI、自动化，别一上来装 30 个容器

硬件经验：N100 / N305 小主机 16G 内存能跑 20 个左右轻量容器；4K 硬解看核显，Intel 核显优先 Jellyfin/Emby 的 QSV；NAS 机械盘只放冷数据，容器和数据库放 SSD。
