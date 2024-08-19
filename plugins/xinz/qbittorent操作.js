/**
 * 作者
 * @author seven & xianyu
 * @name qbittorent操作
 * @team xinz
 * @version 2.0
 * @description qbittorent操作 还在完善中
 * @rule ^(qb操作)$
 * @priority 10000
 * @admin true
 * @disable false
 */
sysMethod.testModule(['@ctrl/qbittorrent'], { install: true });

module.exports = async s => {
    const { QBittorrent } = await import('@ctrl/qbittorrent');
    const qb = new QBittorrent({
        baseUrl: `http://ip:端口/`,
        username: "ssh",
        password: "ssh密码",
    });

    let isValid = false;

    do {
        const data = await qb.getAllData();
        const listTorrents = data.torrents;

        // 更新当前任务列表提示，增加了对种子的操作
        await s.reply("当前任务列表(发送'q'退出'0'添加磁力'1'做种列表'2'所有种子'3'对种子进行操作)");

        let command_id = await s.waitInput(async (s) => { }, 60);
        if (command_id === null) return s.reply('超时退出');
        command_id = command_id.getMsg().trim();

        if (command_id === 'q') return s.reply('已退出');
        if (command_id === '0') {
            await handleAddMagnet(s, qb);
            continue;
        }
        if (command_id === '1') {
            await handleSeedingList(s, qb);
            continue;
        }
        if (command_id === '2') {
            await handleAllTorrents(s, qb);
            continue;
        }
        if (command_id === '3') {
            await handleTorrentOperationsMenu(s, qb, listTorrents);
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
        const userInput = b.getMsg().trim();
        if (userInput === 'q') return s.reply('已退出');
        if (userInput === 'u') return;

        try {
            const result = await qb.addMagnet(userInput);
            if (result) {
                const addedTorrent = await qb.getTorrent(result); // 获取刚添加的种子信息
                await s.reply(`添加成功: ${formatTorrentInfo(addedTorrent)}`);
            } else {
                await s.reply("添加出错");
            }
        } catch (err) {
            await s.reply("获取数据失败: " + err.message);
        }
    }

    async function handleSeedingList(s, qb) {
        const data = await qb.getAllData();
        const seedingTorrents = data.torrents.filter(torrent => torrent.state === 'uploading');
        if (seedingTorrents.length === 0) {
            return s.reply("当前没有做种的种子。");
        }

        let responseMessage = "当前做种列表:\n";
        for (let i = 0; i < seedingTorrents.length; i++) {
            responseMessage += formatTorrentInfo(seedingTorrents[i], i + 1) + "\n";
        }
        await s.reply(responseMessage);
    }

    async function handleAllTorrents(s, qb) {
        const data = await qb.getAllData();
        const allTorrents = data.torrents;

        if (allTorrents.length === 0) {
            return s.reply("当前没有种子。");
        }

        let responseMessage = `当前所有种子数量: ${allTorrents.length}\n`;
        for (let i = 0; i < allTorrents.length; i++) {
            responseMessage += formatTorrentInfo(allTorrents[i], i + 1) + "\n";
        }
        await s.reply(responseMessage);
    }

    async function handleTorrentOperationsMenu(s, qb, listTorrents) {
        await s.reply("请输入要操作的种子序号(发送'q'退出):");
        let command_id = await s.waitInput(async (s) => { }, 60);
        if (command_id === null) return s.reply('超时退出');
        command_id = command_id.getMsg().trim();

        if (command_id === 'q') return s.reply('已退出');

        const content = await getContentByNumber(command_id, listTorrents);
        if (content !== "序列号超出范围") {
            await handleTorrentOperations(s, qb, content);
        } else {
            await s.reply("错误：序列号超出范围，请重新输入。");
        }
    }

    async function handleTorrentOperations(s, qb, content) {
        const torrent_hash = content.raw.hash;
        const torrent_id = content.id;
        const torrent_name = content.name;

        do {
            await s.reply(
                `操作列表(发送'q'退出'u'返回)\n当前文件: ${torrent_name}\n当前hash: ${torrent_hash}\n` +
                "1. 暂停\n2. 恢复\n3. 删除(不会删除磁盘上的数据)\n4. 删除(删除磁盘上的数据)"
            );

            let command_eid = await s.waitInput(async (s) => { }, 30);
            if (command_eid === null) return s.reply('超时退出');
            const userMsg = command_eid.getMsg().trim();
            if (userMsg === 'q') return s.reply('已退出');

            switch (userMsg) {
                case "1":
                    await executeTorrentAction(qb.pauseTorrent, torrent_hash, "暂停");
                    break;
                case "2":
                    await executeTorrentAction(qb.resumeTorrent, torrent_hash, "恢复");
                    break;
                case "3":
                    await executeTorrentAction(qb.removeTorrent.bind(qb, torrent_id, false), torrent_name);
                    await s.reply("继续操作其它种子，请输入种子序号（发送'q'退出）:");
                    return; // 返回上一级
                case "4":
                    await executeTorrentAction(qb.removeTorrent.bind(qb, torrent_id, true), torrent_name);
                    await s.reply("继续操作其它种子，请输入种子序号（发送'q'退出）:");
                    return; // 返回上一级
                case "u":
                    return; // 返回上一级
                default:
                    await s.reply("错误：序列号超出范围，请重新输入。");
            }
        } while (true);
    }

    async function executeTorrentAction(action, hash, actionName) {
        try {
            const result = await action(hash);
            await s.reply(result ? `${actionName}成功` : `${actionName}失败`);
        } catch (err) {
            await s.reply(`${actionName}失败: ${err.message}`);
        }
    }

    function formatTorrentInfo(torrent, index) {
        return `${index}. ${truncateText(torrent.name, 30)}\n状态: ${torrent.state}\n进度: ${torrent.progress}%`;
    }

    function truncateText(text, maxLength) {
        return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
    }

    async function getContentByNumber(number, listTorrents) {
        const index = parseInt(number) - 1;
        if (index >= 0 && index < listTorrents.length) {
            return listTorrents[index];
        }
        return "序列号超出范围";
    }
};

