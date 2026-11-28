/**
 * @author xinz
 * @name 定时消息推送
 * @team xinz
 * @version 1.3.3
 * @description 根据Cron表达式定时发送多种类型内容(文本,URL内容,JSON,文件,Markdown,随机项,API调用,位置,Sticker等)到多个目标。包含详细配置说明。
 * @rule ^$-----NEVER-MATCH-----$
 * @admin false
 * @priority 50
 * @disable false
 * @public false
 * @service true
 */
'use strict';

const fs = require('fs').promises;
const path = require('path');
// Make sure mime-types is installed or handled by testModule
let mime; // Declare mime, require it after check

// --- Bncr Dependency Check & Setup ---
let BncrPluginConfig, sysMethod, ConfigDB; // Declare required tools
let axios; // To store the required axios instance
let areBncrToolsAvailable = false; // Flag to track if tools are loaded
let isConfigAvailable = false;
let areDependenciesAvailable = false; // Combined flag for external libs
let JSONPath; // For apiGetJsonPath
const PLUGIN_NAME_FOR_LOG = '[定时消息-超强版-带说明]'; // Updated log prefix

// --- Define Schema using PLAIN JAVASCRIPT OBJECT with DETAILED DESCRIPTIONS ---
// (Schema definition remains the same as v1.3.1)
const plainTaskSchema = {
    type: 'object',
    title: '定时任务设置',
    properties: {
        taskName: { type: 'string', title: '任务名称', description: '用于区分不同任务的标签。', default: '新定时任务' },
        enabled: { type: 'boolean', title: '启用任务', description: '是否启用此定时任务。', default: true },
        cronSchedule: { type: 'string', title: 'Cron 表达式', description: '例如: "0 30 8 * * *" (每天8:30)。在线生成器: https://crontab.guru/', default: '0 0 * * * *' },
        targetPlatform: { type: 'string', title: '目标平台', description: '消息要发送到的平台名称 (如 tgBot, qqBot, wxKeAImao)。必须填写准确的适配器名称。', default: '' },
        targetGroupIds: { type: 'array', title: '目标群组ID列表', description: '要发送到的群组ID。点击“新增”添加一个ID。', default: [], items: { type: 'string' } },
        targetUserIds: { type: 'array', title: '目标用户ID列表', description: '要发送到的用户ID。点击“新增”添加一个ID。', default: [], items: { type: 'string' } },
        messageType: {
            type: 'string',
            title: '消息类型',
            description: '选择要发送的消息内容的类型。\n请务必参考下方“消息内容 / 配置”字段的详细说明来填写对应的内容!',
            enum: [
                'text', 'markdown', 'randomText',
                'textUrl', 'jsonUrl', 'jsonDirect', 'csvUrl', 'xmlUrl',
                'imageUrl', 'videoUrl', 'audioUrl', 'fileUrl',
                'localFile', 'randomImageLocal', 'randomFileLocal',
                'apiGetJsonPath',
                'location', 'tgStickerId',
            ],
            default: 'text'
        },
        messageContent: {
            type: 'string',
            title: '消息内容 / 配置',
            description: '--- 请根据上方选择的“消息类型”填写下方内容 ---\n\n'
                + '**1. 简单文本类型:**\n'
                + '  - `text` (纯文本): 直接输入要发送的文本。\n'
                + '  - `markdown` (Markdown): 输入Markdown格式文本 (效果依赖适配器)。\n'
                + '  - `randomText` (随机文本): 输入多行文本，每行一个选项，发送时随机选一行。\n\n'
                + '**2. 远程内容 (URL):**\n'
                + '  - `textUrl` / `csvUrl` / `xmlUrl`: 输入URL，发送其返回的文本内容。\n'
                + '  - `jsonUrl`: 输入URL，获取JSON，格式化后作为文本发送。\n'
                + '  - `jsonDirect`: 直接输入有效的JSON字符串，格式化后发送。\n'
                + '  * (URL类型需要 `axios` 依赖)\n\n'
                + '**3. 远程媒体 (URL):**\n'
                + '  - `imageUrl`: 输入直接指向图片的URL。\n'
                + '  - `videoUrl`: 输入直接指向视频的URL。\n'
                + '  - `audioUrl`: 输入直接指向音频的URL。\n'
                + '  - `fileUrl`: 输入指向任意文件的URL (适配器需支持)。\n\n'
                + '**4. 本地文件系统:** (路径需对Bncr进程可读)\n'
                + '  - `localFile`: 输入服务器上文件的【绝对路径】。\n'
                + '  - `randomImageLocal`: 输入服务器上图片【文件夹】的绝对路径。\n'
                + '  - `randomFileLocal`: 输入服务器上任意文件【文件夹】的绝对路径。\n'
                + '  * (本地文件类型需要 `mime-types` 依赖)\n\n'
                + '**5. API 交互:**\n'
                + '  - `apiGetJsonPath`: 输入 `"API_URL||JSONPath查询表达式"`。例如: `https://api.example.com/data||$.results[0].name`。 从API获取JSON，用JSONPath提取数据后发送。\n'
                + '  * (需要 `axios` 和 `jsonpath-plus` 依赖)。\n'
                + '  * 可在下方 `API Headers` 字段配置请求头。\n\n'
                + '**6. 平台特定 (依赖适配器):**\n'
                + '  - `location`: 输入 `"纬度,经度"`，例如 `"39.9,116.4"`。\n'
                + '  - `tgStickerId`: 输入Telegram贴纸的 `file_id`。\n'
                + '  * (这些类型的显示效果完全依赖目标平台的适配器实现)\n\n'
                + '--- 详细说明结束 ---',
            format: 'textarea',
            default: '这是一条定时消息！'
            },
        apiHeaders: {
             type: 'string',
             title: '[可选] API Headers (JSON)',
             description: '为 `textUrl`, `jsonUrl`, `apiGetJsonPath` 等URL类型提供 Headers (输入标准JSON格式字符串, 如 `{"Authorization": "Bearer YOUR_KEY"}` )。',
             format: 'textarea',
             default: '{}'
        }
    },
    required: ['taskName', 'cronSchedule', 'targetPlatform', 'messageType', 'messageContent']
};

