/**
 * @author xinz
 * @name qbittorent操作
 * @team xinz
 * @version 2.2.0
 * @description qBittorrent 下载器操作
 * @rule ^(qb操作)$
 * @priority 10000
 * @admin true
 * @public false
 * @disable false
 */

// 确保 @ctrl/qbittorrent 模块已安装
sysMethod.testModule(['@ctrl/qbittorrent'], { install: true });

// qBittorrent 连接配置（在插件配置界面填写，代码中不保存凭证）
let QB_CONFIG = {
    baseUrl: '',
    username: '',
    password: '',
};

const LOG_LEVEL = 'info'; // 设置默认日志级别 ('debug', 'info', 'warn', 'error')


const xinzLog = {
    pluginName: 'qbittorent操作', // 直接使用插件名
    levels: { debug: 1, info: 2, warn: 3, error: 4 },
    configLevel: LOG_LEVEL, // 使用上面定义的级别

    log(level, ...args) {
        const currentLevelNum = this.levels[level];
        const configLevelNum = this.levels[this.configLevel];
        if (!currentLevelNum || currentLevelNum < configLevelNum) return;

        const timestamp = sysMethod.getTime('yyyy-MM-dd hh:mm:ss');
        const prefix = `[xinz-原创 ][${this.pluginName}][${level.toUpperCase()}][${timestamp}]`;
        const method = console[level] || console.log;
        method(prefix, ...args);
    },

    debug(...args) { this.log('debug', ...args); },
    info(...args) { this.log('info', ...args); },
    warn(...args) { this.log('warn', ...args); },
    error(...args) { this.log('error', ...args); },
};

// --- 插件设置界面 Schema 定义 ---
let jsonSchema = null;
let ConfigDB = null;
try {
    if (typeof BncrCreateSchema !== 'undefined' && typeof BncrPluginConfig !== 'undefined') {
        const BCS = BncrCreateSchema;
        jsonSchema = BCS.object({
            baseUrl: BCS.string().setTitle('qBittorrent WebUI 地址')
                .setDescription('必填，例: http://127.0.0.1:8080/ （末尾带斜杠）').setDefault(''),
            username: BCS.string().setTitle('用户名').setDefault(''),
            password: BCS.string().setTitle('密码').setDefault(''),
        });
        ConfigDB = new BncrPluginConfig(jsonSchema);
    } else {
        console.error('[qbittorent操作] Bncr 环境缺少 BncrCreateSchema 或 BncrPluginConfig。');
    }
} catch (schemaError) {
    console.error('[qbittorent操作] 初始化 Schema 或 ConfigDB 时出错:', schemaError);
}

// ================== 辅助函数 ==================

/**
 * 格式化种子信息用于显示
 */
function formatTorrentInfo(torrent, index) {
    if (!torrent || !torrent.name) {
        xinzLog.warn('尝试格式化无效的 torrent 对象:', torrent);
        return index ? `${index}. 无效种子数据` : '无效种子数据';
    }
    const progress = (torrent.progress * 100).toFixed(1);
    const stateMap = {
        downloading: '下载中', stalledDL: '等待下载', uploading: '做种中', stalledUP: '等待做种',
        pausedDL: '暂停下载', pausedUP: '暂停做种', checkingDL: '校验中', checkingUP: '校验中',
        forcedDL: '强制下载', forcedUP: '强制做种', queuedDL: '排队下载', queuedUP: '排队做种',
        metaDL: '下载元数据', moving: '移动中', error: '错误', missingFiles: '文件丢失', unknown: '未知',
    };
    const stateStr = stateMap[torrent.state] || torrent.state;
    const prefix = index ? `${index}. ` : '';
    // 在名称后换行，状态和进度在同一行
    return `${prefix}${truncateText(torrent.name, 35)}\n   [${stateStr} | ${progress}%]`;
}

/**
 * 截断文本
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
}

/**
 * 根据序号获取种子对象
 */
function getContentByNumber(userInput, torrentList) {
    const number = parseInt(userInput, 10);
    if (isNaN(number)) {
        xinzLog.debug(`用户输入 "${userInput}" 不是有效数字`);
        return null;
    }
    const index = number - 1;
    if (torrentList && index >= 0 && index < torrentList.length) {
        xinzLog.debug(`根据序号 ${number} 找到种子: ${torrentList[index]?.name || '未知名称'}`);
        return torrentList[index];
    } else {
        xinzLog.debug(`用户输入序号 ${number} 超出范围 (列表长度 ${torrentList?.length || 0})`);
        return null;
    }
}

