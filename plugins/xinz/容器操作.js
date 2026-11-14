/**
 * @author xinz
 * @name 容器操作
 * @team xinz
 * @version 1.5.1
 * @description 增强版容器操作，包含状态、资源、日志查询(截图)、二维码发送等
 * @rule ^(容器操作)$
 * @priority 10000
 * @admin true
 * @public false
 * @disable false
 */

// 引入必要的模块，并尝试安装 ssh2 和 puppeteer
sysMethod.testModule(['ssh2', 'puppeteer'], { install: true });
const Client = require('ssh2').Client;
const path = require('path');
let puppeteer; // 稍后加载

// --- SSH 配置（在插件配置界面填写，代码中不保存凭证） ---
let SSH_CONFIG = {
    host: '',
    port: 22,
    username: '',
    password: '',
    readyTimeout: 20000,
};

// --- 日志与截图配置 ---
const LOG_LEVEL = 'info'; // 日志级别: 'debug', 'info', 'warn', 'error'
const LOGS_TAIL_COUNT = 50; // 查看近期日志时默认显示的行数
const SCREENSHOT_MAX_LINES = 200; // 截图时最多渲染的日志行数，防止图片过大
const ENABLE_LOG_SCREENSHOT = true; // true: 发送截图, false: 发送文本

// Puppeteer 浏览器可执行路径；留 null 由 Puppeteer 自动查找。
// 如为固定部署，可在配置中指定本机 Chrome/Chromium 的可执行文件路径。
const PUPPETEER_EXECUTABLE_PATH = null;

/** ===========================================================================
 * xinz 原创日志 功能
 * ===========================================================================
 */
const xinzLog = {
    pluginName: '容器操作', // 插件名称，用于日志前缀
    levels: { debug: 1, info: 2, warn: 3, error: 4 }, // 日志级别定义
    configLevel: LOG_LEVEL, // 当前配置的日志级别

    // 内部日志记录函数
    log(level, ...args) {
        const currentLevelNum = this.levels[level];
        const configLevelNum = this.levels[this.configLevel];
        // 如果当前日志级别低于配置级别，则不输出
        if (!currentLevelNum || currentLevelNum < configLevelNum) return;

        const timestamp = sysMethod.getTime('yyyy-MM-dd hh:mm:ss'); // 获取当前时间
        // 构造日志前缀
        const prefix = `[xinz-原创 ][${this.pluginName}][${level.toUpperCase()}][${timestamp}]`;
        const method = console[level] || console.log; // 获取对应的控制台输出方法
        method(prefix, ...args); // 输出日志
    },

    // 提供便捷的日志调用方法
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
            host: BCS.string().setTitle('SSH 主机地址').setDescription('远程服务器地址').setDefault(''),
            port: BCS.number().setTitle('SSH 端口').setDefault(22),
            username: BCS.string().setTitle('SSH 用户名').setDefault(''),
            password: BCS.string().setTitle('SSH 密码').setDefault(''),
            readyTimeout: BCS.number().setTitle('连接超时(毫秒)').setDefault(20000),
        });
        ConfigDB = new BncrPluginConfig(jsonSchema);
    } else {
        console.error('[容器操作] Bncr 环境缺少 BncrCreateSchema 或 BncrPluginConfig。');
    }
} catch (schemaError) {
    console.error('[容器操作] 初始化 Schema 或 ConfigDB 时出错:', schemaError);
}


/** ===========================================================================
 * 插件主逻辑
 * ===========================================================================
 */
