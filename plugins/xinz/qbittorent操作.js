/**作者
 * @author seven
 * @name qbittorent操作
 * @team xinz
 * @version 1.0
 * @description qbittorent操作
 * @rule ^(qb操作)$
 * @priority 10000
 * @admin true
 * @disable false
 */
sysMethod.testModule(['@ctrl/qbittorrent'], { install: true });

module.exports = async s => {
    const { QBittorrent } = await import('@ctrl/qbittorrent');
    const qb = new QBittorrent({
        baseUrl: /`,
        username: "",
        password: "",
    });

    let isValid = false;

    do {
        const data = await qb.getAllData();
        const listTorrents = data.torrents;

        await s.reply("当前任务列表(发送'q'退出'0'添加磁力)");
        for (let i = 0; i < listTorrents.length; i++) {
            const bt_data = listTorrents[i];
            await s.reply(formatTorrentInfo(bt_data, i + 1));
        }

        let command_id = await s.waitInput(async (s) => { }, 60);
        if (command_id === null) return s.reply('超时退出');
        command_id = command_id.getMsg();

        if (command_id === 'q') return s.reply('已退出');
        if (command_id === '0') {
            await handleAddMagnet(s, qb);
            continue;
        }

        const content = await getContentByNumber(command_id, listTorrents);
        if (content !== "序列号超出范围") {
            await handleTorrentOperations(s, qb, content);
        } else {
            await s.reply("错误：序列号超出范围，请重新输入。");
        }
    } while (!isValid);

    async function handleAddMagnet(s, qb) {
        await s.reply("请发送磁力连接(发送'q'退出'u'返回)");
        const b = await s.waitInput(async (s) => { }, 30);
        if (b === null) return s.reply('超时退出');
        const userInput = b.getMsg();
        if (userInput === 'q') return s.reply('已退出');
        if (userInput === 'u') return;

        try {
            const result = await qb.addMagnet(userInput);
            await s.reply(result ? "添加成功" : "添加出错");
        } catch (err) {
            await s.reply("获取数据失败\n" + err);
        }
    }

    async function handleTorrentOperations(s, qb, content) {
        const torrent_hash = content.raw.hash;
        const torrent_id = content.id;
        const torrent_name = content.name;

        do {
            await s.reply(
                `操作列表(发送'q'退出'u'返回)\n当前文件: ${torrent_name}\n当前hash: ${torrent_hash}\n` +
                "1.暂停\n2.恢复\n3.删除(不会删除磁盘上的数据)\n4.删除(删除磁盘上的数据)"
            );

            let command_eid = await s.waitInput(async (s) => { }, 30);
            if (command_eid === null) return s.reply('超时退出');
            const userMsg = command_eid.getMsg();
            if (userMsg === 'q') return s.reply('已退出');

            switch (userMsg) {
                case "1":
                    await executeTorrentAction(qb.pauseTorrent, torrent_hash, "暂停");
                    break;
                case "2":
                    await executeTorrentAction(qb.resumeTorrent, torrent_hash, "恢复");
                    break;
                case "3":
                    await executeTorrentAction(qb.removeTorrent.bind(qb, torrent_id, false), "删除(不会删除磁盘上的数据)");
                    break;
                case "4":
                    await executeTorrentAction(qb.removeTorrent.bind(qb, torrent_id, true), "删除(删除磁盘上的数据)");
                    break;
                case "u":
                    return;
                default:
                    await s.reply("错误：序列号超出范围，请重新输入。");
            }
        } while (true);
    }

    async function executeTorrentAction(action, hash, actionName) {
        const result = await action(hash);
        await s.reply(result ? `${actionName}成功` : `${actionName}失败`);
    }

    function truncateText(text, maxLength) {
        return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
    }

    async function getContentByNumber(number, listTorrents) {
        return (number >= 1 && number <= listTorrents.length) ? listTorrents[number - 1] : "序列号超出范围";
    }

    function bytesToSize(bytes) {
        const sizes = ['B', "KB", 'MB', 'GB', 'TB', 'PB'];
        let i = 0;
        while (bytes >= 1024 && i < sizes.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(2)} ${sizes[i]}`;
    }

    function formatISODate(isoDate) {
        const date = new Date(isoDate);
        return date.toISOString().replace('T', ' ').substring(0, 19);
    }

    function formatTime(seconds) {
        const units = [
            { label: '年', value: 365 * 24 * 60 * 60 },
            { label: '天', value: 24 * 60 * 60 },
            { label: '小时', value: 60 * 60 },
            { label: '分钟', value: 60 },
            { label: '秒', value: 1 }
        ];
        let result = [];
        for (const { label, value } of units) {
            if (seconds >= value) {
                const count = Math.floor(seconds / value);
                result.push(`${count} ${label}`);
                seconds %= value;
            }
        }
        return result.length === 0 ? '0 秒' : result.join(' ');
    }

    function formatTorrentInfo(bt_data, index) {
        return [
            `任务id: ${index}`,
            `任务名: ${truncateText(bt_data.name, 20)}`,
            `已完成: ${bt_data.isCompleted ? '是' : '否'}`,
            `任务状态: ${getQbittorrentStatusInChinese(bt_data.state, bt_data.stateMessage)}`,
            `添加日期: ${formatISODate(bt_data.dateAdded)}`,
            `剩余时间: ${formatTime(bt_data.eta)}`,
            `资源大小: ${bytesToSize(bt_data.raw.size)}`,
            `上行速率: ${bytesToSize(bt_data.uploadSpeed)}`,
            `下行速率: ${bytesToSize(bt_data.downloadSpeed)}`,
            `下载进度: ${(bt_data.progress * 100).toFixed(2)}%`,
            `种子数量: ${bt_data.connectedSeeds} (${bt_data.totalSeeds})`,
            `用户数量: ${bt_data.connectedPeers} (${bt_data.totalPeers})`,
            `分享比率: ${(bt_data.ratio).toFixed(2)}`
        ].join('\n');
    }

    function getQbittorrentStatusInChinese(state, bug) {
        const statusMap = {
            "downloading": "正在下载",
            "completed": "已完成",
            "paused": "暂停",
            "uploading": "正在上传",
            "stopped": "已停止",
            "queued": "排队",
            "error": "错误",
            "checking": "检查中",
            "stalled": "待处理",
            "seeding": "做种",
            "locked": "锁定",
            "hashing": "哈希中",
            "moving": "移动中",
            "forced": "强制下载",
            "waiting": "等待中",
        };
        return statusMap[state] || `未知状态：${state} (${bug})`;
    }
}
