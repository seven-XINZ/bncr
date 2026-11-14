/**
 * @author 啊屁
 * @team xinz
 * @name Aria2 push
 * @version 1.0.5
 * @description 管理Aria2下载任务
 * @rule ^(magnet:\?xt=urn:btih:[a-zA-Z0-9]+)
 * @rule ^(下载中|等待中|已完成|暂停任务|恢复任务|删除任务)$
 * @admin true
 * @public false
 * @priority 50
 @disable false
 */

const axios = require('axios');

// 配置
const jsonSchema1 = BncrCreateSchema.object({
  containers: BncrCreateSchema.array(BncrCreateSchema.object({
    name: BncrCreateSchema.string().setTitle('容器名称').setDescription('标识此容器的唯一名称'),
    host: BncrCreateSchema.string().setTitle('设置host').setDescription('配置你的host'),
    port: BncrCreateSchema.string().setTitle('设置端口').setDescription('配置你的端口').setDefault('6800'),
    token: BncrCreateSchema.string().setTitle('设置token').setDescription('配置你的RPC token')
  })).setTitle('容器列表').setDescription('配置不同的Aria2容器')
});


const ConfigDB = new BncrPluginConfig(jsonSchema1);

// 辅助函数
function byte2Readable(bytes, suffix = '') {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B' + suffix;
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]}${suffix}`;
  return `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}${suffix}`;
}

function progress(total, completed) {
  if (total === '0') return '0%';
  return `${(completed / total * 100).toFixed(2)}%`;
}

function getFilename(task) {
  return task.files[0]?.path.split('/').pop() || task.bittorrent?.info?.name || 'Unknown';
}

// Aria2 HTTP JSON-RPC 调用函数
function aria2Call(container, method, params = []) {
  const rpcUrl = `http://${container.host}:${container.port}/jsonrpc`;
  return axios.post(rpcUrl, {
    jsonrpc: '2.0',
    method: `aria2.${method}`,
    id: Date.now().toString(),
    params: [`token:${container.token}`, ...params]
  }).then(response => {
    if (response.data.error) {
      throw new Error(response.data.error.message);
    }
    return response.data.result;
  });
}

// 主函数
module.exports = async (sender) => {
  await ConfigDB.get();
  if (!ConfigDB.userConfig.containers || ConfigDB.userConfig.containers.length === 0) {
    return await sender.reply('请先配置Aria2容器信息');
  }

  let container = ConfigDB.userConfig.containers[0];
  if (ConfigDB.userConfig.containers.length > 1) {
    const containerList = ConfigDB.userConfig.containers.map((c, index) => `容器${index + 1}: ${c.name}`).join('\n');
    await sender.reply(`请回复容器序号以选择操作的容器：\n${containerList}`);
    const response = await sender.waitInput(() => {}, 30);
    if (response) {
      const userInput = response.getMsg().trim();
      const containerIndex = parseInt(userInput) - 1;
      if (containerIndex >= 0 && containerIndex < ConfigDB.userConfig.containers.length) {
        container = ConfigDB.userConfig.containers[containerIndex];
      } else {
        return await sender.reply('无效的容器序号');
      }
    } else {
      return await sender.reply('操作超时');
    }
  }

  const msg = sender.getMsg();

  // 处理磁力链接
  if (msg.startsWith('magnet:?xt=urn:btih:')) {
    try {
      await aria2Call(container, 'addUri', [[msg]]);
      await sender.reply('已添加下载任务');
    } catch (error) {
      await sender.reply('添加下载任务失败：' + error.message);
    }
  }

  // 查看当前下载任务
  else if (msg === '下载中') {
    try {
      const tasks = await aria2Call(container, 'tellActive');
      await sendTaskList(sender, tasks, '当前下载中的任务');
    } catch (error) {
      await sender.reply('获取下载任务失败：' + error.message);
    }
  }

  // 查看等待中的任务
  else if (msg === '等待中') {
    try {
      const tasks = await aria2Call(container, 'tellWaiting', [0, 100]);
      await sendTaskList(sender, tasks, '等待中的任务');
    } catch (error) {
      await sender.reply('获取等待任务失败：' + error.message);
    }
  }

  // 查看已完成的任务
  else if (msg === '已完成') {
    try {
      const tasks = await aria2Call(container, 'tellStopped', [0, 100]);
      await sendTaskList(sender, tasks, '已完成或停止的任务');
    } catch (error) {
      await sender.reply('获取完成任务失败：' + error.message);
    }
  }

  // 暂停任务
  else if (msg === '暂停任务') {
    await handleTaskOperation(sender, container, 'pause', '暂停任务');
  }

  // 恢复任务
  else if (msg === '恢复任务') {
    await handleTaskOperation(sender, container, 'unpause', '恢复任务');
  }

  // 删除任务
  else if (msg === '删除任务') {
    await handleTaskOperation(sender, container, 'remove', '删除任务');
  }

  return 'next';
};

async function sendTaskList(sender, tasks, title) {
  if (tasks.length === 0) {
    await sender.reply(`没有${title}`);
  } else {
    const taskList = tasks.map((task, index) => {
      const fileName = getFilename(task);
      const totalLength = Number(task.totalLength);
      const completedLength = Number(task.completedLength);
      const downloadSpeed = Number(task.downloadSpeed);
      return [
        `任务${index + 1}: ${fileName.substring(0, 15)}...`,
        `大小: ${byte2Readable(totalLength)}`,
        `进度: ${progress(totalLength, completedLength)}`,
        `速度: ${byte2Readable(downloadSpeed, '/s')}`,
      ].join('\n');
    }).join('\n\n');
    await sender.reply(`${title}：\n${taskList}`);
  }
}

async function handleTaskOperation(sender, container, operation, operationName) {
  try {
    const tasks = await aria2Call(container, 'tellActive');
    if (tasks.length === 0) {
      await sender.reply('当前没有可操作的任务');
    } else {
      const taskList = tasks.map((task, index) => `任务${index + 1}: ${getFilename(task).substring(0, 15)}...`).join('\n');
      await sender.reply(`当前任务列表：\n${taskList}\n\n请回复要${operationName}的任务序号或输入'q'退出`);
      const response = await sender.waitInput(() => {}, 30);
      if (response) {
        const userInput = response.getMsg().trim().toLowerCase();
        if (userInput === 'q') {
          await sender.reply('操作已取消');
          return;
        }
        const taskIndex = parseInt(userInput) - 1;
        if (taskIndex >= 0 && taskIndex < tasks.length) {
          const task = tasks[taskIndex];
          if (operation === 'pause') {
            await aria2Call(container, 'pause', [task.gid]);
          } else if (operation === 'unpause') {
            await aria2Call(container, 'unpause', [task.gid]);
          } else if (operation === 'remove') {
            await aria2Call(container, 'remove', [task.gid]);
          }
          await sender.reply(`已${operationName}: ${getFilename(task)}`);
        } else {
          await sender.reply('无效的任务序号');
        }
      } else {
        await sender.reply('操作超时');
      }
    }
  } catch (error) {
    await sender.reply(`获取任务失败：${error.message}`);
  }
}
