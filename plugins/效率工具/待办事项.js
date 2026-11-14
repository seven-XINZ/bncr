/**
 * @author OpenClaw
 * @name 待办事项
 * @team xinz
 * @origin 效率工具
 * @version 1.0.0
 * @description 个人待办事项管理：添加、查看、完成、删除
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(待办 | 任务 | 计划) (.+)$
 * @rule ^(我的待办 | 我的任务 | 查看待办 | 任务列表)$
 * @rule ^(完成 | 完成待办) (.+)$
 * @rule ^(删除待办 | 删除任务) (.+)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const cmd = sender.getMsg();
    const db = new BncrDB('todo');
    const userId = sender.getUserId();
    const userName = sender.getUserName();
    
    // 添加待办事项
    if (cmd.match(/^(待办 | 任务 | 计划)/) && !cmd.match(/^(我的待办 | 我的任务 | 查看待办 | 任务列表 | 完成 | 删除)/)) {
        const todoText = sender.param(2);
        
        if (!todoText) {
            await sender.reply('❌ 请添加待办内容\n例如：待办 明天上午 10 点开会\n任务 写完代码\n计划 学习 JavaScript');
            return;
        }
        
        const todos = await db.get(`todos_${userId}`, []);
        const newTodo = {
            id: Date.now(),
            text: todoText,
            createdAt: new Date().toISOString(),
            completed: false
        };
        
        todos.push(newTodo);
        await db.set(`todos_${userId}`, todos);
        
        await sender.reply(`✅ 已添加待办事项：${todoText}\n当前共有 ${todos.length} 个待办事项`);
        return;
    }
    
    // 查看待办列表
    if (cmd.match(/^(我的待办 | 我的任务 | 查看待办 | 任务列表)$/)) {
        const todos = await db.get(`todos_${userId}`, []);
        
        if (todos.length === 0) {
            await sender.reply('📝 暂无待办事项\n输入"待办 内容"添加新任务');
            return;
        }
        
        const pending = todos.filter(t => !t.completed);
        const completed = todos.filter(t => t.completed);
        
        let reply = `📋 ${userName} 的待办事项\n\n`;
        
        if (pending.length > 0) {
            reply += `⏳ 待完成 (${pending.length}个):\n`;
            pending.forEach((todo, index) => {
                reply += `  ${index + 1}. ${todo.text}\n`;
            });
            reply += '\n';
        }
        
        if (completed.length > 0) {
            reply += `✅ 已完成 (${completed.length}个):\n`;
            completed.slice(0, 5).forEach((todo, index) => {
                reply += `  ✓ ${todo.text}\n`;
            });
            if (completed.length > 5) {
                reply += `  ... 还有 ${completed.length - 5} 个\n`;
            }
        }
        
        await sender.reply(reply);
        return;
    }
    
    // 完成待办
    if (cmd.match(/^(完成 | 完成待办)/)) {
        const target = sender.param(2);
        
        if (!target) {
            await sender.reply('❌ 请指定要完成的待办事项\n例如：完成 1\n完成 明天上午 10 点开会');
            return;
        }
        
        const todos = await db.get(`todos_${userId}`, []);
        let found = false;
        
        // 尝试按编号查找
        if (/^\d+$/.test(target)) {
            const index = parseInt(target) - 1;
            if (todos[index] && !todos[index].completed) {
                todos[index].completed = true;
                todos[index].completedAt = new Date().toISOString();
                found = true;
            }
        } else {
            // 按内容查找
            const todo = todos.find(t => t.text === target && !t.completed);
            if (todo) {
                todo.completed = true;
                todo.completedAt = new Date().toISOString();
                found = true;
            }
        }
        
        if (!found) {
            await sender.reply('❌ 未找到该待办事项或已完成');
            return;
        }
        
        await db.set(`todos_${userId}`, todos);
        await sender.reply('✅ 已完成该待办事项！\n继续加油！💪');
        return;
    }
    
    // 删除待办
    if (cmd.match(/^(删除待办 | 删除任务)/)) {
        const target = sender.param(2);
        
        if (!target) {
            await sender.reply('❌ 请指定要删除的待办事项\n例如：删除待办 1\n删除任务 明天上午 10 点开会');
            return;
        }
        
        const todos = await db.get(`todos_${userId}`, []);
        const originalLength = todos.length;
        
        // 按编号删除
        if (/^\d+$/.test(target)) {
            const index = parseInt(target) - 1;
            if (todos[index]) {
                todos.splice(index, 1);
                await db.set(`todos_${userId}`, todos);
                await sender.reply('✅ 已删除该待办事项');
                return;
            }
        } else {
            // 按内容删除
            const index = todos.findIndex(t => t.text === target);
            if (index !== -1) {
                todos.splice(index, 1);
                await db.set(`todos_${userId}`, todos);
                await sender.reply('✅ 已删除该待办事项');
                return;
            }
        }
        
        await sender.reply('❌ 未找到该待办事项');
        return;
    }
};
