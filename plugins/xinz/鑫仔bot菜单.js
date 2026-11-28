/**
 * @author xinz
 * @name 鑫仔bot菜单
 * @team xinz
 * @origin Utility
 * @description 实时扫描插件，按分类分页生成命令菜单，支持关键词筛选、命令精简与自动撤回。
 * @rule ^(#菜单|menu)(?:\s+([\s\S]+))?$
 * @admin false
 * @priority 100
 * @disable false
 * @public false
 * @service false
 * @classification ["工具"]
 * @version 3.1.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

const SELF_PLUGIN_NAME = '鑫仔bot菜单';
const LOG_PREFIX = '[鑫仔bot菜单]';
const DEFAULT_PLUGIN_DIR = '/bncr/BncrData/plugins';

// 默认配置，同时作为面板 Schema 的默认值
const MENU_CONFIG = {
    menuHeader: '✨ 鑫仔bot菜单 ✨\n┄┅┄┅┄┅┄┅┄┅┄┅┄',
    menuFooter: '┄┅┄┅┄┅┄┅┄┅┄┅┄\n{{stats}}\n{{pageInfo}}\n{{adminNote}}',
    adminCommandNote: '提示：带 [管理员] 标记的命令仅管理员可用。',
    categoryOrder: 'xinz,实用工具,效率工具,群管理,娱乐,数据统计,官方插件',
    commandPrefix: '- ',
    adminSuffixText: ' [管理员]',
    includeAdminInMenu: true,
    groupByCategory: true,
    showDescription: false,
    pageSize: 10,
    maxRulesPerPlugin: 8,
    deleteDelaySeconds: 60,
};

const jsonSchema = BncrCreateSchema.object({
    menuHeader: BncrCreateSchema.string().setTitle('菜单头部').setDescription('支持 {{stats}}、{{pageInfo}} 占位符').setDefault(MENU_CONFIG.menuHeader),
    menuFooter: BncrCreateSchema.string().setTitle('菜单尾部').setDescription('支持 {{stats}}、{{pageInfo}}、{{adminNote}} 占位符').setDefault(MENU_CONFIG.menuFooter),
    adminCommandNote: BncrCreateSchema.string().setTitle('管理员命令提示').setDefault(MENU_CONFIG.adminCommandNote),
    categoryOrder: BncrCreateSchema.string().setTitle('分类排序').setDescription('逗号分隔的分类目录名，未列出的分类排在后面').setDefault(MENU_CONFIG.categoryOrder),
    commandPrefix: BncrCreateSchema.string().setTitle('命令前缀').setDefault(MENU_CONFIG.commandPrefix),
    adminSuffixText: BncrCreateSchema.string().setTitle('管理员后缀').setDefault(MENU_CONFIG.adminSuffixText),
    includeAdminInMenu: BncrCreateSchema.boolean().setTitle('显示管理员命令').setDefault(MENU_CONFIG.includeAdminInMenu),
    groupByCategory: BncrCreateSchema.boolean().setTitle('按分类分组').setDefault(MENU_CONFIG.groupByCategory),
    showDescription: BncrCreateSchema.boolean().setTitle('显示插件描述').setDefault(MENU_CONFIG.showDescription),
    pageSize: BncrCreateSchema.number().setTitle('每页插件数').setDescription('建议 6-15，避免消息过长').setDefault(MENU_CONFIG.pageSize),
    maxRulesPerPlugin: BncrCreateSchema.number().setTitle('每插件最多命令数').setDescription('0 表示不限制，超出部分折叠为“另有 N 条”').setDefault(MENU_CONFIG.maxRulesPerPlugin),
    deleteDelaySeconds: BncrCreateSchema.number().setTitle('自动撤回秒数').setDescription('0 表示不撤回').setDefault(MENU_CONFIG.deleteDelaySeconds),
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

function applyUserConfig(userConfig) {
    if (!userConfig || typeof userConfig !== 'object') return;

    const config = MENU_CONFIG;
    for (const key of Object.keys(config)) {
        const value = userConfig[key];
        if (value === undefined || value === null || value === '') continue;

        if (typeof config[key] === 'number') {
            const numberValue = Number(value);
            if (Number.isFinite(numberValue)) config[key] = numberValue;
        } else if (typeof config[key] === 'boolean') {
            config[key] = value === true || value === 'true' || value === 1 || value === '1';
        } else {
            config[key] = String(value);
        }
    }

    config.pageSize = Math.max(1, Math.min(30, Math.round(config.pageSize) || 10));
    config.maxRulesPerPlugin = Math.max(0, Math.round(config.maxRulesPerPlugin) || 0);
    config.deleteDelaySeconds = Math.max(0, Math.round(config.deleteDelaySeconds) || 0);
}

function parsePluginMetadata(content) {
    const metadata = {
        rules: [],
        name: null,
        description: null,
        admin: false,
        priority: 0,
        disable: false,
        service: false,
        adapter: false,
    };

    const jsdocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!jsdocMatch || !jsdocMatch[1]) return null;
    const jsdocContent = jsdocMatch[1];
    const tagRegex = /@(\w+)\s+([\s\S]*?)(?=\n\s*\*?\s*@\w+\s|\s*$)/g;
    let match;

    while ((match = tagRegex.exec(jsdocContent)) !== null) {
        const key = match[1].toLowerCase();
        const value = match[2]
            .replace(/^\s*\*\s?/, '')
            .replace(/\n\s*\*?\s*/g, '\n')
            .trim();

        switch (key) {
            case 'name':
                metadata.name = value;
                break;
            case 'description':
                metadata.description = metadata.description
                    ? `${metadata.description} ${value}`
                    : value;
                break;
            case 'rule':
                if (value && !metadata.rules.includes(value)) metadata.rules.push(value);
                break;
            case 'admin':
                metadata.admin = value.toLowerCase() === 'true';
                break;
            case 'priority':
                metadata.priority = parseInt(value, 10) || 0;
                break;
            case 'disable':
                metadata.disable = value.toLowerCase() === 'true';
                break;
            case 'service':
                metadata.service = value.toLowerCase() === 'true';
                break;
            case 'adapter':
                metadata.adapter = value.toLowerCase() === 'true';
                break;
            default:
                break;
        }
    }

    if (!metadata.name || metadata.rules.length === 0) return null;
    return metadata;
}