const plainMainSchema = {
    type: 'object',
    properties: {
        tasks: {
            type: 'array',
            title: '定时任务列表',
            description: '管理您的定时消息任务。点击“新增”来添加一个任务配置。',
            default: [],
            items: plainTaskSchema // Reference the detailed task schema
        }
    }
};
// --- End Schema Definition ---

try {
    // --- Step 1: Access Bncr tools ---
    if (typeof global.BncrPluginConfig !== 'undefined' &&
        typeof global.sysMethod !== 'undefined') {

        BncrPluginConfig = global.BncrPluginConfig;
        sysMethod = global.sysMethod;
        areBncrToolsAvailable = true;
        console.info(`${PLUGIN_NAME_FOR_LOG} Found Bncr tools (BncrPluginConfig, sysMethod) globally.`);

        // --- Step 2: Instantiate Config DB ---
        ConfigDB = new BncrPluginConfig(plainMainSchema);
        isConfigAvailable = true;
        console.info(`${PLUGIN_NAME_FOR_LOG} Configuration UI setup successful using plain schema.`);

    } else {
        let missing = [];
        if (typeof global.BncrPluginConfig === 'undefined') missing.push('BncrPluginConfig');
        if (typeof global.sysMethod === 'undefined') missing.push('sysMethod');
        throw new Error(`Required Bncr tools (${missing.join(', ')}) not found in global scope.`);
    }

} catch (e) {
    console.error(`${PLUGIN_NAME_FOR_LOG} FATAL: Failed during initialization. Plugin will not run. Error:`, e);
    module.exports = () => { console.error(`${PLUGIN_NAME_FOR_LOG} Service disabled due to initialization failure.`); };
    return;
}
// --- End Bncr Dependency Check & Setup ---


