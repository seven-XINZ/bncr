/**
 * @author xinz
 * @name 懒人菜单
 * @team xinz
 * @origin Utility
 * @version 2.6.2
 * @description 实时扫描已加载插件并生成命令菜单，消息定时自动删除。
 * @rule ^(#菜单|menu)$
 * @admin false
 * @priority 100
 * @disable false
 * @public false
 * @service false
 */

'use strict';

// Node.js built-in modules
const fs = require('fs').promises;
const path = require('path');

// --- Hardcoded Configuration ---
const MENU_CONFIG = {
    // Overall Structure
    menuHeader: '✨ Bncr 命令菜单 ✨\n┄┅┄┅┄┅┄┅┄┅┄┅┄',
    menuFooter: '┄┅┄┅┄┅┄┅┄┅┄┅┄\n{{adminNote}}', // Placeholder for admin note still used
    adminCommandNote: '提示：带 [管理员] 标记的命令仅管理员可用。',

    // Command Formatting
    commandPrefix: '- ', // Use hyphen and space as prefix
    adminSuffixText: ' [管理员]',

    // Sorting (Secondary - Primary is Regex Length)
    secondarySortBy: 'rule', // Options: 'rule', 'name', 'priority'

    // Filtering
    includeAdminInMenu: true, // Show admin commands in the menu?

    // Self-delete timer
    deleteDelaySeconds: 60, // Seconds before deleting the menu message
};
// --- End Hardcoded Configuration ---

const PLUGIN_NAME_FOR_LOG = '[菜单-自删]'; // Updated log prefix

// --- Constants ---
// **ENSURE this matches the @name tag EXACTLY**
const SELF_PLUGIN_NAME = '懒人菜单';
// **ADJUST BASE DIR IF NEEDED**
const PLUGINS_BASE_DIR = path.resolve('/bncr/BncrData/plugins');
// ---

// --- Helper: Parse Plugin Metadata ---
// (No changes needed)
function parsePluginMetadata(content) {
    const metadata = { rules: [], name: null, origin: null, description: null, admin: false, priority: 0, disable: false, service: false, adapter: false };
    const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!jsdocMatch || !jsdocMatch[1]) return null;
    const jsdocContent = jsdocMatch[1];
    const tagRegex = /@(\w+)\s+([\s\S]*?)(?=\n\s*\*?\s*@\w+\s|\s*$)/g;
    let match;
    while ((match = tagRegex.exec(jsdocContent)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2].replace(/^\s*\*\s?/, '').replace(/\n\s*\*?\s*/g, '\n').trim();
        switch (key) {
            case 'name': metadata.name = value; break;
            case 'origin': metadata.origin = value; break;
            case 'description': metadata.description = metadata.description ? metadata.description + '\n' + value : value; break;
            case 'rule': metadata.rules.push(value); break;
            case 'admin': metadata.admin = value.toLowerCase() === 'true'; break;
            case 'priority': metadata.priority = parseInt(value, 10) || 0; break;
            case 'disable': metadata.disable = value.toLowerCase() === 'true'; break;
            case 'service': metadata.service = value.toLowerCase() === 'true'; break;
            case 'adapter': metadata.adapter = value.toLowerCase() === 'true'; break;
        }
    }
    if (!metadata.name || metadata.rules.length === 0) return null;
    return metadata;
}
// ---

// --- Helper: Scan Plugins (NO CACHING) ---
// (No changes needed)
async function scanPluginsRealtime() {
    console.info(`${PLUGIN_NAME_FOR_LOG} Scanning plugins from: ${PLUGINS_BASE_DIR}`);
    const pluginMetaList = [];
    let level1Dirs;
    try {
        level1Dirs = await fs.readdir(PLUGINS_BASE_DIR, { withFileTypes: true });
    } catch (baseDirErr) {
        console.error(`${PLUGIN_NAME_FOR_LOG} CRITICAL ERROR: Could not read base plugins directory: ${PLUGINS_BASE_DIR}.`, baseDirErr);
        throw new Error(`无法读取插件根目录 (${PLUGINS_BASE_DIR})`);
    }

    for (const level1Entry of level1Dirs) {
        if (level1Entry.isDirectory()) {
            const categoryDirPath = path.join(PLUGINS_BASE_DIR, level1Entry.name);
            try {
                const level2Files = await fs.readdir(categoryDirPath, { withFileTypes: true });
                for (const level2Entry of level2Files) {
                    if (level2Entry.isFile() && level2Entry.name.endsWith('.js')) {
                        const filePath = path.join(categoryDirPath, level2Entry.name);
                        try {
                            const content = await fs.readFile(filePath, 'utf8');
                            const meta = parsePluginMetadata(content);
                            if (meta && !meta.disable && !meta.service && !meta.adapter) {
                                if (meta.name === SELF_PLUGIN_NAME) {
                                     console.debug(`${PLUGIN_NAME_FOR_LOG} Skipping self: ${filePath}`);
                                     continue;
                                }
                                pluginMetaList.push(meta);
                            }
                        } catch (readErr) { console.warn(`${PLUGIN_NAME_FOR_LOG} WARN: Could not read/parse ${filePath}: ${readErr.message}`); }
                    }
                }
            } catch (level2Err) { console.warn(`${PLUGIN_NAME_FOR_LOG} WARN: Could not read category dir ${categoryDirPath}: ${level2Err.message}`); }
        }
    }
    console.info(`${PLUGIN_NAME_FOR_LOG} Scan complete. Found ${pluginMetaList.length} valid plugins.`);
    return pluginMetaList;
}
// ---