function normalizeOneLine(text, maxLength = 120) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function stripOuterGroup(text) {
    if (!text.startsWith('(') || !text.endsWith(')')) return text;

    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '(') depth += 1;
        if (text[index] === ')') depth -= 1;
        if (depth === 0 && index < text.length - 1) return text;
    }

    return depth === 0 ? text.slice(1, -1) : text;
}

function formatRule(rule) {
    let value = String(rule || '').trim();
    if (!value) return '';

    value = value.replace(/^\^/, '').replace(/\$$/, '');
    value = value.replace(/\$\|\^/g, '|');
    value = value.replace(/\\s\*/g, ' ').replace(/\\s\+/g, ' ');
    value = value
        .replace(/\(\[\\s\\S\]\+\)/g, '<内容>')
        .replace(/\(\[\\s\\S\]\*\)/g, '<内容>')
        .replace(/\(\[\^ \\n\]\+\)/g, '<参数>')
        .replace(/\(\[\^\\n\]\+\)/g, '<参数>')
        .replace(/\(\.\+\)/g, '<内容>')
        .replace(/\(\.\*\)/g, '<内容>')
        .replace(/\[\\s\\S\]\+/g, '<内容>')
        .replace(/\[\^ \\n\]\+/g, '<参数>')
        .replace(/\[\^\\n\]\+/g, '<参数>')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    value = stripOuterGroup(value);
    value = value.replace(/\(([A-Za-z0-9_\u4e00-\u9fa5]+)\)/g, '$1').trim();
    value = value.replace(/([A-Za-z0-9_\u4e00-\u9fa5)])<(?=内容|参数)/g, '$1 <');

    return value || String(rule).trim();
}

function getPluginDir() {
    return path.resolve(process.env.BNCR_PLUGIN_DIR || DEFAULT_PLUGIN_DIR);
}

