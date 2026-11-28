/**
 * @author OpenClaw
 * @name 定时任务
 * @team xinz
 * @origin 实用工具
 * @description 创建、查看、删除定时任务
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(添加定时任务 | 创建任务|定时) (.+)$
 * @rule ^(查看任务 | 任务列表 | 我的任务)$
 * @rule ^(删除任务 | 取消任务) (.+)$
 * @admin true
 * @priority 100
 * @disable false
 * @public false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @classification ["效率"]
 */

const tasks = new Map();

const jsonSchema = BncrCreateSchema.object({
    maxTasks: BncrCreateSchema.number().setTitle('最大任务数').setDefault(50)
});
const ConfigDB = new BncrPluginConfig(jsonSchema);


module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const maxTasks = Number(cfg.maxTasks) || 50;
    const cmd = sender.getMsg();
    const db = new BncrDB('tasks');
    
    // 添加定时任务
    if (cmd.match(/^(添加定时任务 | 创建任务|定时)/)) {
        const taskInfo = sender.param(2);
        const parts = taskInfo.split(' ');
        
        if (parts.length < 3) {
            await sender.reply('❌ 格式错误！\n请使用：添加定时任务 时间 命令\n例如：添加定时任务 0 0 8 * * * 重启');
            return;
        }
        
        const cronTime = parts[0] + ' ' + parts[1] + ' ' + parts[2];
        const taskCmd = parts.slice(3).join(' ');
        const taskName = `task_${Date.now()}`;
        
        try {
            const existed = await db.keys();
            if (existed.length >= maxTasks) {
                await sender.reply(`❌ 任务数量已达上限（${maxTasks} 个），请先删除不用的任务`);
                return;
            }
            await db.set(taskName, { cron: cronTime, cmd: taskCmd, createdAt: new Date().toISOString() });
            
            sysMethod.cron.newCron(cronTime, async () => {
                console.log(`执行定时任务 ${taskName}: ${taskCmd}`);
                await sysMethod.inline(taskCmd);
            });
            
            await sender.reply(`✅ 定时任务已添加！\n时间：${cronTime}\n命令：${taskCmd}\n任务 ID: ${taskName}`);
        } catch (error) {
            await sender.reply(`❌ 添加任务失败：${error.message}`);
        }
        return;
    }
    
    // 查看任务列表
    if (cmd.match(/^(查看任务 | 任务列表 | 我的任务)$/)) {
        const keys = await db.keys();
        const taskList = [];
        
        for (const key of keys) {
            const task = await db.get(key, null, true);
            if (task && task.value.cron) {
                taskList.push(`• ${key}: ${task.value.cmd} (${task.value.cron})`);
            }
        }
        
        if (taskList.length === 0) {
            await sender.reply('📭 暂无定时任务');
        } else {
            await sender.reply(`📋 定时任务列表 (${taskList.length}个):\n\n${taskList.join('\n')}`);
        }
        return;
    }
    
    // 删除任务
    if (cmd.match(/^(删除任务 | 取消任务)/)) {
        const taskName = sender.param(2);
        
        if (!taskName) {
            await sender.reply('❌ 请指定要删除的任务 ID\n例如：删除任务 task_1234567890');
            return;
        }
        
        const task = await db.get(taskName, null, true);
        if (!task || !task.value.cron) {
            await sender.reply(`❌ 找不到任务：${taskName}`);
            return;
        }
        
        await db.del(taskName);
        await sender.reply(`✅ 已删除任务：${taskName}\n命令：${task.value.cmd}`);
        return;
    }
};