/**
 * 执行种子操作并回复
 */
async function executeTorrentAction(boundAction, hashOrId, actionName, s, extraArgs = []) {
    xinzLog.info(`准备执行操作: ${actionName}, 目标: ${hashOrId}`);
    await s.reply(`⏳ 正在执行操作: ${actionName}...`); // 提前告知用户
    try {
        const result = await boundAction(hashOrId, ...extraArgs);
        xinzLog.info(`操作 ${actionName} for ${hashOrId} 完成. API 返回: ${result}`);
        await s.reply(`✅ ${actionName} 操作命令已发送。`);
    } catch (err) {
        xinzLog.error(`执行操作 ${actionName} for ${hashOrId} 失败:`, err);
        await s.reply(`❌ ${actionName} 失败: ${err.message || err}`);
    }
}

// ================== 菜单处理函数 ==================

/**
 * 处理添加磁力链接
 */
async function handleAddMagnet(s, qb) {
    xinzLog.info('进入添加磁力链接流程');
    await s.reply("🔗 请发送磁力链接 (或 'q' 退出, 'u' 返回):");
    const magnetInputSender = await s.waitInput(async () => {}, 60);
    if (magnetInputSender === null) {
        xinzLog.warn('添加磁力链接等待输入超时');
        await s.reply('操作超时，已退出。');
        return 'exit';
    }

    const userInput = magnetInputSender.getMsg().trim();
    xinzLog.info(`收到磁力链接输入: ${userInput}`);

    const lowerInput = userInput.toLowerCase();
    if (lowerInput === 'q') {
        await s.reply('已退出插件。');
        xinzLog.info('用户在添加磁力时选择退出');
        return 'exit';
    }
    if (lowerInput === 'u') {
        xinzLog.info('用户在添加磁力时选择返回');
        return 'back';
    }

    if (!userInput.startsWith('magnet:?')) {
         xinzLog.warn(`用户输入的不是有效的磁力链接: ${userInput}`);
         await s.reply("❌ 输入的链接无效，请确保以 'magnet:?' 开头。");
         return 'continue';
    }

    try {
        await s.reply("⏳ 正在添加磁力链接，请稍候...");
        const addResult = await qb.addMagnet(userInput);
        xinzLog.info(`调用 qb.addMagnet('${userInput}') 返回: ${addResult}`);

        await sysMethod.sleep(2); // 等待 QB 处理
        const newData = await qb.getAllData();
        const addedTorrent = newData.torrents.find(t => userInput.includes(t.hash.substring(0, 10)));

        if (addedTorrent) {
             xinzLog.info(`磁力链接添加成功 (通过查找确认): ${addedTorrent.name}`);
             await s.reply(`✅ 添加成功:\n${formatTorrentInfo(addedTorrent)}`);
        } else {
             xinzLog.warn('磁力链接添加调用成功，但在列表中未立即找到对应种子');
             await s.reply("ℹ️ 磁力链接已提交添加，请稍后在列表中查看确认。");
        }
        return 'continue';

    } catch (err) {
        xinzLog.error(`添加磁力链接失败: ${userInput}`, err);
        await s.reply(`❌ 添加失败: ${err.message || err}`);
        return 'continue';
    }
}

/**
 * 处理显示做种列表
 */
async function handleSeedingList(s, torrentList) {
    xinzLog.info('处理显示做种列表');
    if (!torrentList) {
        xinzLog.error('handleSeedingList 接收到无效的 torrentList');
        await s.reply('❌ 无法获取种子列表数据。');
        return;
    }
    const seedingTorrents = torrentList.filter(torrent => torrent && (torrent.state === 'uploading' || torrent.state === 'stalledUP' || torrent.state === 'forcedUP'));
    if (seedingTorrents.length === 0) {
        xinzLog.info('当前没有做种的种子');
        await s.reply("ℹ️ 当前没有正在做种的种子。");
        return;
    }

    let responseMessage = `--- 🌱 做种列表 (${seedingTorrents.length} 个) ---\n`;
    responseMessage += seedingTorrents.map((torrent, i) => formatTorrentInfo(torrent, i + 1)).join('\n──────────────────\n'); // 使用更清晰的分隔符
    xinzLog.debug('生成的做种列表消息:', responseMessage);
    await s.reply(responseMessage);
}