async function scanPluginsRealtime() {
    const baseDir = getPluginDir();
    console.info(`${LOG_PREFIX} 扫描插件目录: ${baseDir}`);

    let rootEntries;
    try {
        rootEntries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch (error) {
        throw new Error(`无法读取插件根目录 (${baseDir})：${error.message}`);
    }

    const plugins = [];

    const readPluginFile = async (filePath, category) => {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const metadata = parsePluginMetadata(content);
            if (!metadata) return;
            if (metadata.disable || metadata.service || metadata.adapter) return;
            if (metadata.name === SELF_PLUGIN_NAME || path.basename(filePath) === '鑫仔bot菜单.js') return;

            plugins.push({
                ...metadata,
                category: category || '未分类',
                fileName: path.basename(filePath),
                description: normalizeOneLine(metadata.description),
            });
        } catch (error) {
            console.warn(`${LOG_PREFIX} 跳过无法读取的文件 ${filePath}: ${error.message}`);
        }
    };

    for (const entry of rootEntries) {
        const entryPath = path.join(baseDir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'mod' || entry.name.startsWith('.')) continue;

            try {
                const files = await fs.readdir(entryPath, { withFileTypes: true });
                for (const file of files) {
                    if (!file.isFile() || !file.name.endsWith('.js')) continue;
                    await readPluginFile(path.join(entryPath, file.name), entry.name);
                }
            } catch (error) {
                console.warn(`${LOG_PREFIX} 跳过无法读取的分类目录 ${entryPath}: ${error.message}`);
            }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            await readPluginFile(entryPath, '未分类');
        }
    }

    console.info(`${LOG_PREFIX} 扫描完成，共 ${plugins.length} 个可用插件`);
    return plugins;
}

