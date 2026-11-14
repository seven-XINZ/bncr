/**
 * @author seven (modified by xinz)
 * @name SSH终端管家Pro
 * @team xinz
 * @version 2.4.0
 * @description 智能SSH管理 (简化提示, 结果不截断, 5s/60s删除)
 * @rule ^(ssh|SSH)$
 * @priority 10000
 * @admin true
 * @public false
 * @disable false
 * @service false
 */

/*
 * 依赖说明: ssh2
 * !! 本插件不再自动安装依赖 !! npm install ssh2
 * 配置说明: 请在 Bncr Web UI 配置 SSH 设备列表。
 */

// --- 引入/声明全局对象和依赖 ---
let Client;
const { exec } = require('child_process');

// --- 常量 ---
const SHORT_DELETE_DELAY_MS = 5 * 1000; // 短提示删除时间 (5秒)
const LONG_DELETE_DELAY_MS = 60 * 1000; // 结果/错误删除时间 (60秒)
const logPrefix = "[SSH终端]";

// --- 超时配置 (从设置读取) ---
const DEFAULT_TIMEOUTS = { /* ...不变... */
    selection: 30, command: 120, connect: 10000
};

// --- 插件设置界面 Schema 定义 ---
let jsonSchema = null; let ConfigDB = null;
try { /* ...不变... */
    if (typeof BncrCreateSchema !== 'undefined' && typeof BncrPluginConfig !== 'undefined') {
        const BCS = BncrCreateSchema;
        jsonSchema = BCS.object({
            devices: BCS.array(BCS.object({ name: BCS.string().setTitle('设备名称').setDefault('新设备'), host: BCS.string().setTitle('主机地址').setDefault(''), port: BCS.number().setTitle('端口').setDefault(22), username: BCS.string().setTitle('用户名').setDefault('root'), password: BCS.string().setTitle('密码').setDefault(''), icon: BCS.string().setTitle('图标 (可选)').setDefault('⚙️') })).setTitle('SSH 设备列表').setDefault([]),
            selectionTimeout: BCS.number().setTitle('设备选择超时(秒)').setDefault(DEFAULT_TIMEOUTS.selection), commandTimeout: BCS.number().setTitle('命令输入超时(秒)').setDefault(DEFAULT_TIMEOUTS.command), connectTimeoutMs: BCS.number().setTitle('连接超时(毫秒)').setDefault(DEFAULT_TIMEOUTS.connect) });
        ConfigDB = new BncrPluginConfig(jsonSchema); console.log(`${logPrefix} 插件设置 Schema 和 ConfigDB 已初始化。`);
    } else { console.error(`${logPrefix} Bncr 环境缺少 BncrCreateSchema 或 BncrPluginConfig。`); }
} catch (schemaError) { console.error(`${logPrefix} 初始化 Schema 或 ConfigDB 时出错:`, schemaError); }

// --- 辅助函数：发送消息并设置定时删除 ---
// *** Modified: Added specific delay parameter ***
async function replyAndDelete(sender, content, delayMs = LONG_DELETE_DELAY_MS, logPrefix = "[SSH终端]") {
    let messageId = null;
    try {
        const replyResult = await sender.reply(content);
        if (replyResult && typeof replyResult === 'string') messageId = replyResult;
        else if (replyResult?.message_id) messageId = replyResult.message_id;
        else if (replyResult?.id) messageId = replyResult.id;
        else if (replyResult?.data?.message_id) messageId = replyResult.data.message_id;

        if (messageId && delayMs > 0) {
            // console.log(`${logPrefix} 消息已发送 (ID: ${messageId}), 设置 ${delayMs / 1000}s 后删除。`);
            setTimeout(async () => { try { await sender.delMsg(messageId); } catch (delErr) { /* 静默 */ } }, delayMs);
        } else if (!messageId) { console.warn(`${logPrefix} 发送消息后未能获取到可用的消息 ID。`); }
        return messageId;
    } catch (replyErr) { console.error(`${logPrefix} 发送消息时出错:`, replyErr); return null; }
}