module.exports = async s => {
    // --- 读取插件配置 ---
    if (!ConfigDB) { await s.reply('❌ 插件配置系统未初始化。'); return; }
    try {
        await ConfigDB.get();
        const CFG = ConfigDB.userConfig || {};
        SSH_CONFIG.host = String(CFG.host || '').trim();
        SSH_CONFIG.port = CFG.port || 22;
        SSH_CONFIG.username = String(CFG.username || '').trim();
        SSH_CONFIG.password = String(CFG.password || '');
        SSH_CONFIG.readyTimeout = CFG.readyTimeout || 20000;
        if (!SSH_CONFIG.host || !SSH_CONFIG.username || !SSH_CONFIG.password) {
            await s.reply('ℹ️ 请先在 Web 界面的插件设置中填写 SSH 主机、用户名和密码。');
            return;
        }
    } catch (dbErr) {
        xinzLog.error('获取插件配置失败:', dbErr);
        await s.reply(`❌ 获取插件配置失败: ${dbErr.message}`);
        return;
    }

    xinzLog.info(`用户 ${s.getUserName()} (${s.getUserId()}) 触发容器操作`);
    xinzLog.debug('当前SSH配置:', { host: SSH_CONFIG.host, port: SSH_CONFIG.port, username: SSH_CONFIG.username, password: '***' });
    xinzLog.info(`日志级别设置为: ${LOG_LEVEL}`);
    if (ENABLE_LOG_SCREENSHOT) {
        xinzLog.info(`日志将尝试以截图形式发送 (最多 ${SCREENSHOT_MAX_LINES} 行)`);
        if (PUPPETEER_EXECUTABLE_PATH) {
             xinzLog.info(`将尝试使用浏览器: ${PUPPETEER_EXECUTABLE_PATH}`);
        } else {
             xinzLog.warn("未配置特定浏览器路径 (PUPPETEER_EXECUTABLE_PATH)，将依赖 Puppeteer 自动查找");
        }
    } else {
        xinzLog.info("日志将以文本形式发送");
    }

    // 尝试加载 puppeteer
    try {
        if (ENABLE_LOG_SCREENSHOT) {
            puppeteer = require('puppeteer');
            xinzLog.debug("Puppeteer 模块加载成功");
        }
    } catch (err) {
        xinzLog.error("加载 puppeteer 模块失败! 日志截图功能将不可用。", err);
        // 允许继续运行，但截图会失败并回退
    }

    try {
        // --- 获取容器列表 ---
        let containerList;
        try {
            containerList = await getContainerList();
            xinzLog.info(`成功获取 ${containerList.length} 个容器列表`);
            xinzLog.debug('容器列表数据:', containerList);
        } catch (error) {
            xinzLog.error('获取容器列表失败:', error);
            await s.reply(`获取容器列表失败: ${error.message}`);
            return;
        }

        if (containerList.length === 0) {
            xinzLog.warn("无可用容器");
            await s.reply("当前没有可用容器");
            return;
        }

        // --- 主菜单循环 ---
        let inMainMenu = true;
        while (inMainMenu) {
            const outputWithNumbers = containerList.map((item, index) => {
                const statusDesc = getStatusDescription(item.Status);
                return `${index + 1}. ${item.Name} [${statusDesc}] 镜像: ${item.Image}`;
            });
            const listMessage = "容器列表:\n" + outputWithNumbers.join('\n') + "\n请输入要操作的容器序号 (输入 q 退出):";
            await s.reply(listMessage);
            xinzLog.debug("显示容器列表菜单");

            const primaryInputSender = await s.waitInput(async () => { }, 60);
            if (primaryInputSender === null) {
                xinzLog.warn('主菜单等待用户输入超时');
                await s.reply('操作超时，已退出。');
                inMainMenu = false;
                continue;
            }

            const userInput = primaryInputSender.getMsg().trim().toLowerCase();
            xinzLog.info(`收到主菜单输入: ${userInput}`);

            if (userInput === 'q') {
                await s.reply('已退出容器操作。');
                xinzLog.info('用户选择退出');
                inMainMenu = false;
                continue;
            }

            const selectedContainer = await getContentByNumber(containerList, userInput);

            // --- 操作菜单循环 ---
            if (selectedContainer) {
                xinzLog.info(`用户选择了容器: ${selectedContainer.Name} (序号: ${userInput})`);
                let inActionMenu = true;
                do {
                    // --- 显示操作菜单 ---
                    const actionMenuMessage = `\n当前容器: ${selectedContainer.Name}\n` +
                        `请选择操作:\n`+
                        `1. 启动\n` +
                        `2. 停止\n` +
                        `3. 重启\n` +
                        `4. 升级 (尝试拉取镜像并重启)\n` +
                        `5. 设置开机自启\n` +
                        `6. 查看详细信息\n` +
                        `7. 查看近期日志 (${ENABLE_LOG_SCREENSHOT ? '截图' : '文本'}, 最近 ${LOGS_TAIL_COUNT} 行)\n` +
                        `q. 退出插件\n` +
                        `u. 返回上一级 (容器列表)`;
                    await s.reply(actionMenuMessage);
                    xinzLog.debug(`显示容器 ${selectedContainer.Name} 的操作菜单`);

                    const actionInputSender = await s.waitInput(async () => { }, 60);
                    if (actionInputSender === null) {
                        xinzLog.warn(`容器 ${selectedContainer.Name} 操作菜单等待超时`);
                        await s.reply('操作超时，已退出插件。');
                        inActionMenu = false;
                        inMainMenu = false;
                        break;
                    }

                    const userChoice = actionInputSender.getMsg().trim().toLowerCase();
                    xinzLog.info(`收到容器 ${selectedContainer.Name} 的操作选择: ${userChoice}`);

                    if (userChoice === 'q') {
                        await s.reply('已退出插件。');
                        xinzLog.info('用户选择退出插件');
                        inActionMenu = false;
                        inMainMenu = false;
                        break;
                    }
                    if (userChoice === 'u') {
                        xinzLog.info('用户选择返回上一级菜单');
                        inActionMenu = false;
                        break;
                    }

                    let docker_command = null;
                    let operationDesc = "";

                    switch (userChoice) {
                        case "1":
                            docker_command = `docker start ${selectedContainer.Name}`; operationDesc = "启动"; break;
                        case "2":
                            docker_command = `docker stop ${selectedContainer.Name}`; operationDesc = "停止"; break;
                        case "3":
                            docker_command = `docker restart ${selectedContainer.Name}`; operationDesc = "重启"; break;
                        case "4":
                            docker_command = `docker pull ${selectedContainer.Image} && docker restart ${selectedContainer.Name}`;
                            operationDesc = "升级 (尝试拉取并重启)";
                            await s.reply("提示：升级功能将尝试拉取最新镜像并重启容器...");
                            break;
                        case "5":
                            docker_command = `docker update --restart=always ${selectedContainer.Name}`; operationDesc = "设置开机自启"; break;
                        case "6":
                            operationDesc = "查看详细信息";
                            xinzLog.info(`准备执行操作: ${operationDesc} (容器: ${selectedContainer.Name})`);
                            await showContainerDetails(s, selectedContainer.Name);
                            continue;
                        case "7":
                            operationDesc = `查看近期日志 (${ENABLE_LOG_SCREENSHOT ? '截图' : '文本'})`;
                            xinzLog.info(`准备执行操作: ${operationDesc} (容器: ${selectedContainer.Name})`);
                            await showContainerLogs(s, selectedContainer.Name);
                            continue;
                        default:
                            xinzLog.warn(`无效的操作输入: ${userChoice}`);
                            await s.reply("错误：无效的操作选项，请重新输入。");
                            continue;
                    }

                    // --- 执行 Docker 命令 (1-5) ---
                    if (docker_command) {
                        xinzLog.info(`准备执行操作: ${operationDesc}, 命令: ${docker_command}`);
                        await s.reply(`正在为容器 ${selectedContainer.Name} 执行 [${operationDesc}] 操作，请稍候...`);
                        try {
                            const output = await sshExecCommand(docker_command);
                            const rawOutputTrimmed = output.trim();
                            const qrHandled = await trySendQrCode(s, rawOutputTrimmed);

                            if (!qrHandled) {
                                let formattedOutput = rawOutputTrimmed;
                                if (!rawOutputTrimmed || rawOutputTrimmed.toLowerCase() === selectedContainer.Name.toLowerCase()) {
                                    formattedOutput = `[${operationDesc}] 操作命令已发送或执行成功。`;
                                } else {
                                    formattedOutput = formattedOutput.replace(/\r?\n|\r/g, " ");
                                    if (formattedOutput.length > 200) {
                                        formattedOutput = formattedOutput.substring(0, 200) + "... (输出过长)";
                                    }
                                }
                                xinzLog.info(`操作 [${operationDesc}] (容器: ${selectedContainer.Name}) 完成. 原始输出长度: ${rawOutputTrimmed.length}`);
                                await s.reply("操作结果: " + formattedOutput);
                            } else {
                                xinzLog.info(`操作 [${operationDesc}] 完成，二维码信息已处理，未发送常规结果文本。`);
                            }
                        } catch (error) {
                            xinzLog.error(`执行操作 [${operationDesc}] (容器: ${selectedContainer.Name}) 失败:`, error);
                            await s.reply(`操作失败：${error.message}`);
                        }
                    }
                } while (inActionMenu);
            } else {
                xinzLog.warn(`无效的容器序号输入: ${userInput}`);
                await s.reply("错误：无效的容器序号，请重新输入。");
            }
        } // 主菜单循环结束

    } catch (e) {
        xinzLog.error("插件主逻辑发生未捕获错误:", e);
        await s.reply(`插件运行时发生内部错误: ${e.message}，请检查后台日志。`);
    } finally {
        xinzLog.info("容器操作插件执行结束");
    }
};