/**
 * 处理显示所有种子列表
 */
async function handleAllTorrents(s, torrentList) {
    xinzLog.info('处理显示所有种子列表');
     if (!torrentList) {
        xinzLog.error('handleAllTorrents 接收到无效的 torrentList');
        await s.reply('❌ 无法获取种子列表数据。');
        return;
    }
    if (torrentList.length === 0) {
        xinzLog.info('当前没有种子');
        await s.reply("ℹ️ 当前 qBittorrent 中没有种子。");
        return;
    }

    let responseMessage = `--- 💾 所有种子 (${torrentList.length} 个) ---\n`;
    responseMessage += torrentList.map((torrent, i) => formatTorrentInfo(torrent, i + 1)).join('\n──────────────────\n');
    xinzLog.debug('生成的所有种子列表消息:', responseMessage);
    await s.reply(responseMessage);
}

/**
 * 处理种子操作的主菜单（先选择种子）
 */
async function handleTorrentOperationsMenu(s, qb, torrentList) {
    xinzLog.info('进入种子操作菜单 (选择种子)');
     if (!torrentList) {
        xinzLog.error('handleTorrentOperationsMenu 接收到无效的 torrentList');
        await s.reply('❌ 无法获取种子列表数据。');
        return 'continue';
    }
    if (torrentList.length === 0) {
        await s.reply("ℹ️ 当前没有种子可供操作。");
        return 'continue';
    }

    // 先显示列表供参考
    await handleAllTorrents(s, torrentList);
    await s.reply("\n👉 请输入要操作的种子序号 (或 'q' 退出, 'u' 返回):");

    const torrentChoiceSender = await s.waitInput(async () => { }, 60);
    if (torrentChoiceSender === null) {
        xinzLog.warn('选择种子操作等待输入超时');
        await s.reply('操作超时，已退出。');
        return 'exit';
    }

    const userInput = torrentChoiceSender.getMsg().trim().toLowerCase();
    xinzLog.info(`收到要操作的种子序号输入: ${userInput}`);

    if (userInput === 'q') {
        await s.reply('已退出插件。');
        xinzLog.info('用户在选择种子时退出');
        return 'exit';
    }
    if (userInput === 'u') {
        xinzLog.info('用户在选择种子时返回主菜单');
        return 'back';
    }

    const selectedTorrent = getContentByNumber(userInput, torrentList);
    if (selectedTorrent) {
        return await handleSpecificTorrentActions(s, qb, selectedTorrent);
    } else {
        xinzLog.warn(`无效的种子序号: ${userInput}`);
        await s.reply("❌ 错误：无效的种子序号，请重新输入。");
        return 'continue';
    }
}

/**
 * 处理对特定种子的具体操作
 */