// ========== 插件主逻辑 ==========
const main = async (s) => {
    // --- 加载依赖 ---
    try {
        await sysMethod.testModule(['ssh2'], { install: true });
        Client = require('ssh2').Client; console.log(`${logPrefix} 依赖 ssh2 加载成功。`); }
    catch (err) { /* ...错误处理 (提示手动安装, 使用长延迟)... */
        console.error(`${logPrefix} 加载依赖 ssh2 失败:`, err);
        if (err.code === 'MODULE_NOT_FOUND') { await replyAndDelete(s, `❌ 插件缺少依赖: ssh2\n请进入 Bncr 容器执行:\n\`npm install ssh2\`\n然后重启 Bncr 或重载插件。`, logPrefix); } // Default 60s
        else { await replyAndDelete(s, `❌ 加载 ssh2 依赖时出错: ${err.message}`, logPrefix); } // Default 60s
        return;
    }

    // --- 获取配置 ---
    let CDB = {}; let configuredDevices = []; let selectionTimeout = DEFAULT_TIMEOUTS.selection;
    let commandTimeout = DEFAULT_TIMEOUTS.command; let connectTimeoutMs = DEFAULT_TIMEOUTS.connect;
    if (!ConfigDB) { await replyAndDelete(s, '❌ 插件配置系统未初始化。', logPrefix); return; } // Default 60s
    try {
        await ConfigDB.get(); CDB = ConfigDB.userConfig || {};
        if (!CDB.devices || !Array.isArray(CDB.devices) || CDB.devices.length === 0) { await replyAndDelete(s, 'ℹ️ 请先配置 SSH 设备。', logPrefix); return; } // Default 60s
        configuredDevices = CDB.devices.filter(d => d.host && d.username && d.password);
        if (configuredDevices.length === 0) { await replyAndDelete(s, '⚠️ 配置中未找到有效的 SSH 设备。', logPrefix); return; } // Default 60s
        selectionTimeout = CDB.selectionTimeout || DEFAULT_TIMEOUTS.selection;
        commandTimeout = CDB.commandTimeout || DEFAULT_TIMEOUTS.command;
        connectTimeoutMs = CDB.connectTimeoutMs || DEFAULT_TIMEOUTS.connect;
        console.log(`${logPrefix} 加载了 ${configuredDevices.length} 个有效设备配置。`);
    } catch (dbErr) { await replyAndDelete(s, `❌ 获取插件配置失败: ${dbErr.message}`, logPrefix); return; } // Default 60s

    // --- 主流程 ---
    try {
        const session = { startTime: Date.now(), commandCount: 0, lastActivity: null };
        const device = await showDeviceMenu(s, configuredDevices, selectionTimeout);
        await verifyConnection(s, device, connectTimeoutMs, Client);
        const conn = await createConnection(s, device, connectTimeoutMs, Client);
        await commandLoop(s, device, conn, session, commandTimeout, Client);
    } catch (error) {
        if (['USER_EXIT', 'HOST_OFFLINE', 'AUTH_FAILURE', 'CONNECTION_TIMEOUT', 'CONNECTION_FAILED', 'INVALID_DEVICE', 'RETURN_MENU'].includes(error.message.split(':')[0])) { handleSystemError(s, error); } // Uses replyAndDelete
        else if (error.message !== 'RETURN_MENU_NO_MSG') { console.error(`${logPrefix} 未捕获的错误:`, error); await replyAndDelete(s, `❌ 意外错误: ${error.message}`, logPrefix); } // Default 60s
    }
};

// ========== 核心功能模块 ==========
async function showDeviceMenu(s, devices, timeout) {
    const menu = [ /* ...菜单内容不变... */
        "🔧 SSH 设备列表", "────────────────",
        ...devices.map((d, i) => `${i+1}. ${d.icon || '⚙️'} ${d.name}`), // Simpler display
        "────────────────", `输入序号选择 (q退出):`
    ].join('\n');
    const choice = await getInput(s, menu, timeout, '选择设备');
    if (!choice || choice.toLowerCase() === 'q') throw new Error('USER_EXIT');
    const index = parseInt(choice) - 1; validateDeviceIndex(index, devices.length); return devices[index];
}