// ================== 核心功能函数 ==================

/**
 * 通过 SSH 获取容器列表及基本信息
 * @returns {Promise<Array<{Name: string, Status: string, Image: string}>>}
 */
async function getContainerList() {
    const listCommand = "docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}'";
    xinzLog.debug(`准备执行命令获取容器列表: ${listCommand}`);
    try {
        const output = await sshExecCommand(listCommand);
        const lines = output.trim().split('\n').filter(Boolean);
        xinzLog.debug(`获取到原始容器列表输出行数: ${lines.length}`);
        return lines.map(line => {
            const parts = line.split('|');
            if (parts.length >= 3) { return { Name: parts[0].trim(), Status: parts[1].trim(), Image: parts[2].trim() }; }
            else { xinzLog.warn(`解析容器列表行失败 (格式不符): ${line}`); return null; }
        }).filter(item => item !== null);
    } catch (error) { throw new Error(`通过 SSH 获取容器列表失败：${error.message}`); }
}

/**
 * 根据用户输入的序号字符串从容器列表中获取对应的容器对象
 * @param {Array} containerList
 * @param {string} userInput
 * @returns {object | null}
 */
async function getContentByNumber(containerList, userInput) {
    const number = parseInt(userInput, 10);
    if (isNaN(number)) { xinzLog.debug(`用户输入 "${userInput}" 不是有效数字`); return null; }
    const index = number - 1;
    if (index >= 0 && index < containerList.length) { xinzLog.debug(`根据序号 ${number} 找到容器: ${containerList[index].Name}`); return containerList[index]; }
    else { xinzLog.debug(`用户输入序号 ${number} 超出范围 (列表长度 ${containerList.length})`); return null; }
}