async function handleSpecificTorrentActions(s, qb, torrent) {
    if (!torrent || !torrent.hash || !torrent.name) {
        xinzLog.error('handleSpecificTorrentActions 接收到无效的 torrent 对象:', torrent);
        await s.reply('❌ 无法操作无效的种子数据。');
        return 'back';
    }
    const torrentHash = torrent.hash;
    const torrentName = torrent.name;
    xinzLog.info(`进入对种子 "${torrentName}" (Hash: ${torrentHash}) 的具体操作菜单`);

    while (true) { // 子菜单循环
        const actionMenuMessage =
            `──────── 操作种子 ────────\n` +
            `▶️ 文件: ${truncateText(torrentName, 40)}\n` +
            `───────────────\n` +
            `1. ⏸️ 暂停\n` +
            `2. ▶️ 恢复\n` +
            `3. 🗑️ 删除种子 (保留文件)\n` +
            `4. 💥 删除种子和文件\n` +
            `───────────────\n` +
            `q. 退出插件\n` +
            `u. 返回列表`;
        await s.reply(actionMenuMessage);
        xinzLog.debug(`显示种子 "${torrentName}" 的具体操作列表`);

        const actionChoiceSender = await s.waitInput(async () => { }, 60);
        if (actionChoiceSender === null) {
            xinzLog.warn(`种子 "${torrentName}" 的操作等待超时`);
            await s.reply('操作超时，已退出。');
            return 'exit';
        }

        const userChoice = actionChoiceSender.getMsg().trim().toLowerCase();
        xinzLog.info(`收到对种子 "${torrentName}" 的操作选择: ${userChoice}`);

        if (userChoice === 'q') {
            await s.reply('已退出插件。');
            xinzLog.info('用户在种子操作子菜单中退出插件');
            return 'exit';
        }
        if (userChoice === 'u') {
            xinzLog.info('用户在种子操作子菜单中返回上一级');
            return 'back';
        }

        const boundPauseTorrents = qb.pauseTorrents.bind(qb);
        const boundResumeTorrents = qb.resumeTorrents.bind(qb);
        const boundRemoveTorrent = qb.removeTorrent.bind(qb);

        switch (userChoice) {
            case "1": // 暂停
                await executeTorrentAction(boundPauseTorrents, torrentHash, "暂停", s);
                // 暂停后留在当前菜单，用户可能想立即恢复或做其他操作
                // return 'back'; // 或者返回上一级刷新状态
                break; // 继续显示当前操作菜单
            case "2": // 恢复
                await executeTorrentAction(boundResumeTorrents, torrentHash, "恢复", s);
                // return 'back'; // 或者返回上一级刷新状态
                break; // 继续显示当前操作菜单
            case "3": // 删除种子（保留文件）
                await executeTorrentAction(boundRemoveTorrent, torrentHash, `删除种子 "${truncateText(torrentName, 20)}" (保留文件)`, s, [false]);
                xinzLog.info(`种子 "${torrentName}" 已被删除 (文件保留)，返回上一级菜单`);
                await s.reply(`✅ 种子 "${truncateText(torrentName, 30)}" 已删除（文件保留）。`);
                return 'back'; // 删除后自动返回上一级
            case "4": // 删除种子和文件
                await s.reply(`⚠️ 警告：即将彻底删除种子 "${truncateText(torrentName, 30)}" 及其所有文件！\n确认请输入 'yes'，其他任意内容取消：`);
                const confirmSender = await s.waitInput(async () => {}, 30);
                if (confirmSender && confirmSender.getMsg().trim().toLowerCase() === 'yes') {
                    xinzLog.warn(`用户确认删除种子 "${torrentName}" 及其文件`);
                    await executeTorrentAction(boundRemoveTorrent, torrentHash, `删除种子 "${truncateText(torrentName, 20)}" 及文件`, s, [true]);
                    xinzLog.info(`种子 "${torrentName}" 及其文件已被删除，返回上一级菜单`);
                    await s.reply(`💥 种子 "${truncateText(torrentName, 30)}" 及其文件已删除。`);
                } else {
                    xinzLog.info(`用户取消了删除种子 "${torrentName}" 及其文件`);
                    await s.reply("已取消删除操作。");
                }
                return 'back'; // 无论是否删除，都返回上一级
            default:
                xinzLog.warn(`无效的操作输入: ${userChoice}`);
                await s.reply("❌ 错误：无效的操作选项，请重新输入。");
                // 继续子菜单循环
        }
        // 对于暂停/恢复，短暂等待后继续显示当前菜单
        await sysMethod.sleep(1);

    } // end while(true) for action menu
}

// ================== 主插件入口 ==================

