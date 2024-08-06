/**
 * @author seven
 * @name 状态查询
 * @team xinz
 * @version 1.0.0
 * @description 本机资源查询
 * @rule ^(运行状态)$
 * @admin true
 * @public true
 * @priority 9999
 * @disable false
 * @classification ["功能插件"]  
 */

const os = require('os');
const { execSync } = require('child_process');

/**
 * 获取系统运行时间
 */
function getUptime() {
  const uptimeInSeconds = os.uptime();
  const hours = Math.floor(uptimeInSeconds / 3600);
  const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
  return { hours, minutes };
}

/**
 * 获取系统负载信息
 */
function getLoadInfo() {
  const load = os.loadavg();
  return {
    '1分钟负载': load[0].toFixed(2),
    '5分钟负载': load[1].toFixed(2),
    '15分钟负载': load[2].toFixed(2),
    '最大负载': os.cpus().length,
    '负载限制': os.cpus().length * 2,
    '安全负载': os.cpus().length * 1.5,
  };
}

/**
 * 获取活动进程数量
 */
function getActiveProcessesCount() {
  const output = execSync('ps -e | wc -l').toString().trim();
  return parseInt(output, 10); // 返回活动进程数量
}

/**
 * 获取CPU信息
 */
async function getCpuInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus[0].model;
  const cpuUsage = await getCpuUsage();
  return {
    'CPU型号': cpuModel,
    'CPU使用率': `${cpuUsage}%`,
    'CPU具体运行状态': {
      '用户态': `${cpus.reduce((acc, cpu) => acc + cpu.times.user, 0)}ms`,
      '系统态': `${cpus.reduce((acc, cpu) => acc + cpu.times.sys, 0)}ms`,
      '总进程数': process.pid,
      '活动进程数': getActiveProcessesCount(),
    },
  };
}

/**
 * 获取CPU使用率
 */
function getCpuUsage() {
  const startMeasure = cpuAverage();
  return new Promise((resolve) => {
    setTimeout(() => {
      const endMeasure = cpuAverage();
      const idleDifference = endMeasure.idle - startMeasure.idle;
      const totalDifference = endMeasure.total - startMeasure.total;
      const usage = 100 - Math.floor((100 * idleDifference) / totalDifference);
      resolve(usage);
    }, 100);
  });
}

/**
 * 计算CPU使用情况
 */
function cpuAverage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  });

  return { idle, total };
}
/**
 * 获取网络信息
 */
function getNetworkInfo() {
  const networkInterfaces = os.networkInterfaces();
  const networkInfo = [];

  for (const interface in networkInterfaces) {
    networkInterfaces[interface].forEach(details => {
      if (!details.internal) {
        networkInfo.push({
          接口: interface,
          上行: details.address,
          下行: details.netmask,
        });
      }
    });
  }
  return networkInfo;
}

/**
 * 获取内存信息
 */
function getMemoryInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return {
    '总内存': `${(totalMemory / (1024 ** 3)).toFixed(2)} GB`,
    '可用内存': `${(freeMemory / (1024 ** 3)).toFixed(2)} GB`,
    '已用内存': `${(usedMemory / (1024 ** 3)).toFixed(2)} GB`,
  };
}

/**
 * 获取磁盘信息
 */
function getDiskInfo() {
    const diskInfo = execSync('df -h').toString();
    const results = {};

    // 解析 df -h 的输出，提取每个磁盘的信息
    diskInfo.split('\n').slice(1).forEach(line => {
        const parts = line.split(/\s+/);
        // 仅返回 /dev/sda1、/dev/sda2 和 /dev/sda3 的信息
        if (parts[0] === '/dev/sda1' || parts[0] === '/dev/sda2' || parts[0] === '/dev/sda3') {
            results[parts[0]] = {
                '总大小': parts[1], // 总大小
                '已用': parts[2],    // 已用空间
                '可用': parts[3]     // 剩余空间
            };
        }
    });

    return results; // 返回包含磁盘信息的对象
}

/**
 * 获取系统信息并发送
 */
async function getSystemInfo(sender) {
    const uptime = getUptime();
    const loadInfo = getLoadInfo();
    const cpuInfo = await getCpuInfo();
    const networkInfo = getNetworkInfo();
    const memoryInfo = getMemoryInfo();
    const diskInfo = getDiskInfo();

    // 格式化输出
    const systemInfo = `
运行时间: ${uptime.hours}小时 ${uptime.minutes}分钟
系统信息:
版本: ${process.version}
操作系统: ${os.type()} ${os.release()}

系统负载信息:
1分钟负载: ${loadInfo['1分钟负载']}
5分钟负载: ${loadInfo['5分钟负载']}
15分钟负载: ${loadInfo['15分钟负载']}
最大负载: ${loadInfo['最大负载']}
负载限制: ${loadInfo['负载限制']}
安全负载: ${loadInfo['安全负载']}

CPU信息:
CPU型号: ${cpuInfo['CPU型号']}
CPU使用率: ${cpuInfo['CPU使用率']}
CPU具体运行状态:
总进程数: ${cpuInfo['CPU具体运行状态']['总进程数']}
活动进程数: ${cpuInfo['CPU具体运行状态']['活动进程数']}

内存信息:
总内存: ${memoryInfo['总内存']}
可用内存: ${memoryInfo['可用内存']}
已用内存: ${memoryInfo['已用内存']}

磁盘信息:
${Object.entries(diskInfo).map(([disk, info]) => `
文件系统: ${disk}
总大小: ${info['总大小']}
已用: ${info['已用']}
可用: ${info['可用']}
`).join('')}
`;

    await sender.reply(systemInfo);
}

// 插件入口，处理指令“运行状态”
module.exports = async sender => {
    // 假设用户输入的指令
    const command = '运行状态';

    // 检查指令是否为“运行状态”
    if (command === '运行状态') {
        await getSystemInfo(sender);
    } else {
        await sender.reply('无效指令，请发送“运行状态”以获取系统信息。');
    }
};