async function commandLoop(s, device, conn, session, timeout, Client) {
    try {
        while (true) {
            session.lastActivity = Date.now();
            const command = await getCommandInput(s, device, session, timeout);
            if (!command) { await replyAndDelete(s, `⏳ 命令输入超时，断开连接。`, logPrefix); break; } // Default 60s
            if (command.toLowerCase() === 'exit') { await showExitMessage(s, device, session); break; } // Uses replyAndDelete (60s)
            if (command === 'menu') { await showReturnMenuMessage(s); throw new Error('RETURN_MENU_NO_MSG'); } // Uses replyAndDelete (5s)
            const output = await executeCommand(conn, command, Client);
            session.commandCount++;
            await showCommandResult(s, output); // Uses replyAndDelete (60s)
        }
    } finally { console.log(`${logPrefix} 断开 SSH 连接: ${device.host}`); conn.end(); }
}

// ========== SSH连接管理 ==========
async function verifyConnection(s, device, timeout, Client) {
    // Send simple verifying message with short delay
    await replyAndDelete(s, `🔍 正在验证 ${device.icon || '⚙️'} ${device.name}...`, SHORT_DELETE_DELAY_MS, logPrefix);

    let hostOnline = false; let authValid = false; let finalMsg = '';

    try { hostOnline = await pingHost(device.host); } catch {}
    if (hostOnline) {
        try { authValid = await testCredentials(device, timeout, Client); } catch {}
        if (!authValid) { finalMsg = `🔑 ${device.name} 认证失败。`; throw new Error('AUTH_FAILURE'); }
        // Auth successful, no persistent message needed here, createConnection will show success.
    } else {
        finalMsg = `🌐 ${device.name} 主机不可达。`; throw new Error('HOST_OFFLINE');
    }
    // Only reach here if host is online and auth is valid
}


function createConnection(s, device, timeout, Client) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const connOptions = { /* ...不变... */
             host: device.host, port: device.port || 22, username: device.username,
             password: device.password, readyTimeout: timeout
        };
        // Send connecting message with short delay
        replyAndDelete(s, `⚙️ 正在连接 ${device.icon || ''} ${device.name}...`, SHORT_DELETE_DELAY_MS, logPrefix);

        conn.on('ready', () => {
            // Send established message, keep it for the session (no auto-delete here)
            // The command prompt will overwrite this visually.
            s.reply(`✅ 已连接到 ${device.icon || ''} ${device.name}`);
            resolve(conn);
        }).on('error', err => {
            if (err.message.includes('Timed out') || err.level === 'client-timeout') reject(new Error('CONNECTION_TIMEOUT'));
            else reject(new Error(`CONNECTION_FAILED: ${err.message}`));
        }).connect(connOptions);
    });
}

// ========== 交互增强模块 ==========
async function showExitMessage(s, device, session) {
    const duration = formatDuration(Date.now() - session.startTime);
    // Simplified exit message
    const stats = `🛑 与 ${device.icon || ''} ${device.name} 断开连接。\n(会话: ${duration} | ${session.commandCount}条命令)`;
    await replyAndDelete(s, stats, logPrefix); // Default 60s
}

async function showReturnMenuMessage(s) {
    const msg = `🔙 返回主菜单...`; // Simpler message
    await replyAndDelete(s, msg, SHORT_DELETE_DELAY_MS, logPrefix); // 5 seconds
}

// *** Modified: Remove truncation, use long delay ***
async function showCommandResult(s, output) {
    const fullOutput = output || '(无输出)'; // Handle empty output
    // Keep result message longer
    const result = `\`\`\`\n${fullOutput}\n\`\`\``; // Use markdown code block for better formatting
    await replyAndDelete(s, result, logPrefix); // Default 60s
}

// ========== 工具函数模块 ==========
function formatDuration(ms) { /* ...不变... */
    if(isNaN(ms) || ms <= 0) return '0s'; const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.round((ms % 60000) / 1000); const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean); return parts.length > 0 ? parts.join(' ') : '0s';
}
function formatTime(timestamp) { /* ...不变... */
    if(!timestamp) return null; try { return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false }); } catch { return null; }
}

