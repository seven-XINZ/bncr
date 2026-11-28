/**
 * @author xinz
 * @name 联动中心
 * @team xinz
 * @version 1.0.0
 * @description 查看插件联动清单、最近事件，手动调用任意插件，自检总线与通知链路
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^联动列表$
 * @rule ^联动插件$
 * @rule ^联动事件$
 * @rule ^联动测试$
 * @rule ^联动调用\s+(\S+)\s+([\s\S]+)$
 * @rule ^联动$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["工具"]
 */
'use strict';

const link = require('./mod/link');
const store = link.store;

link.register({
    name: '联动中心',
    description: '插件联动清单、事件与手动调用',
    events: ['ping'],
    commands: ['联动列表', '联动事件', '联动测试', '联动调用 插件名 命令'],
});

function listText() {
    const all = link.scan(true).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    const rows = all.slice(0, 40).map(p => {
        const tags = [];
        if (p.admin) tags.push('管理员');
        if (p.cron) tags.push('定时');
        if (p.service) tags.push('服务');
        return `· ${p.name}${tags.length ? ' [' + tags.join('/') + ']' : ''}\n  ${p.description || '无说明'}\n  规则 ${p.rules.length} 条`;
    });
    return `🔗 联动插件（${all.length} 个）\n\n${rows.join('\n')}${all.length > 40 ? `\n… 还有 ${all.length - 40} 个` : ''}\n\n调用：联动调用 插件名 命令`;
}

async function eventText() {
    const events = await link.recent(12);
    if (!events.length) return '还没有联动事件。触发一次「检查订阅」或「巡检」后再看。';
    return '🔗 最近联动事件\n\n' + events.map(e => {
        const text = String(e.text || (e.item && e.item.title) || e.event || '').replace(/\s+/g, ' ').slice(0, 80);
        return `· ${e.at ? e.at.slice(5, 19).replace('T', ' ') : '?'} ${e.event}${text ? '：' + text : ''}`;
    }).join('\n');
}

async function selfTest() {
    const all = link.scan(true);
    const names = all.map(p => p.name);
    const expected = ['通知路由', '服务巡检', 'RSS订阅', '每日简报', '稍后读', 'GitHub动态', '站点证书', '习惯打卡', '记账', '纪念日'];
    const missing = expected.filter(n => !names.includes(n));
    const ping = link.emit('ping', { from: '联动中心' });
    const pushReady = typeof global.sysMethod !== 'undefined' && typeof global.sysMethod.push === 'function';
    return [
        '🧪 联动自检',
        `· 已发现插件：${all.length} 个`,
        `· 联动组：${missing.length ? '缺少 ' + missing.join('、') : expected.length + ' 个组件齐全'}`,
        `· 事件总线：${ping.at ? '正常' : '异常'}`,
        `· 推送通道 sysMethod.push：${pushReady ? '可用' : '不可用'}`,
        `· 事件记录：${(await store.get('link', 'events', [])).length || 0} 条`,
        '',
        '下一步：通知 添加 主群 qq 群 ID，再用「通知 测试 主群 内容」验证推送。',
    ].join('\n');
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();

    if (raw === '联动' || raw === '联动帮助') {
        return s.reply('联动中心用法：\n联动列表\n联动事件\n联动测试\n联动调用 天气 天气成都\n\n联动组：通知路由、服务巡检、RSS订阅、每日简报、稍后读');
    }
    if (raw === '联动列表' || raw === '联动插件') return s.reply(listText());
    if (raw === '联动事件') return s.reply(await eventText());
    if (raw === '联动测试') return s.reply(await selfTest());

    const m = raw.match(/^联动调用\s+(\S+)\s+([\s\S]+)$/);
    if (m) {
        const name = m[1];
        const command = m[2];
        if (name === '联动中心') return s.reply('不能自己调用自己。');
        const result = await link.callPlugin(name, command, { sender: s, from: 'link-center' });
        if (!result.ok) return s.reply(`❌ 调用 ${name} 失败：${result.error}`);
        return s.reply(result.output || `✅ ${result.name} 已执行，但没有文本回复`);
    }

    return s.reply('联动中心用法：\n联动列表\n联动事件\n联动测试\n联动调用 天气 天气成都');
};