/**
 * 通过 SSH 连接到远程服务器并执行命令
 * @param {string} command
 * @returns {Promise<string>} 命令的标准输出 (stdout)
 */
async function sshExecCommand(command) {
    const { host, port, username, password, readyTimeout } = SSH_CONFIG;
    const connectionTimeout = readyTimeout || 15000;
    xinzLog.debug(`准备通过 SSH (${username}@${host}:${port}) 执行命令: "${command}"`);
    return new Promise((resolve, reject) => {
        const conn = new Client(); let output = '', stderrOutput = '', connectionClosed = false;
        let connectionTimer = null, streamTimer = null;
        const closeConnection = (reason = '未知原因') => {
            if (!connectionClosed) { clearTimeout(connectionTimer); clearTimeout(streamTimer); try { conn.end(); } catch (closeErr) { xinzLog.warn(`关闭 SSH 连接时发生错误: ${closeErr.message}`); } connectionClosed = true; xinzLog.debug(`SSH 连接已关闭 (原因: ${reason}). 主机: ${host}:${port}`); } };
        connectionTimer = setTimeout(() => { if (!connectionClosed) { const timeoutMsg = `SSH 连接超时 (${connectionTimeout}ms). 主机: ${host}:${port}`; xinzLog.error(timeoutMsg); closeConnection('连接超时'); reject(new Error(timeoutMsg)); } }, connectionTimeout);
        conn.on('ready', () => {
            clearTimeout(connectionTimer); xinzLog.debug(`SSH 连接成功. 主机: ${host}:${port}`);
            conn.exec(command, { pty: false }, (err, stream) => {
                if (err) { xinzLog.error(`SSH 执行错误 (conn.exec): 命令: "${command}"`, err); closeConnection('执行错误 (exec)'); return reject(new Error(`SSH command execution error: ${err.message}`)); }
                let streamClosed = false; const streamCloseHandler = (code, signal) => { if (streamClosed) return; streamClosed = true; clearTimeout(streamTimer); xinzLog.debug(`SSH 流关闭. 退出码: ${code}, 信号: ${signal}. 命令: "${command}"`); closeConnection(`流关闭 (code ${code})`); if (code !== 0 && code !== null) { const warnMsg = `命令 "${command}" 执行可能未完全成功，退出码: ${code}${stderrOutput ? `. STDERR: ${stderrOutput.trim()}` : ''}`; xinzLog.warn(warnMsg); } resolve(output); };
                stream.on('close', streamCloseHandler).on('data', (data) => { output += data.toString(); }).stderr.on('data', (data) => { const errData = data.toString(); xinzLog.warn(`SSH STDERR: 命令: "${command}". 输出: ${errData.trim()}`); stderrOutput += errData; });
                const streamTimeoutDuration = 60000; streamTimer = setTimeout(() => { if (!streamClosed) { xinzLog.warn(`SSH 命令流超时 (${streamTimeoutDuration}ms). 命令: "${command}". 尝试关闭流...`); try { stream.close(); } catch (streamCloseErr) { xinzLog.warn(`尝试关闭超时流时出错: ${streamCloseErr.message}`); } } }, streamTimeoutDuration);
            });
        }).on('error', (err) => { clearTimeout(connectionTimer); xinzLog.error(`SSH 连接错误: 主机: ${host}:${port}`, err); closeConnection('连接错误'); reject(new Error(`SSH connection error: ${err.message}`)); })
          .on('end', () => { closeConnection('连接正常结束 (end event)'); }).on('close', (hadError) => { closeConnection(`连接关闭 (close event, hadError=${hadError})`); })
          .connect({ host, port: parseInt(port, 10), username, password, readyTimeout: connectionTimeout, keepaliveInterval: 5000 });
    });
}

