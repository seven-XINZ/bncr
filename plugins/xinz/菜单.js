/**
 * @author seven
 * @name 菜单
 * @team xinz
 * @description 可自定义菜单内容和底部显示的菜单插件，并支持动态插件清单
 * @rule ^(菜单)$
 * @rule ^插件菜单$
 * @admin false
 * @public true
 * @priority 1000
 * @disable false
 * @classification ["工具"]
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @version 2.0.0
 */
/// <reference path="../../@types/Bncr.d.ts" />
const link = require('./mod/link');
const kit = require('./mod/plugin-kit');
const defaultConfig = {
    menuItems: [
      {
        category: '🎡京东活动🎡',
        items: [
          { command: '登录', description: '短信/扫码登录' },
          { command: '查询', description: '查询账户信息' },
          { command: '豆豆', description: '查询豆豆明细' },
          { command: '浇水', description: '东东农场(旧)浇水' },
          { command: '更新ck', description: '密码登录专属更新ck' },
          { command: '奖票兑换', description: '玩一玩奖票兑换红包' },
          { command: '账户管理', description: '管理/删除账户' },
          { command: '密码管理', description: '删除密码登录账户' },
          { command: '位置查询', description: '位置每天都会变动' }
        ]
      },
      {
        category: '👽其它命令👽',
        items: [
          { command: '城市天气', description: '例如：北京天气' },
          { command: '查Q绑 qq', description: '例如：查Q绑 123456' },
          { command: '打赏', description: '打赏一下，维护不易' },
          { command: '打赏排行榜', description: '记住每一位老板' }
        ]
      }
    ],
    bottomContent: '请多多拉人，一起撸 ~\n㊗️🎊家人们发大财,心想事成,身体健康'
  };
  
  const jsonSchema = BncrCreateSchema.object({
    menuItems: BncrCreateSchema.array(
      BncrCreateSchema.object({
        category: BncrCreateSchema.string()
          .setTitle('分类名称')
          .setDescription('设置菜单分类的名称'),
        items: BncrCreateSchema.array(
          BncrCreateSchema.object({
            command: BncrCreateSchema.string()
              .setTitle('命令')
              .setDescription('设置菜单项的命令'),
            description: BncrCreateSchema.string()
              .setTitle('描述')
              .setDescription('设置菜单项的描述')
          })
        ).setTitle('菜单项')
         .setDescription('设置该分类下的菜单项')
      })
    ).setTitle('菜单内容')
     .setDescription('设置菜单的内容结构')
     .setDefault(defaultConfig.menuItems),
    bottomContent: BncrCreateSchema.string()
      .setTitle('底部显示内容')
      .setDescription('设置菜单底部显示的内容，使用\\n表示换行')
      .setDefault(defaultConfig.bottomContent)
  });
  
  const ConfigDB = new BncrPluginConfig(jsonSchema);
  
  function generateMenu(menuItems, bottomContent) {
    let   message = [
      
      '┄┅┄┅┄┅┄┅┄┅┄┅┄',
      '❤️💗菜单选项列表💗❤️',
      '┄┅┄┅┄┅┄┅┄┅┄┅┄',
      '═════命令❀描述════'
    ];
    for (const category of menuItems) {
      message.push(category.category);
      for (const item of category.items) {
        message.push(`${item.command.padEnd(8)}║ ${item.description}`);
      }
      message.push('┄┅┄┅┄┅┄┅┄┅┄┅┄');
    }
  
    // 添加底部内容，处理换行
    message = message.concat(bottomContent.split('\\n'));
  
    message.push('┄┅┄┅┄┅┄┅┄┅┄┅┄');
  
    return message.join('\n');
  }
  
  function generatePluginMenu() {
    const plugins = link.listActive();
    const groups = new Map();
    for (const p of plugins) {
      const key = p.classification || '未分类';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const count = link.stats();
    const lines = [
      '🧩 插件菜单',
      `活动 ${count.active} 个 · 官方 ${count.official} 个 · 归档 ${count.archive} 个`,
      '┄┅┄┅┄┅┄┅┄┅┄┅┄'
    ];
    for (const [category, items] of groups) {
      lines.push(`【${category}】${items.length} 个`);
      items.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      for (const p of items) {
        const desc = (p.description || '无描述').slice(0, 40);
        lines.push(`${p.name} v${p.version} — ${desc}`);
      }
      lines.push('┄┅┄┅┄┅┄┅┄┅┄┅┄');
    }
    lines.push('发送「插件体检」可查看健康状态');
    return lines.join('\n');
  }

  /**
   * 插件入口
   * @param {Sender} s
   */
  module.exports = async s => {
    try {
      const msg = String((s.getMsg && s.getMsg()) || '').trim();
      if (/^插件菜单$/.test(msg)) {
        return await kit.replyLong(s, generatePluginMenu());
      }
      await ConfigDB.get();
      if (!Object.keys(ConfigDB.userConfig).length) {
        return await s.reply('请先发送"修改无界配置",或者前往前端web"插件配置"来完成插件首次配置');
      }
  
      const { menuItems, bottomContent } = ConfigDB.userConfig;
      const menuContent = generateMenu(menuItems, bottomContent);
      await s.reply(menuContent);
    } catch (error) {
      console.error('生成或发送菜单时出错:', error);
      await s.reply('抱歉,生成菜单时出现错误,请稍后再试。');
    }
  };
