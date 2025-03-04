/**
 * @author seven
 * @name 运行状态美化版
 * @team xinz
 * @version 1.0.0
 * @description 本机资源查询
 * @rule ^(运行状态)$
 * @admin true
 * @public false
 * @priority 9999
 * @disable false
 */

const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation'); // 引入 systeminformation 库

const delMsgTime = 5000; // 设置删除消息的时间为 5000 毫秒

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
    const cpuSpeed = cpus[0].speed; // CPU速度
    const cpuTemperature = await getCpuTemperature(); // 获取CPU温度
    return {
        'CPU型号': cpuModel,
        'CPU使用率': `${cpuUsage ? cpuUsage.toFixed(2) : '未获取'}%`,
        'CPU温度': cpuTemperature ? `${cpuTemperature} °C` : '未获取', // CPU温度
        'CPU具体运行状态': {
            '速度': cpuSpeed,
            '总进程数': process.pid,
            '活动进程数': getActiveProcessesCount(),
            '核心数': cpus.length,
        },
    };
}

/**
 * 获取CPU使用率
 */
async function getCpuUsage() {
    try {
        const cpuData = await si.currentLoad();
        return cpuData.currentLoad; // 返回当前 CPU 使用率
    } catch (error) {
        console.error('获取CPU使用率失败:', error);
        return null; // 返回null表示未获取到使用率
    }
}

/**
 * 获取CPU温度
 */
async function getCpuTemperature() {
    try {
        const data = await si.cpuTemperature();
        return data.main; // 返回主温度
    } catch (error) {
        console.error('获取CPU温度失败:', error);
        return null; // 返回null表示未获取到温度
    }
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
    return diskInfo.split('\n').slice(1).map(line => {
        const parts = line.split(/\s+/);
        return {
            '文件系统': parts[0],
            '总大小': parts[1],
            '已用': parts[2],
            '可用': parts[3],
            '使用率': parts[4],
        };
    });
}

/**
 * 获取系统信息并发送
 */
async function getSystemInfo(s) {
    const uptime = getUptime();
    const loadInfo = getLoadInfo();
    const cpuInfo = await getCpuInfo();
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
CPU型号: ${cpuInfo['CPU型号']}（速度: ${cpuInfo['CPU具体运行状态']['速度']} MHz）（核心数: ${cpuInfo['CPU具体运行状态']['核心数']}）
CPU使用率: ${cpuInfo['CPU使用率']}
CPU温度: ${cpuInfo['CPU温度']}
CPU具体运行状态:
总进程数: ${cpuInfo['CPU具体运行状态']['总进程数']}
活动进程数: ${cpuInfo['CPU具体运行状态']['活动进程数']}

内存信息:
总内存: ${memoryInfo['总内存']}
可用内存: ${memoryInfo['可用内存']}
已用内存: ${memoryInfo['已用内存']}

磁盘信息:
文件系统: ${diskInfo[0]['文件系统']}
总大小: ${diskInfo[0]['总大小']}
已用: ${diskInfo[0]['已用']}
可用: ${diskInfo[0]['可用']}
`;

    const replyid = await s.reply(systemInfo);
    
    // 设置删除回复消息的延迟
    setTimeout(async () => {
        try {
            await s.delMsg(replyid); // 撤回刚刚发的消息
            console.log('消息撤回成功');
        } catch (error) {
            console.error('撤回消息失败:', error);
        }
    }, delMsgTime);
}

// 插件入口，处理指令“运行状态”
module.exports = async s => {
    // 假设用户输入的指令
    const command = '运行状态';

    // 检查指令是否为“运行状态”
    if (command === '运行状态') {
        await getSystemInfo(s);
    } else {
        await s.reply('无效指令，请发送“运行状态”以获取系统信息。');
    }
};