/**
 * 根据 Docker 返回的状态字符串获取更友好的中文描述
 * @param {string} status
 * @returns {string}
 */
function getStatusDescription(status) {
    if (!status) return '状态未知'; const lowerStatus = status.toLowerCase(); if (lowerStatus.startsWith('up')) return '运行中'; if (lowerStatus.startsWith('exited')) return '已停止'; if (lowerStatus.startsWith('paused')) return '已暂停'; if (lowerStatus.startsWith('restarting')) return '重启中'; if (lowerStatus.startsWith('created')) return '已创建'; if (lowerStatus.startsWith('dead')) return '已死亡'; return status;
}

/**
 * 获取并显示指定容器的详细信息
 * @param {object} s sender 对象
 * @param {string} containerName
 */
async function showContainerDetails(s, containerName) {
    xinzLog.info(`准备获取容器 ${containerName} 的详细信息`); const detailsCommand = `docker inspect --format '{{json .}}' ${containerName}`; const statsCommand = `docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" ${containerName}`;
    try {
        const inspectOutput = await sshExecCommand(detailsCommand); xinzLog.debug(`容器 ${containerName} inspect 原始 JSON 输出长度: ${inspectOutput.length}`); const details = JSON.parse(inspectOutput); let statsInfo = "资源信息获取中...";
        try { const statsOutput = await sshExecCommand(statsCommand); const trimmedStats = statsOutput.trim(); xinzLog.debug(`容器 ${containerName} stats 原始输出: "${trimmedStats}"`); if (trimmedStats && trimmedStats.includes('|')) { const [cpu, mem] = trimmedStats.split('|'); const cpuUsage = cpu.trim().replace('%', ''); const memUsage = mem.trim(); statsInfo = `CPU: ${cpuUsage}% | 内存: ${memUsage}`; } else if (trimmedStats) { statsInfo = `资源信息: ${trimmedStats}`; xinzLog.warn(`解析容器 ${containerName} 的 stats 输出格式可能不符合预期: ${trimmedStats}`); } else { statsInfo = "无法获取资源信息 (stats无输出)"; xinzLog.warn(`获取容器 ${containerName} 的 stats 无输出`); } } catch (statsError) { statsInfo = `获取资源信息失败`; xinzLog.error(`执行 docker stats (容器: ${containerName}) 失败:`, statsError); }
        const statusDesc = getStatusDescription(details.State?.Status); const startedAt = details.State?.StartedAt && details.State.StartedAt !== "0001-01-01T00:00:00Z" ? new Date(details.State.StartedAt).toLocaleString('zh-CN', { hour12: false }) : 'N/A'; const finishedAt = details.State?.FinishedAt && details.State?.FinishedAt !== "0001-01-01T00:00:00Z" ? new Date(details.State.FinishedAt).toLocaleString('zh-CN', { hour12: false }) : 'N/A'; const created = details.Created ? new Date(details.Created).toLocaleString('zh-CN', { hour12: false }) : 'N/A'; const exitCode = details.State?.ExitCode ?? 'N/A'; const ipAddress = details.NetworkSettings?.IPAddress || (Object.values(details.NetworkSettings?.Networks || {})[0]?.IPAddress) || 'N/A'; let ports = JSON.stringify(details.NetworkSettings?.Ports) || '{}'; if (ports.length > 150) { ports = ports.substring(0, 150) + '... (内容过长省略)'; } const restartPolicy = details.HostConfig?.RestartPolicy?.Name || 'no'; const retryCount = details.HostConfig?.RestartPolicy?.MaximumRetryCount || 0;
        const detailsMsg = [ `📦 容器名称: ${details.Name?.substring(1) || containerName}`, `🆔 短 ID: ${details.Id?.substring(0, 12) || 'N/A'}`, `🖼️ 镜像: ${details.Config?.Image || 'N/A'}`, `🕒 创建时间: ${created}`, `📊 状态: ${statusDesc}`, `🚦 退出码: ${exitCode}`, `🚀 启动于: ${startedAt}`, `🏁 结束于: ${finishedAt}`, `💾 ${statsInfo}`, `🔌 IP 地址: ${ipAddress}`, `🔗 端口映射: ${ports}`, `🔄 重启策略: ${restartPolicy}${restartPolicy !== 'no' ? ` (最多尝试 ${retryCount} 次)` : ''}`, ].join('\n');
        xinzLog.info(`成功获取并格式化容器 ${containerName} 的详细信息`); await s.reply(detailsMsg);
    } catch (error) { xinzLog.error(`获取或解析容器 ${containerName} 详细信息失败:`, error); await s.reply(`获取容器 ${containerName} 详细信息失败：${error.message}`); }
}