module.exports = async s => {
    xinzLog.info(`用户 ${s.getUserName()} (${s.getUserId()}) 触发 qb操作 插件`);

    // --- 读取插件配置 ---
    if (!ConfigDB) { await s.reply('❌ 插件配置系统未初始化。'); return; }
    try {
        await ConfigDB.get();
        const CFG = ConfigDB.userConfig || {};
        QB_CONFIG.baseUrl = String(CFG.baseUrl || '').trim();
        QB_CONFIG.username = String(CFG.username || '').trim();
        QB_CONFIG.password = String(CFG.password || '');
        if (!QB_CONFIG.baseUrl || !QB_CONFIG.username || !QB_CONFIG.password) {
            await s.reply('ℹ️ 请先在 Web 界面的插件设置中填写 qBittorrent 地址、用户名和密码。');
            return;
        }
    } catch (dbErr) {
        xinzLog.error('获取插件配置失败:', dbErr);
        await s.reply(`❌ 获取插件配置失败: ${dbErr.message}`);
        return;
    }

    xinzLog.debug('当前QB配置:', { baseUrl: QB_CONFIG.baseUrl, username: QB_CONFIG.username, password: '***' });
    xinzLog.info(`日志级别设置为: ${LOG_LEVEL}`);

    let qb;
    try {
        await s.reply("⏳ 正在连接 qBittorrent...");
        const { QBittorrent } = await import('@ctrl/qbittorrent');
        qb = new QBittorrent({
            baseUrl: QB_CONFIG.baseUrl,
            username: QB_CONFIG.username,
            password: QB_CONFIG.password,
            // timeout: 15000, // 增加超时
        });
        await qb.login();
        xinzLog.info('qBittorrent 客户端初始化并登录成功');
        await s.reply("✅ 连接成功！");
    } catch (initError) {
        xinzLog.error('初始化或登录 qBittorrent 客户端失败:', initError);
        await s.reply(`❌ 连接 qBittorrent 失败: ${initError.message || initError}. 请检查配置和网络。`);
        return;
    }

    try {
        mainLoop: while (true) {
            let currentTorrents;
            try {
                const data = await qb.getAllData();
                currentTorrents = data.torrents;
                xinzLog.info(`获取到 ${currentTorrents.length} 个种子数据`);
                xinzLog.debug('当前种子列表:', currentTorrents.map(t => t?.name || 'N/A'));
            } catch (fetchError) {
                xinzLog.error('获取 QB 数据失败:', fetchError);
                await s.reply(`❌ 获取 qBittorrent 数据时出错: ${fetchError.message}.`);
                await s.reply("🤔 正在尝试重新连接...");
                await sysMethod.sleep(3);
                try { // 尝试重连一次
                    await qb.login();
                    xinzLog.info("重新连接 QB 成功");
                    await s.reply("✅ 重连成功！");
                    continue; // 重连成功后继续循环
                } catch (reconnectError){
                    xinzLog.error("重连 QB 失败:", reconnectError);
                    await s.reply("❌ 重连失败，请检查 QB 服务状态和配置。插件退出。");
                    break mainLoop; // 重连失败则退出
                }
            }

            // 显示主菜单选项
            const mainMenuMessage = `------ qBittorrent 操作 ------\n` +
                `0. ➕ 添加磁力链接\n` +
                `1. 🌱 查看做种列表\n` +
                `2. 💾 查看所有种子\n` +
                `3. 👉 操作指定种子\n` +
                `──────────────────\n` +
                `q. 退出插件`;
            await s.reply(mainMenuMessage);
            xinzLog.debug("显示主菜单");

            const mainChoiceSender = await s.waitInput(async () => { }, 60);
            if (mainChoiceSender === null) {
                xinzLog.warn('主菜单等待用户输入超时');
                await s.reply('操作超时，已退出。');
                break mainLoop;
            }

            const userChoice = mainChoiceSender.getMsg().trim().toLowerCase();
            xinzLog.info(`收到主菜单选择: ${userChoice}`);

            let loopControl = 'continue';

            switch (userChoice) {
                case 'q':
                    await s.reply('👋 已退出 qb操作。');
                    xinzLog.info('用户选择退出插件');
                    break mainLoop;
                case '0':
                    loopControl = await handleAddMagnet(s, qb);
                    break;
                case '1':
                    await handleSeedingList(s, currentTorrents);
                    break;
                case '2':
                    await handleAllTorrents(s, currentTorrents);
                    break;
                case '3':
                    loopControl = await handleTorrentOperationsMenu(s, qb, currentTorrents);
                    break;
                default:
                    xinzLog.warn(`无效的主菜单输入: ${userChoice}`);
                    await s.reply("❌ 错误：无效的选项，请重新输入。");
                    break;
            }

            if (loopControl === 'exit') {
                break mainLoop;
            }

            // 在下一次循环前添加短暂延迟，避免消息发送过于密集
            if (loopControl === 'continue' || loopControl === 'back') {
                 await sysMethod.sleep(1.5); // 1.5秒延迟
            }
        } // end mainLoop

    } catch (e) {
        xinzLog.error("插件主逻辑发生未捕获错误:", e);
        await s.reply(`❌ 插件运行时发生内部错误: ${e.message}，请检查日志。`);
    } finally {
        xinzLog.info("qb操作 插件执行结束");
        try {
            await qb.logout();
            xinzLog.info('qBittorrent 客户端已登出');
        } catch (logoutError) {
            xinzLog.warn('登出 qBittorrent 时出错:', logoutError);
        }
    }
};

if (jsonSchema && ConfigDB) { module.exports.jsonSchema = jsonSchema; }