function parseArgs(rawMessage) {
    let text = String(rawMessage || '').trim();
    text = text.replace(/^#菜单/, '').replace(/^menu/i, '').trim();
    text = text.replace(/^搜索\s*/, '').trim();

    let page = 1;
    const pageMatch = text.match(/(?:^|\s)(?:第)?(\d+)(?:页)?$/);
    if (pageMatch) {
        page = parseInt(pageMatch[1], 10) || 1;
        text = text.slice(0, pageMatch.index).trim();
    }

    return {
        page,
        keyword: text.replace(/^关键词\s*/, '').trim(),
    };
}

function filterPlugins(plugins, keyword) {
    if (!keyword) return plugins;

    const needle = keyword.toLowerCase();
    return plugins.filter((plugin) => {
        const haystack = [
            plugin.name,
            plugin.category,
            plugin.fileName,
            plugin.description,
            ...plugin.rules,
            ...plugin.rules.map(formatRule),
        ].join(' ').toLowerCase();

        return haystack.includes(needle);
    });
}

function categoryRank(category, orderList) {
    const index = orderList.indexOf(category);
    return index === -1 ? orderList.length : index;
}

function sortPlugins(plugins, categoryOrder) {
    const orderList = categoryOrder
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return plugins.sort((a, b) => {
        const categoryDiff = categoryRank(a.category, orderList) - categoryRank(b.category, orderList);
        if (categoryDiff !== 0) return categoryDiff;
        if (a.category !== b.category) return a.category.localeCompare(b.category, 'zh-CN');
        if (a.admin !== b.admin) return a.admin ? 1 : -1;
        if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
        return a.name.localeCompare(b.name, 'zh-CN');
    });
}

function renderTemplate(template, data) {
    if (typeof template !== 'string') return '';
    return template.replace(/{{\s*(\w+)\s*}}/g, (full, key) => {
        return data[key] === undefined || data[key] === null ? '' : String(data[key]);
    });
}

function renderPlugin(plugin, config) {
    const lines = [];
    lines.push(`▸ ${plugin.name}`);

    const maxRules = config.maxRulesPerPlugin > 0
        ? Math.min(config.maxRulesPerPlugin, plugin.rules.length)
        : plugin.rules.length;

    for (let index = 0; index < maxRules; index += 1) {
        const rule = formatRule(plugin.rules[index]);
        if (!rule) continue;
        const suffix = plugin.admin ? config.adminSuffixText : '';
        lines.push(`  ${config.commandPrefix}${rule}${suffix}`.trimEnd());
    }

    if (maxRules < plugin.rules.length) {
        lines.push(`  … 另有 ${plugin.rules.length - maxRules} 条命令`);
    }

    if (config.showDescription && plugin.description) {
        lines.push(`  ${plugin.description}`);
    }

    return lines;
}

function renderMenu(plugins, pagePlugins, pageData, config) {
    const lines = [];
    const hasAdmin = pagePlugins.some((plugin) => plugin.admin);
    const templateData = {
        ...pageData,
        adminNote: hasAdmin && config.adminCommandNote ? config.adminCommandNote : '',
    };
    const header = renderTemplate(String(config.menuHeader).replace(/\\n/g, '\n'), templateData).trim();
    if (header) lines.push(header);

    if (pageData.keyword) {
        lines.push(`🔍 筛选：${pageData.keyword}`);
    }

    if (pagePlugins.length === 0) {
        lines.push('(没有找到匹配的插件命令)');
    } else if (config.groupByCategory) {
        let lastCategory = null;
        for (const plugin of pagePlugins) {
            if (plugin.category !== lastCategory) {
                if (lastCategory !== null) lines.push('');
                lines.push(`━━ ${plugin.category} ━━`);
                lastCategory = plugin.category;
            }
            lines.push(...renderPlugin(plugin, config));
        }
    } else {
        for (const plugin of pagePlugins) {
            lines.push(...renderPlugin(plugin, config));
        }
    }

    const footer = renderTemplate(String(config.menuFooter).replace(/\\n/g, '\n'), templateData).trim();
    if (footer) {
        lines.push('');
        lines.push(footer);
    }

    return {
        text: lines.join('\n').trim(),
        hasAdmin,
        totalPlugins: plugins.length,
        totalCommands: plugins.reduce((total, plugin) => total + plugin.rules.length, 0),
    };
}

function buildPageData({ page, totalPages, keyword, totalPlugins, totalCommands }) {
    const safeKeyword = keyword ? `${keyword} ` : '';
    const navigation = [];
    if (page > 1) navigation.push(`「#菜单 ${safeKeyword}${page - 1}」上一页`);
    if (page < totalPages) navigation.push(`「#菜单 ${safeKeyword}${page + 1}」下一页`);

    const stats = keyword
        ? `筛选「${keyword}」：${totalPlugins} 个插件 · ${totalCommands} 条命令`
        : `共 ${totalPlugins} 个插件 · ${totalCommands} 条命令`;

    const pageInfo = `第 ${page}/${totalPages} 页${navigation.length ? ` · ${navigation.join(' · ')}` : ''}`;

    return {
        keyword: keyword || '',
        stats,
        pageInfo,
        page,
        totalPages,
        totalPlugins,
        totalCommands,
        adminNote: '',
    };
}

async function replyAndDelete(sender, text, delaySeconds) {
    const sent = await sender.reply(text);
    const messageId = sent && typeof sent === 'object'
        ? (sent.messageId || sent.msgId || sent.id)
        : sent;

    if (!messageId || delaySeconds <= 0) return;

    const timer = setTimeout(() => {
        Promise.resolve()
            .then(() => sender.delMsg(messageId))
            .catch((error) => console.warn(`${LOG_PREFIX} 撤回菜单失败: ${error.message}`));
    }, delaySeconds * 1000);

    if (typeof timer.unref === 'function') timer.unref();
}

console.info(`${LOG_PREFIX} 插件已启用，触发命令： #菜单 | menu`);

module.exports = async (sender) => {
    try {
        await ConfigDB.get();
        applyUserConfig(ConfigDB.userConfig);
    } catch (error) {
        console.warn(`${LOG_PREFIX} 读取配置失败，使用默认配置: ${error.message}`);
    }

    const config = MENU_CONFIG;
    const args = parseArgs(sender.getMsg ? sender.getMsg() : '');

    let plugins;
    try {
        plugins = await scanPluginsRealtime();
    } catch (error) {
        console.error(`${LOG_PREFIX} 扫描失败:`, error);
        await sender.reply(`菜单生成失败：${error.message}`);
        return;
    }

    plugins = filterPlugins(plugins, args.keyword);
    plugins = sortPlugins(plugins, config.categoryOrder);

    if (config.includeAdminInMenu === false) {
        plugins = plugins.filter((plugin) => plugin.admin !== true);
    }

    const totalPages = Math.max(1, Math.ceil(plugins.length / config.pageSize));
    const page = Math.min(Math.max(1, args.page), totalPages);
    const pagePlugins = plugins.slice((page - 1) * config.pageSize, page * config.pageSize);

    const pageData = buildPageData({
        page,
        totalPages,
        keyword: args.keyword,
        totalPlugins: plugins.length,
        totalCommands: plugins.reduce((total, plugin) => total + plugin.rules.length, 0),
    });

    const menu = renderMenu(plugins, pagePlugins, pageData, config);

    try {
        await replyAndDelete(sender, menu.text, config.deleteDelaySeconds);
    } catch (error) {
        console.error(`${LOG_PREFIX} 发送菜单失败:`, error);
        try {
            await sender.reply('抱歉，发送菜单时出现错误，请稍后再试。');
        } catch (replyError) {
            console.error(`${LOG_PREFIX} 发送错误提示失败:`, replyError.message);
        }
    }
};