/**
 * 尝试在给定的文本中检测二维码相关信息（特定URL、Base64图片、图片URL）并发送给用户
 * @param {object} s sender 对象
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function trySendQrCode(s, text) {
    if (!text || text.length < 30) { return false; } xinzLog.debug(`尝试在文本中检测二维码/URL (文本长度: ${text.length})`); const specificUrlRegex = /二维码解码URL:\s*(https?:\/\/[^\s]+)/i; const specificUrlMatch = text.match(specificUrlRegex);
    if (specificUrlMatch && specificUrlMatch[1]) { const extractedUrl = specificUrlMatch[1].trim(); xinzLog.info(`检测到特定二维码解码 URL: ${extractedUrl}`); try { await s.reply(`检测到登录二维码URL，请复制到浏览器打开或手动生成二维码进行扫描：\n${extractedUrl}`); xinzLog.info("已将提取到的二维码 URL 作为文本发送给用户。"); return true; } catch (sendError) { xinzLog.error(`发送特定二维码 URL 时出错:`, sendError); return true; } } // 即使发送失败也标记为处理
    xinzLog.debug("未检测到 '二维码解码URL:' 格式，继续检查其他图片格式..."); const base64Regex = /(data:image\/(?:png|jpeg|gif|webp);base64,([a-zA-Z0-9+/=]{100,}))/; const base64Match = text.match(base64Regex);
    if (base64Match && base64Match[1]) { const fullBase64String = base64Match[1]; xinzLog.info("检测到 Base64 图片数据，尝试发送..."); try { await s.reply(`[CQ:image,file=${fullBase64String}]`); xinzLog.info("Base64 图片发送成功 (可能)"); return true; } catch (e) { xinzLog.error("发送 Base64 图片失败:", e); } }
    const urlRegex = /(https?:\/\/[^\s'"()<>\[\]]+?\.(?:png|jpg|jpeg|gif|svg|webp)(?:\?[^\s'"()<>\[\]]*)?)/gi; let urlMatch; urlRegex.lastIndex = 0;
    while ((urlMatch = urlRegex.exec(text)) !== null) { const imageUrl = urlMatch[0]; if (imageUrl.length > 20) { xinzLog.info(`检测到通用图片 URL: ${imageUrl}，尝试发送...`); try { await s.reply(`[CQ:image,file=${imageUrl}]`); xinzLog.info("图片 URL 发送成功 (可能)"); return true; } catch (e) { xinzLog.error(`发送图片 URL ${imageUrl} 失败:`, e); } } }
    xinzLog.debug("未在文本中检测到其他可处理的二维码/图片格式"); return false;
}


// --- 辅助函数 ---
/**
 * 移除 ANSI 转义字符
 * @param {string} text
 * @returns {string}
 */