// *** Modified getInput to use replyAndDelete for prompt ***
async function getInput(s, prompt, timeoutSeconds, promptType = "通用") {
    // Send the prompt message using replyAndDelete (will auto-delete after default 60s)
    await replyAndDelete(s, prompt, undefined, `${logPrefix}[${promptType}提示]`);

    let response = null; let responseMsgId = null; let responseText = '';
    try {
        response = await s.waitInput(() => {}, timeoutSeconds * 1000);
        if (response) {
             responseText = response.getMsg()?.trim() || '';
             responseMsgId = response.getMsgId();
             // Immediately delete the USER'S response message
             if(responseMsgId) await s.delMsg(responseMsgId).catch(()=>{});
        } else {
             console.log(`${logPrefix}[${promptType}输入] 超时 (${timeoutSeconds}s)`);
        }
    } catch (waitError) { console.error(`${logPrefix}[${promptType}输入] waitInput 出错:`, waitError); }
    // Prompt deletion is handled by replyAndDelete now
    return responseText;
}

async function getCommandInput(s, device, session, timeout) {
    // Simplified prompt
    return await getInput(s,
        `SSH@${device.name}> 请输入命令: (exit/menu)`,
        timeout, '命令'
    );
}

// ========== 系统验证模块 ==========
async function pingHost(host) { /* ...不变... */
     return new Promise((resolve) => { const c = new AbortController(); const t = setTimeout(() => { c.abort(); resolve(false); }, 3000); exec(`ping -c 1 -W 1 ${host}`, { signal: c.signal }, (e) => { clearTimeout(t); resolve(!e); }); }).catch(() => false);
}
async function testCredentials(device, timeout, Client) { /* ...不变... */
     return new Promise((r) => { const c = new Client(); const o = { host: device.host, port: device.port || 22, username: device.username, password: device.password, readyTimeout: timeout }; c.once('ready', () => { c.end(); r(true); }); c.once('error', () => r(false)); c.connect(o); });
}
function validateDeviceIndex(index, count) { /* ...不变... */
    if (isNaN(index) || index < 0 || index >= count) { throw new Error('INVALID_DEVICE'); }
}

// ========== 错误处理模块 ==========
function handleSystemError(s, error) {
    const errorCode = error.message.split(':')[0] || 'UNKNOWN';
    const errorConfig = { /* ...不变... */
        'USER_EXIT': { title: '👋 操作取消', content: '用户主动退出。' }, 'HOST_OFFLINE': { title: '🌐 连接失败', content: '目标主机不可达。' }, 'AUTH_FAILURE': { title: '🔑 认证失败', content: '用户名或密码错误。' }, 'CONNECTION_TIMEOUT': { title: '⏰ 连接超时', content: `连接超时 (${(ConfigDB?.userConfig?.connectTimeoutMs || DEFAULT_TIMEOUTS.connect) / 1000}秒)。` }, 'CONNECTION_FAILED': { title: '🔗 连接错误', content: `无法建立 SSH 连接: ${error.message.split(': ')[1] || '未知'}` }, 'INVALID_DEVICE': { title: '🔢 无效选择', content: '输入的设备序号无效。' },
    };
    const { title = '⚠️ 系统异常', content = error.message } = errorConfig[errorCode] || {};
    // Simplified error message format
    const msg = `❗ ${title}: ${content}`;
    replyAndDelete(s, msg, logPrefix); // Use default 60s deletion for errors
}

// ========== 命令执行模块 ==========
async function executeCommand(conn, command, Client) { /* ...不变... */
    return new Promise((resolve, reject) => { let output = ''; conn.exec(command, (err, stream) => { if (err) { console.error(`${logPrefix} conn.exec 错误:`, err); return reject(new Error(`命令准备失败: ${err.message}`)); } stream.on('data', data => { output += data.toString('utf8'); }).on('close', () => resolve(output)).stderr.on('data', data => { const e = data.toString('utf8').trim(); if (e) output += `\n[ERROR] ${e}`; }).on('end', () => {}); }); });
}

// --- 导出 ---
module.exports = main;
if (jsonSchema && ConfigDB) { module.exports.jsonSchema = jsonSchema; }
