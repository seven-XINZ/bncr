/**
 * @author xinz
 * @name 插件工坊
 * @team xinz
 * @version 1.0.1
 * @description 用一句话让大模型写出可用的 Bncr 插件，落盘并做语法校验（仅管理员）
 * @rule ^(做个插件|写个插件|生成插件)\s+([\s\S]+)$
 * @rule ^(插件工坊|生成的插件|插件清单)$
 * @admin true
 * @public false
 * @priority 99997
 * @disable false
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const axios = require('axios');

const PLUGIN_ROOT = path.join(__dirname, '..');

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string().setTitle('接口地址').setDefault('https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: BncrCreateSchema.string().setTitle('API Key').setDescription('必填，生成插件需要大模型').setDefault(''),
    model: BncrCreateSchema.string().setTitle('模型').setDefault('doubao-seed-2-1-turbo'),
    overwrite: BncrCreateSchema.boolean().setTitle('允许覆盖同名').setDefault(false),
    outDir: BncrCreateSchema.string().setTitle('生成目录').setDescription('相对 plugins 根目录，默认单独存放').setDefault('自动生成'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
const DB = new BncrDB('插件工坊');

const DANGEROUS = /child_process|execSync|spawnSync|\bspawn\(|\bfs\.rm\b|rmdirSync|unlinkSync|process\.exit|require\(['"]https?['"]\)|eval\s*\(|new\s+Function\s*\(/;

function outDirOf(cfg) {
    const d = String((cfg || {}).outDir || '自动生成').replace(/^[./]+/, '').replace(/[\\:*?"<>|]/g, '');
    return path.join(PLUGIN_ROOT, d || '自动生成');
}
function listGenerated(cfg) {
    try {
        const dir = outDirOf(cfg);
        if (!fs.existsSync(dir)) return [];
        return fs
            .readdirSync(dir)
            .filter(f => f.endsWith('.js'))
            .map(f => f.replace(/\.js$/, ''));
    } catch (e) {
        return [];
    }
}

async function askModel(cfg, requirement) {
    const sys = [
        '你是 Bncr（Node.js 机器人框架）的插件开发专家，负责把需求写成可直接运行的插件。',
        '硬性约束：',
        '1. CommonJS，`module.exports = async s => { ... }`；可用内置模块与插件目录已安装的 axios。',
        '2. 文件开头必须是 jsdoc 元信息注释，包含 author/name/team/version/description，以及 rule 或定时任务指令；',
        '   规则关键字是 rule，写在 jsdoc 里并用中文友好的正则，例如匹配「今日油价」；定时任务写 cron 表达式：秒 分 时 日 月 星期。',
        '3. 需要配置项时用 BncrCreateSchema + BncrPluginConfig，不要硬编码密钥；持久化用 BncrDB。',
        '4. 禁止 child_process、删文件、改系统配置、eval；网络请求要加 timeout 和 try/catch。',
        '5. 代码不超过 200 行，注释用中文，出错时 `s.reply()` 给用户明确提示。',
        '只输出 JSON，不要解释：{"name":"插件名(4-8字)","description":"一句话说明","rule":"主触发正则","code":"完整文件内容"}',
    ].join('\n');
    const res = await axios.post(
        `${String(cfg.apiBase).replace(/\/+$/, '')}/chat/completions`,
        {
            model: cfg.model,
            temperature: 0.2,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: '需求：' + requirement },
            ],
        },
        { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey }, timeout: 90000 }
    );
    const raw = String((((res.data || {}).choices || [])[0] || {}).message?.content || '');
    const js = (raw.match(/\{[\s\S]*\}/) || [''])[0];
    if (!js) throw new Error('模型没返回 JSON');
    const obj = JSON.parse(js);
    if (!obj.code || !obj.name) throw new Error('缺少 name/code 字段');
    return obj;
}

function safeName(name) {
    return String(name || '')
        .replace(/[\\/:*?"<>|\s]/g, '')
        .slice(0, 20);
}

module.exports = async s => {
    await ConfigDB.get();
    const cfg = Object.assign({ apiBase: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', model: 'doubao-seed-2-1-turbo', overwrite: false }, ConfigDB.userConfig || {});
    const msg = String(s.getMsg() || '').trim();

    // 清单
    if (/^(插件工坊|生成的插件|插件清单)$/.test(msg)) {
        const list = listGenerated(cfg);
        const dir = outDirOf(cfg);
        return s.reply(list.length ? `工坊生成的插件（${list.length} 个，都在 ${path.relative(PLUGIN_ROOT, dir)}）：\n` + list.map(n => '· ' + n).join('\n') + '\n重启 Bncr 后加载。' : '还没有生成过插件。用法：做个插件 每天8点推送天气到qq群');
    }

    if (!/^(做个插件|写个插件|生成插件)\s+/.test(msg)) return 'next';
    const requirement = msg.replace(/^(做个插件|写个插件|生成插件)\s+/, '').trim();
    if (requirement.length < 6) return s.reply('需求太短，说清楚要什么功能、什么时候触发。');
    if (!String(cfg.apiKey || '').trim()) return s.reply('插件工坊需要先在大模型配置里填 API Key。');

    let obj;
    try {
        obj = await askModel(cfg, requirement);
    } catch (e) {
        console.error('[插件工坊] 生成失败:', e.message);
        return s.reply('生成失败：' + e.message);
    }

    const code = String(obj.code);
    if (code.length > 60000) return s.reply('生成代码过长，已拒绝写入。');
    if (DANGEROUS.test(code)) return s.reply('生成的代码包含高危调用（child_process / 删文件 / eval），已拒绝写入。');
    if (!/@name/.test(code) || !/@(rule|cron)/.test(code)) return s.reply('生成的代码缺少触发规则或定时信息，已拒绝写入。');

    try {
        // 语法校验：在独立沙箱编译，只编译不执行，也不接触当前上下文
        new vm.Script(code, { filename: 'plugin-workshop-check.js' });
    } catch (e) {
        return s.reply('生成的代码有语法错误，未写入：' + e.message);
    }

    const name = safeName(obj.name) || '自造插件' + Date.now().toString().slice(-5);
    const dir = outDirOf(cfg);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name + '.js');
    if (fs.existsSync(file) && !cfg.overwrite) {
        return s.reply(`已有同名插件 ${name}，需要覆盖请先在工坊配置里打开「允许覆盖同名」。`);
    }
    fs.writeFileSync(file, code, 'utf8');

    const rec = (await DB.get('list', [])) || [];
    rec.push({ name, description: obj.description || '', file, at: Date.now(), by: s.getUserId(), requirement });
    await DB.set('list', rec.slice(-100));

    return s.reply(
        [
            `写好了：${name}`,
            obj.description ? '作用：' + obj.description : '',
            '文件：' + path.relative(PLUGIN_ROOT, file),
            '语法校验通过，重启 Bncr 后会作为正式插件加载。',
            '要继续改就再发「做个插件 ...」补充需求。',
        ]
            .filter(Boolean)
            .join('\n')
    );
};