function stripAnsiCodes(text) { if (!text) return ''; return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, ''); }

/**
 * 对 HTML 特殊字符进行转义
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) { if (!text) return ''; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

/**
 * 将日志文本发送给用户 (截图回退)
 * @param {object} s sender 对象
 * @param {string} containerName
 * @param {string} logsText
 */
async function sendLogsAsText(s, containerName, logsText) {
    xinzLog.info(`[回退] 准备将容器 ${containerName} 的日志作为文本发送`); try { if (!logsText) { await s.reply(`容器 [${containerName}] 近期没有日志输出。`); } else { const MAX_LOG_LENGTH = 1500; let replyMsg = `容器 [${containerName}] 的近期日志 (最后 ${LOGS_TAIL_COUNT} 行) [文本模式]:\n------\n`; if (logsText.length > MAX_LOG_LENGTH) { replyMsg += logsText.substring(logsText.length - MAX_LOG_LENGTH) + `\n------\n(日志过长，仅显示最后约 ${MAX_LOG_LENGTH} 字符)`; xinzLog.warn(`[回退] 容器 ${containerName} 的日志过长 (${logsText.length} 字符)，已截断发送`); } else { replyMsg += logsText + '\n------'; } await s.reply(replyMsg); } } catch (error) { xinzLog.error(`[回退] 发送容器 ${containerName} 的文本日志时出错:`, error); await s.reply(`尝试发送文本日志时出错: ${error.message}`); }
}

// --- 获取并显示日志 (截图或文本) ---
/**
 * 获取并显示指定容器的近期日志 (优先截图，失败则回退文本)
 * @param {object} s sender 对象
 * @param {string} containerName 容器名称
 */