// --- Helper: Simple Template Renderer ---
// (No changes needed)
function renderTemplate(templateString, data) {
    let rendered = templateString;
    if (typeof templateString !== 'string') return '';
    for (const key in data) {
        if (Object.hasOwnProperty.call(data, key)) {
            const value = data[key] !== null && data[key] !== undefined ? String(data[key]) : '';
             rendered = rendered.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
        }
    }
    return rendered;
}
// ---

// --- Main Plugin Logic ---
module.exports = async (sender) => {
    const userId = sender.getUserId() || 'unknown';
    const groupId = sender.getGroupId() || 'DM';

    // --- ADDED LOG MESSAGE ---
    console.info("xinz原创");
    // -----------------------

    console.info(`${PLUGIN_NAME_FOR_LOG} Triggered by User:${userId} in Group/DM:${groupId}`);

    // --- 1. Use Hardcoded Config ---
    const config = MENU_CONFIG;
    console.debug(`${PLUGIN_NAME_FOR_LOG} Using hardcoded settings.`);

    // --- 2. Load Plugin Data (ALWAYS Scan) ---
    let pluginMetaList = null;
    try {
        console.info(`${PLUGIN_NAME_FOR_LOG} Performing real-time plugin scan.`);
        pluginMetaList = await scanPluginsRealtime();
    } catch (scanError) {
        console.error(`${PLUGIN_NAME_FOR_LOG} Critical scan error:`, scanError);
        await sender.reply(`生成菜单时发生严重错误：${scanError.message}`);
        return;
    }
    if (!Array.isArray(pluginMetaList)) {
         await sender.reply("扫描插件数据时出错，未能获取列表。");
         return;
    }

    // --- 3. Filter and Extract Rules ---
    let containsAdminCommands = false;
    const ruleList = [];
    pluginMetaList.forEach(meta => {
        const isPluginAdminOnly = meta.admin === true;
        if (isPluginAdminOnly) {
            containsAdminCommands = true;
            if (!config.includeAdminInMenu) {
                return;
            }
        }
        meta.rules.forEach(rule => {
            ruleList.push({ rule, admin: isPluginAdminOnly, name: meta.name, priority: meta.priority });
        });
    });

    // --- 4. Sort Rules ---
    ruleList.sort((a, b) => {
        const lenDiff = a.rule.length - b.rule.length;
        if (lenDiff !== 0) return lenDiff;
        switch (config.secondarySortBy) {
            case 'name': return (a.name || '').localeCompare(b.name || '');
            case 'priority': return (b.priority || 0) - (a.priority || 0);
            default: return a.rule.localeCompare(b.rule);
        }
    });

    // --- 5. Generate Menu Body Lines ---
    const menuBodyLines = [];
    const numCommands = ruleList.length;
    if (numCommands === 0) {
        menuBodyLines.push("(当前没有可显示的插件命令)");
    } else {
        ruleList.forEach(item => {
            const cleanedRule = item.rule.trim().replace(/^\^/, '').replace(/\$$/, '');
            const adminSuffix = item.admin ? config.adminSuffixText : '';
            const formattedItem = `${config.commandPrefix}${cleanedRule}${adminSuffix}`.trimEnd();
            menuBodyLines.push(formattedItem);
        });
    }

    // --- 6. Assemble Final Menu ---
    const adminNoteText = containsAdminCommands && config.includeAdminInMenu ? config.adminCommandNote : '';
    const footerText = renderTemplate(config.menuFooter, { adminNote: adminNoteText });
    const headerText = renderTemplate(config.menuHeader, {});
    const finalMenu = [
        headerText,
        ...menuBodyLines,
        footerText
    ].join('\n');

    // --- 7. Reply AND Schedule Deletion ---
    let sentMessageId = null;
    try {
        sentMessageId = await sender.reply(finalMenu);
        console.info(`${PLUGIN_NAME_FOR_LOG} Menu sent (ID: ${sentMessageId}) to User:${userId} in Group/DM:${groupId}. Scheduling deletion.`);

        if (sentMessageId && config.deleteDelaySeconds > 0) {
            setTimeout(() => {
                console.info(`${PLUGIN_NAME_FOR_LOG} Attempting to delete menu message (ID: ${sentMessageId}) after ${config.deleteDelaySeconds}s.`);
                try {
                    sender.delMsg(sentMessageId);
                } catch (delError) {
                    console.error(`${PLUGIN_NAME_FOR_LOG} Error during scheduled deletion of message (ID: ${sentMessageId}):`, delError);
                }
            }, config.deleteDelaySeconds * 1000);
        } else if (config.deleteDelaySeconds <= 0) {
             console.debug(`${PLUGIN_NAME_FOR_LOG} Deletion delay is zero or negative, not scheduling deletion.`);
        } else {
             console.warn(`${PLUGIN_NAME_FOR_LOG} Did not receive a valid message ID from reply, cannot schedule deletion.`);
        }

    } catch (replyError) {
         console.error(`${PLUGIN_NAME_FOR_LOG} Error sending initial reply:`, replyError);
         try { await sender.reply("抱歉，发送菜单时遇到错误。"); } catch (e) {}
    }
};
// --- End Main Plugin Logic ---