// --- Main Service Logic ---
module.exports = async () => {
    // --- ADDED LOG MESSAGE ---
    console.info("xinz原创");
    // -----------------------

    if (!areBncrToolsAvailable || !isConfigAvailable || !sysMethod || !ConfigDB) {
        console.error(`${PLUGIN_NAME_FOR_LOG} Bncr tools or Configuration system not properly initialized. Service cannot start.`);
        return;
    }

    console.info(`${PLUGIN_NAME_FOR_LOG} Service starting... Setting up scheduled tasks.`);
    // console.info("xinz原创"); // Original position - moved to top for immediate logging

    // --- Dependency Installation Check ---
    const requiredDeps = ['axios', 'mime-types', 'jsonpath-plus'];
    try {
        await sysMethod.testModule(requiredDeps, { install: true, outConsole: false });
        axios = require('axios');
        mime = require('mime-types');
        JSONPath = require('jsonpath-plus').JSONPath;
        areDependenciesAvailable = true;
        console.info(`${PLUGIN_NAME_FOR_LOG} Dependencies checked/installed (${requiredDeps.join(', ')}).`);
    } catch (depError) {
        console.error(`${PLUGIN_NAME_FOR_LOG} ERROR: Failed to check/install dependencies. Some tasks might fail. Missing: ${depError.message || 'Unknown'}`, depError);
        areDependenciesAvailable = false;
    }
    // ---

    // --- Load Configuration and Register Cron Jobs ---
    let config;
    try {
        await ConfigDB.get();
        config = ConfigDB.userConfig || { tasks: [] };
        if (!config.tasks || !Array.isArray(config.tasks)) {
            console.warn(`${PLUGIN_NAME_FOR_LOG} Loaded configuration invalid or empty. No tasks scheduled.`);
            config.tasks = [];
        }
    } catch (configError) {
        console.error(`${PLUGIN_NAME_FOR_LOG} Error loading configuration:`, configError);
        return;
    }

    let registeredCount = 0;
    if (config.tasks.length === 0) {
        console.info(`${PLUGIN_NAME_FOR_LOG} No tasks found in configuration.`);
    }

    for (const task of config.tasks) {
        // IIAFE for scoping
        (async (currentTask) => {
             if (!currentTask.enabled) {
                console.debug(`${PLUGIN_NAME_FOR_LOG} Skipping disabled task: "${currentTask.taskName || 'Unnamed Task'}"`);
                return;
            }

            // --- Basic Validation ---
            if (!currentTask.cronSchedule || !sysMethod.cron.isCron(currentTask.cronSchedule)) { console.error(`${PLUGIN_NAME_FOR_LOG} Invalid cron for ${currentTask.taskName}.`); return; }
            if (!currentTask.targetPlatform) { console.error(`${PLUGIN_NAME_FOR_LOG} Missing platform for ${currentTask.taskName}.`); return; }
            if ((!currentTask.targetGroupIds || currentTask.targetGroupIds.length === 0) && (!currentTask.targetUserIds || currentTask.targetUserIds.length === 0)) { console.warn(`${PLUGIN_NAME_FOR_LOG} No targets for ${currentTask.taskName}.`); return; }
            if (!currentTask.messageType || !currentTask.messageContent) { console.error(`${PLUGIN_NAME_FOR_LOG} Missing type/content for ${currentTask.taskName}.`); return; }
            // --- End Validation ---

            // Register the cron job
            try {
                sysMethod.cron.newCron(currentTask.cronSchedule, async () => {
                    const taskName = currentTask.taskName || 'Unnamed Task';
                    console.info(`${PLUGIN_NAME_FOR_LOG} Executing task: "${taskName}"`);

                    let messageBase = { type: 'text', msg: '', path: null };
                    let hasContent = false;

                    try {
                        // --- Message Content Generation Logic ---
                        // (The logic from version 1.3.0/1.3.1 remains the same)
                        // ... (switch statement for all messageTypes) ...
                        const contentInput = currentTask.messageContent;
                        const headersInput = currentTask.apiHeaders || '{}';
                        let apiHeaders = {};
                        try { apiHeaders = JSON.parse(headersInput); if (typeof apiHeaders !== 'object' || Array.isArray(apiHeaders)) apiHeaders = {}; }
                        catch (headerParseError) { console.warn(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Cannot parse API Headers JSON, using empty. Err: ${headerParseError.message}`); apiHeaders = {}; }

                        switch (currentTask.messageType) {
                             case 'text': messageBase.msg = contentInput; messageBase.type = 'text'; break;
                             case 'markdown': messageBase.msg = contentInput; messageBase.type = 'markdown'; break;
                             case 'randomText':
                                const lines = contentInput.split('\n').map(l => l.trim()).filter(l => l);
                                if (!lines.length) throw new Error("No lines for randomText.");
                                messageBase.msg = lines[Math.floor(Math.random() * lines.length)]; messageBase.type = 'text'; break;
                             case 'textUrl': case 'csvUrl': case 'xmlUrl':
                                if (!areDependenciesAvailable || !axios) throw new Error("axios required.");
                                console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Fetching Text URL ${contentInput}`);
                                const textResponse = await axios.get(contentInput, { timeout: 15000, headers: apiHeaders });
                                messageBase.msg = String(textResponse.data); messageBase.type = 'text'; break;
                             case 'jsonUrl':
                                if (!areDependenciesAvailable || !axios) throw new Error("axios required.");
                                console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Fetching JSON URL ${contentInput}`);
                                const jsonResponse = await axios.get(contentInput, { timeout: 15000, headers: apiHeaders });
                                messageBase.msg = JSON.stringify(jsonResponse.data, null, 2); messageBase.type = 'text'; break;
                             case 'jsonDirect':
                                try { messageBase.msg = JSON.stringify(JSON.parse(contentInput), null, 2); messageBase.type = 'text'; }
                                catch (jsonParseError) { throw new Error(`Invalid JSON content: ${jsonParseError.message}`); } break;
                             case 'apiGetJsonPath':
                                if (!areDependenciesAvailable || !axios || !JSONPath) throw new Error("axios, jsonpath-plus required.");
                                const parts = contentInput.split('||'); const apiUrl = parts[0]?.trim(); const jsonPathQuery = parts[1]?.trim();
                                if (!apiUrl || !jsonPathQuery) throw new Error("Invalid format: Expected 'URL||JSONPathQuery'.");
                                console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Fetching API ${apiUrl} for JSONPath`);
                                const apiResponse = await axios.get(apiUrl, { timeout: 15000, headers: apiHeaders });
                                console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Applying JSONPath "${jsonPathQuery}"`);
                                const results = JSONPath({ path: jsonPathQuery, json: apiResponse.data });
                                if (!results || results.length === 0) { messageBase.msg = `(API OK, JSONPath "${jsonPathQuery}" found no results)`; }
                                else if (results.length === 1) { messageBase.msg = (typeof results[0] === 'object') ? JSON.stringify(results[0], null, 2) : String(results[0]); }
                                else { messageBase.msg = JSON.stringify(results, null, 2); }
                                messageBase.type = 'text'; break;
                             case 'imageUrl': messageBase.type = 'image'; messageBase.path = contentInput; messageBase.msg = `图片`; break;
                             case 'videoUrl': messageBase.type = 'video'; messageBase.path = contentInput; messageBase.msg = `视频`; break;
                             case 'audioUrl': messageBase.type = 'audio'; messageBase.path = contentInput; messageBase.msg = `音频`; break;
                             case 'fileUrl': messageBase.type = 'file'; messageBase.path = contentInput; messageBase.msg = `文件: ${contentInput.substring(contentInput.lastIndexOf('/') + 1)}`; break;
                             case 'localFile':
                                if (!areDependenciesAvailable || !mime) throw new Error("mime-types required.");
                                const singleFilePath = path.resolve(contentInput); console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Accessing file ${singleFilePath}`);
                                await fs.access(singleFilePath, fs.constants.R_OK); const singleFileMime = mime.lookup(singleFilePath) || 'application/octet-stream';
                                messageBase.path = singleFilePath; messageBase.msg = `定时文件: ${path.basename(singleFilePath)}`;
                                if (singleFileMime.startsWith('image/')) messageBase.type = 'image'; else if (singleFileMime.startsWith('video/')) messageBase.type = 'video';
                                else if (singleFileMime.startsWith('audio/')) messageBase.type = 'audio'; else messageBase.type = 'file'; break;
                             case 'randomImageLocal': case 'randomFileLocal':
                                if (!areDependenciesAvailable || !mime) throw new Error("mime-types required.");
                                const folderPath = path.resolve(contentInput); console.debug(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Reading folder ${folderPath}`);
                                let files; try { files = await fs.readdir(folderPath); } catch (dirReadError) { throw new Error(`Cannot read folder "${folderPath}": ${dirReadError.message}`); }
                                let candidateFiles = files; if (currentTask.messageType === 'randomImageLocal') { const imgExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']; candidateFiles = files.filter(f => imgExt.includes(path.extname(f).toLowerCase())); }
                                if (candidateFiles.length === 0) { throw new Error(`No suitable files in folder "${folderPath}" for ${currentTask.messageType}.`); }
                                const randomFile = candidateFiles[Math.floor(Math.random() * candidateFiles.length)]; const randomFilePath = path.join(folderPath, randomFile);
                                const randomFileMime = mime.lookup(randomFilePath) || 'application/octet-stream'; messageBase.path = randomFilePath; messageBase.msg = `随机定时文件: ${randomFile}`;
                                if (randomFileMime.startsWith('image/')) messageBase.type = 'image'; else if (randomFileMime.startsWith('video/')) messageBase.type = 'video';
                                else if (randomFileMime.startsWith('audio/')) messageBase.type = 'audio'; else messageBase.type = 'file'; break;
                             case 'location':
                                const coords = contentInput.split(','); const lat = parseFloat(coords[0]?.trim()); const lon = parseFloat(coords[1]?.trim());
                                if (isNaN(lat) || isNaN(lon)) throw new Error("Invalid location: Expected 'latitude,longitude'.");
                                messageBase.type = 'location'; messageBase.msg = `${lat},${lon}`; break;
                             case 'tgStickerId':
                                messageBase.type = 'sticker'; messageBase.msg = contentInput.trim(); break;
                             default: throw new Error(`Unsupported messageType: ${currentTask.messageType}`);
                        }


                        hasContent = !!(messageBase.msg || messageBase.path);

                    } catch (contentGenError) {
                        console.error(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Error generating message content:`, contentGenError.message || contentGenError);
                        return; // Stop this execution
                    }

                    // --- Send to Multiple Targets ---
                    if (!hasContent) { console.warn(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": No content generated.`); return; }

                    const platform = currentTask.targetPlatform;
                    const sendMessage = async (targetType, targetId) => {
                         if (!targetId) return;
                         const pushInfo = { ...messageBase, platform: platform };
                         if (targetType === 'group') pushInfo.groupId = targetId.trim();
                         else if (targetType === 'user') pushInfo.userId = targetId.trim();
                         else return;

                         const finalPushInfo = Object.entries(pushInfo).reduce((acc, [key, value]) => { if (key === 'type' || key === 'msg' || (value !== null && value !== undefined && value !== '')) acc[key] = value; return acc; }, {});

                         try {
                             console.info(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Pushing type '${finalPushInfo.type}' to ${targetType} ${targetId} on ${platform}`);
                             await sysMethod.push(finalPushInfo);
                         } catch (pushError) { console.error(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Failed pushing to ${targetType} ${targetId} on ${platform}:`, pushError.message || pushError); }
                     };

                    const groupPromises = (currentTask.targetGroupIds || []).map(id => sendMessage('group', id));
                    const userPromises = (currentTask.targetUserIds || []).map(id => sendMessage('user', id));

                    await Promise.all([...groupPromises, ...userPromises]);
                    console.info(`${PLUGIN_NAME_FOR_LOG} Task "${taskName}": Finished sending attempt.`);
                    // --- End Send to Multiple Targets ---

                }); // End of cron callback

                registeredCount++;
                console.info(`${PLUGIN_NAME_FOR_LOG} Registered task "${currentTask.taskName || 'Unnamed Task'}" with schedule: ${currentTask.cronSchedule}`);

            } catch (cronRegError) {
                console.error(`${PLUGIN_NAME_FOR_LOG} CRITICAL ERROR registering cron job for task "${currentTask.taskName || 'Unnamed Task'}":`, cronRegError);
            }
        })(task); // IIAFE
    } // End of task loop

    console.info(`${PLUGIN_NAME_FOR_LOG} Service finished setup. Registered ${registeredCount} task(s).`);

}; // End of module.exports service function