async function showContainerLogs(s, containerName) {
    xinzLog.info(`准备获取容器 ${containerName} 的最近 ${LOGS_TAIL_COUNT} 行日志`);
    const logsCommand = `docker logs --tail ${LOGS_TAIL_COUNT} --timestamps ${containerName}`;
    let browser = null; // puppeteer browser instance

    try {
        await s.reply(`正在获取容器 [${containerName}] 的日志${ENABLE_LOG_SCREENSHOT ? '并生成截图' : ''}...`);
        const logsOutput = await sshExecCommand(logsCommand);
        let trimmedLogs = logsOutput.trim();
        xinzLog.info(`成功获取容器 ${containerName} 的日志，原始长度: ${trimmedLogs.length}`);
        xinzLog.debug(`容器 ${containerName} 日志内容 (部分): ${trimmedLogs.substring(0, 200)}...`);

        // 1. 优先检查二维码
        const qrHandled = await trySendQrCode(s, trimmedLogs);
        if (qrHandled) {
            xinzLog.info(`容器 ${containerName} 的日志中检测到并处理了二维码相关信息。`);
            return;
        }

        // 2. 检查日志是否为空
        if (!trimmedLogs) {
            await s.reply(`容器 [${containerName}] 近期没有日志输出。`);
            return;
        }

        // 3. 如果启用了截图功能，尝试生成截图
        if (ENABLE_LOG_SCREENSHOT && puppeteer) {
            xinzLog.info(`尝试为容器 ${containerName} 的日志生成截图...`);
            try {
                const lines = stripAnsiCodes(trimmedLogs).split('\n');
                const linesToRender = lines.slice(-SCREENSHOT_MAX_LINES);
                const logContentEscaped = escapeHtml(linesToRender.join('\n'));
                const lineCount = linesToRender.length;

                if(lineCount === 0){
                     xinzLog.warn("清理ANSI码后日志内容为空，回退到文本发送。");
                     await sendLogsAsText(s, containerName, trimmedLogs);
                     return;
                }
                xinzLog.debug(`准备渲染 ${lineCount} 行日志到图片`);

                const htmlContent = `
                <!DOCTYPE html><html><head><meta charset="UTF-8"><style>body { margin: 0; background-color: #1e1e1e; } pre { color: #d4d4d4; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 13px; line-height: 1.4; padding: 15px; white-space: pre-wrap; word-wrap: break-word; margin: 0; }</style></head><body><pre id="log-content">${logContentEscaped}</pre></body></html>`;

                // --- 配置 Puppeteer 启动选项 ---
                const launchOptions = {
                     args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--single-process'
                     ],
                     timeout: 60000 // 增加启动超时
                };
                // 如果配置了特定路径，则使用它
                if (PUPPETEER_EXECUTABLE_PATH) {
                    launchOptions.executablePath = PUPPETEER_EXECUTABLE_PATH;
                    xinzLog.debug(`使用指定的 executablePath: ${PUPPETEER_EXECUTABLE_PATH}`);
                } else {
                    xinzLog.debug("未指定 executablePath，让 Puppeteer 自动查找");
                    // 如果不指定路径，确保运行 Bncr 的用户环境能让 Puppeteer 找到浏览器
                    // 这可能需要将下载的浏览器路径添加到 PATH，或者确保下载到了 Puppeteer 默认查找的位置
                }

                browser = await puppeteer.launch(launchOptions); // 使用构造好的选项启动

                const page = await browser.newPage();
                // 增加页面加载和渲染的稳定性设置
                await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 }); // 设置合适的视口
                await page.setContent(htmlContent, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'], timeout: 30000 }); // 等待页面资源加载完成

                // 等待 pre 元素渲染完成可能更可靠
                await page.waitForSelector('#log-content', { visible: true, timeout: 10000 });
                const logElement = await page.$('#log-content');

                if (!logElement) { throw new Error("无法在页面中找到 #log-content 元素"); }

                // 截图前稍作等待，确保渲染稳定
                await page.waitForTimeout(300);

                const screenshotBuffer = await logElement.screenshot({ type: 'png', encoding: 'base64' });
                await browser.close(); browser = null; // 截图后立即关闭浏览器

                if (screenshotBuffer) {
                    xinzLog.info(`容器 ${containerName} 日志截图生成成功，准备发送 Base64 图片`);
                    let screenshotMsg = `容器 [${containerName}] 的近期日志截图 (最多 ${SCREENSHOT_MAX_LINES} 行):`;
                    if (lines.length > SCREENSHOT_MAX_LINES) { screenshotMsg += `\n(原始日志 ${lines.length} 行，已截取后 ${SCREENSHOT_MAX_LINES} 行生成图片)`; }
                    await s.reply(`${screenshotMsg}\n[CQ:image,file=base64://${screenshotBuffer}]`);
                    return; // 成功发送截图
                } else { throw new Error("logElement.screenshot 返回了空的 buffer"); }

            } catch (screenshotError) {
                xinzLog.error(`为容器 ${containerName} 生成日志截图失败:`, screenshotError);
                await s.reply(`尝试生成日志截图失败: ${screenshotError.message}\n将尝试发送文本日志...`);
                // 确保浏览器被关闭
                if (browser) { try { await browser.close(); } catch (closeErr) { xinzLog.warn("关闭失败的浏览器实例时出错:", closeErr); } browser = null; }
                // **回退到发送文本日志**
                await sendLogsAsText(s, containerName, trimmedLogs);
                return; // 回退完成
            }
        } else {
            // 4. 截图未启用或 Puppeteer 加载失败，发送文本
            xinzLog.info(`截图功能未启用或 Puppeteer 不可用，发送文本日志`);
            await sendLogsAsText(s, containerName, trimmedLogs);
        }

    } catch (error) {
        // 处理获取日志或截图过程中的顶层错误
        xinzLog.error(`处理容器 ${containerName} 日志时出错:`, error);
        await s.reply(`获取或处理容器 ${containerName} 日志失败：${error.message}`);
        // 确保浏览器被关闭
        if (browser) { try { await browser.close(); } catch (closeErr) { xinzLog.warn("在顶层错误处理中关闭浏览器实例时出错:", closeErr); } }
    }
}

if (jsonSchema && ConfigDB) { module.exports.jsonSchema = jsonSchema; }