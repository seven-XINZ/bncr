/**
 * @author seven
 * @name 运行状态
 * @team xinz
 * @version 1.6.1
 * @description 本机资源查询 - 美化版 (自动过滤磁盘, 无网络信息)
 * @rule ^(运行状态)$
 * @admin false
 * @public false
 * @priority 9999
 * @disable false
 */

const os = require('os');
const { execSync } = require('child_process');
sysMethod.testModule(['systeminformation'], { install: true });
const si = require('systeminformation');

// 配置项
const CONFIG = {
    delMsgTime: 90000,       // 消息保留时间(毫秒)
    progressBarLength: 15,   // 进度条长度
    refreshInterval: null,   // 刷新间隔(毫秒)，设为null表示不自动刷新
    // df 命令的回退方案，如果 systeminformation 获取失败，则尝试获取这些挂载点的信息
    majorMountPointsForFallback: ['/', '/home'],
};

// *** FIX: Define sysMethod directly here ***
const sysMethod = { name: '运行状态' }; // Provide a default name for logging

// 美化工具函数
const format = {
    _sectionWidth: 35, // 定义统一的区块宽度

    // 进度条生成
    progressBar: (percent, length = CONFIG.progressBarLength) => {
        if (isNaN(percent)) percent = 0; // 处理 NaN 输入
        const filled = Math.round(percent / 100 * length);
        const displayPercent = Math.max(0, Math.min(100, percent));
        const clampedFilled = Math.max(0, Math.min(length, filled));
        return `[${'■'.repeat(clampedFilled)}${'□'.repeat(length - clampedFilled)}] ${displayPercent.toFixed(1)}%`;
    },
    // 分隔线生成
    separator: (text) => {
        // Ensure text is a string before calculating length
        const textStr = String(text || '');
        const padding = '─'.repeat(Math.max(0, format._sectionWidth - textStr.length - 5));
        return `┌── ${textStr} ${padding}`;
    },
    // 结束线生成
    sectionEnd: () => '└' + '─'.repeat(format._sectionWidth) + '┘',

    // 格式化字节为人类可读格式
    formatBytes: (bytes, decimals = 1) => {
        if (bytes === 0 || isNaN(bytes) || bytes < 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = bytes < 1 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
        const unitIndex = Math.max(0, Math.min(i, sizes.length - 1));
        const value = bytes / Math.pow(k, unitIndex);
        return `${parseFloat(value.toFixed(decimals))} ${sizes[unitIndex]}`;
    },
    // 格式化时间
    formatUptime: (seconds) => {
        if (isNaN(seconds) || seconds < 0) return 'N/A';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let result = '';
        if (days > 0) result += `${days}天 `;
        if (hours > 0 || days > 0) result += `${hours}小时 `;
        result += `${minutes}分钟`;

        return result || '0分钟';
    },
    // 格式化CPU速度
    formatCpuSpeed: (speedMhz) => {
        if (!speedMhz || isNaN(speedMhz) || speedMhz <= 0) return 'N/A';
        return speedMhz >= 1000 ?
            `${(speedMhz / 1000).toFixed(1)} GHz` :
            `${speedMhz} MHz`;
    },
};


/**
 * 获取主要/真实磁盘信息, 过滤系统/虚拟/重复挂载点
 */
async function getDiskInfo() {
    try {
        const fsData = await si.fsSize();
        const excludedMountPrefixes = ['/proc', '/sys', '/dev', '/run', '/snap', '/var/lib/docker', '/boot/efi'];
        const excludedFsTypes = [
            'tmpfs', 'devtmpfs', 'squashfs', 'autofs', 'rpc_pipefs', 'iso9660',
            'udf', 'fuse.gvfsd-fuse', 'securityfs', 'tracefs', 'debugfs', 'fusectl',
            'pstore', 'efivarfs', 'bpf', 'binfmt_misc', 'overlay'
        ];
        const excludedFsSources = ['udev', 'cgroup', 'cgroup2', 'none'];

        const filteredData = fsData.filter(fs =>
            fs.size > 0 && fs.used >= 0 && !fs.remote &&
            !excludedMountPrefixes.some(prefix => fs.mount.startsWith(prefix)) &&
            !excludedFsTypes.includes(fs.type?.toLowerCase()) &&
            !excludedFsSources.includes(fs.fs?.toLowerCase()) &&
            !fs.mount.includes('/.') && fs.fs?.startsWith('/')
        );

        const uniqueDisks = new Map();
        filteredData.forEach(fs => {
            if (!uniqueDisks.has(fs.mount)) { uniqueDisks.set(fs.mount, fs); }
        });

        let finalDiskData = Array.from(uniqueDisks.values());
        finalDiskData.sort((a, b) => {
            if (a.mount === '/') return -1; if (b.mount === '/') return 1;
            return a.mount.localeCompare(b.mount);
        });

        return finalDiskData.map(fs => ({
            mount: fs.mount,
            total: format.formatBytes(fs.size),
            used: format.formatBytes(fs.used),
            available: format.formatBytes(fs.available >= 0 ? fs.available : (fs.size - fs.used)),
            percent: fs.use || (fs.size > 0 ? (fs.used / fs.size) * 100 : 0)
        }));

    } catch (error) {
        console.error(`[${sysMethod.name}] 获取磁盘信息失败 (si.fsSize):`, error);
        console.warn(`[${sysMethod.name}] 尝试使用 "df" 作为后备方案...`);
        try {
            const diskData = [];
            for (const mountPoint of CONFIG.majorMountPointsForFallback) {
                 try {
                    const cmd = `df -hT -l -P ${mountPoint} | awk 'NR==2{print $1,$2,$3,$4,$5,$6,$7}'`;
                    const output = execSync(cmd, { encoding: 'utf8', timeout: 2000 }).toString().trim();
                    if (output) {
                        const parts = output.split(/\s+/);
                        if (parts.length >= 7) {
                             const [fs, type, total, used, avail, percentStr, mountResolved] = parts;
                             if (type !== 'tmpfs' && type !== 'squashfs' && type !== 'overlay' && mountResolved === mountPoint) {
                                diskData.push({ mount: mountResolved, total: total, used: used, available: avail,
                                                percent: parseInt(percentStr.replace('%', '') || '0', 10) });
                             }
                        }
                    }
                 } catch (dfError) { /* 静默处理单个df失败 */ }
            }
            diskData.sort((a, b) => CONFIG.majorMountPointsForFallback.indexOf(a.mount) - CONFIG.majorMountPointsForFallback.indexOf(b.mount));
            if (diskData.length > 0) { console.warn(`[${sysMethod.name}] 使用 "df" 后备方案获取了 ${diskData.length} 个挂载点的信息.`); }
            else { console.error(`[${sysMethod.name}] "df" 后备方案也未能获取磁盘信息.`); }
            return diskData;
        } catch (cmdError) {
            console.error(`[${sysMethod.name}] 执行 "df" 后备命令时出错:`, cmdError); return [];
        }
    }
}


/**
 * 获取CPU信息
 */
async function getCpuInfo() {
    try {
        const [cpuData, load, temp] = await Promise.all([
            si.cpu(), si.currentLoad(), si.cpuTemperature().catch(() => ({ main: null }))
        ]);
        const processes = await si.processes();
        let cpuSpeed = format.formatCpuSpeed(cpuData.speed);
        try {
            const osCpus = os.cpus();
            if ((!cpuData.speed || cpuData.speed < 100) && osCpus?.[0]?.speed) {
                 cpuSpeed = format.formatCpuSpeed(osCpus[0].speed);
            } else if (!cpuSpeed || cpuSpeed === 'N/A') {
                cpuSpeed = format.formatCpuSpeed(cpuData.speedMax) || 'N/A';
            }
        } catch { /* 忽略 OS CPU 错误 */ }
        return {
            model: (cpuData.manufacturer ? cpuData.manufacturer + ' ' : '') + cpuData.brand,
            speed: cpuSpeed,
            cores: cpuData.physicalCores || os.cpus().length, threads: cpuData.cores || os.cpus().length,
            usage: format.progressBar(load.currentLoad), temp: temp.main ? `${temp.main.toFixed(1)}°C` : 'N/A',
            processes: { total: processes.all || 0, active: processes.running || 0 }
        };
    } catch (error) {
        console.error(`[${sysMethod.name}] 获取CPU信息失败 (si):`, error);
        try {
            const osCpus = os.cpus(); const cpuModel = osCpus?.[0]?.model.split('@')[0].trim() || 'Unknown';
            let cpuSpeed = 'N/A', coreCount = osCpus?.length || 0;
            if (osCpus?.[0]?.speed) cpuSpeed = format.formatCpuSpeed(osCpus[0].speed);
            return { model: cpuModel, speed: cpuSpeed, cores: coreCount, threads: coreCount,
                     usage: format.progressBar(0), temp: 'N/A', processes: { total: 0, active: 0 } };
        } catch (osError) {
            console.error(`[${sysMethod.name}] 使用OS API获取CPU信息失败:`, osError);
            return { model: 'Unknown', speed: 'N/A', cores: 'N/A', threads: 'N/A',
                     usage: format.progressBar(0), temp: 'N/A', processes: { total: 0, active: 0 } };
        }
    }
}

/**
 * 获取内存信息
 */
async function getMemoryInfo() {
    try {
        const mem = await si.mem(); const usedMemory = mem.active || (mem.total - mem.available);
        const percent = mem.total > 0 ? (usedMemory / mem.total) * 100 : 0;
        return { total: format.formatBytes(mem.total), free: format.formatBytes(mem.available),
                 used: format.formatBytes(usedMemory), percent: percent,
                 swapTotal: format.formatBytes(mem.swaptotal), swapUsed: format.formatBytes(mem.swapused) };
    } catch (error) {
        console.error(`[${sysMethod.name}] 获取内存信息失败 (si):`, error);
         try {
            const total = os.totalmem(); const free = os.freemem(); const used = total - free;
            const percent = total > 0 ? (used / total) * 100 : 0;
            return { total: format.formatBytes(total), free: format.formatBytes(free), used: format.formatBytes(used),
                     percent: percent, swapTotal: 'N/A', swapUsed: 'N/A' };
        } catch (osMemError) {
            console.error(`[${sysMethod.name}] 使用OS API获取内存信息失败:`, osMemError);
            return { total: 'N/A', free: 'N/A', used: 'N/A', percent: 0, swapTotal: 'N/A', swapUsed: 'N/A' };
        }
    }
}

/**
 * 获取系统运行时间
 */
function getUptime() {
    try { const uptime = os.uptime(); return { seconds: uptime, formatted: format.formatUptime(uptime) }; }
    catch (e) { console.error(`[${sysMethod.name}] 获取运行时间失败:`, e); return { seconds: 0, formatted: 'N/A' }; }
}

/**
 * 获取系统负载信息
 */
async function getLoadInfo() {
    try {
        const loadAvg = os.loadavg(); let cpuCount = 1;
        try { cpuCount = (await si.cpu()).physicalCores || os.cpus().length || 1; }
        catch { cpuCount = os.cpus()?.length || 1; }
        return { avg1: loadAvg[0].toFixed(2), avg5: loadAvg[1].toFixed(2), avg15: loadAvg[2].toFixed(2),
                 maxLoad: cpuCount, safeLoad: (cpuCount * 0.75).toFixed(2) };
    } catch (error) {
        console.error(`[${sysMethod.name}] 获取负载信息失败:`, error);
        try { const cpuCountFallback = os.cpus()?.length || 1;
            return { avg1: 'N/A', avg5: 'N/A', avg15: 'N/A', maxLoad: cpuCountFallback,
                     safeLoad: (cpuCountFallback * 0.75).toFixed(2) };
        } catch (fallbackError) {
            console.error(`[${sysMethod.name}] 获取负载信息彻底失败:`, fallbackError);
            return { avg1: 'N/A', avg5: 'N/A', avg15: 'N/A', maxLoad: '?', safeLoad: 'N/A' };
        }
    }
}

/**
 * 根据负载值返回状态指示符
 */
function getLoadStatus(load, safeLoad) {
    const loadNum = parseFloat(load); const safeNum = parseFloat(safeLoad);
    if (isNaN(loadNum) || isNaN(safeNum) || safeNum <= 0) return '?';
    const ratio = loadNum / safeNum;
    if (ratio >= 1.5) return '⚠️'; if (ratio >= 1.1) return '⚡'; if (ratio >= 0.8) return '✓'; return '︎︎︎︎︎▫';
}


/**
 * 主函数：获取并显示系统信息
 */
async function getSystemInfo(s) {
    try {
        const [uptime, cpu, mem, disks, load] = await Promise.all([
            getUptime(), getCpuInfo(), getMemoryInfo(), getDiskInfo(), getLoadInfo()
        ]);

        const diskTitle = '磁盘信息'; let diskSection = `${format.separator(diskTitle)}\n`;
        if (disks.length === 0) {
            const noDiskMsg = `│ 未获取到有效磁盘信息`;
            diskSection += `${noDiskMsg}${' '.repeat(Math.max(0, format._sectionWidth - noDiskMsg.length + 1))}\n`;
        } else {
            disks.forEach((disk, index) => {
                if (index > 0) { diskSection += `│${' '.repeat(format._sectionWidth -1 )}│\n`; }
                diskSection += `│ 挂载点: ${disk.mount}\n`; diskSection += `│ 总空间: ${disk.total}\n`;
                diskSection += `│ 已用空间: ${disk.used} ${format.progressBar(disk.percent)}\n`;
                diskSection += `│ 可用空间: ${disk.available}\n`;
            });
        }
        diskSection += format.sectionEnd();

        const info = `
${format.separator('🖥️ 系统信息')}
│ 主机名: ${os.hostname()}
│ 系统: ${os.type()} ${os.release()}
│ Node: ${process.version}
│ 时间: ${uptime.formatted}
│
${format.separator('📊 系统负载')}
│ 负载: ${load.avg1}${getLoadStatus(load.avg1, load.safeLoad)} ${load.avg5}${getLoadStatus(load.avg5, load.safeLoad)} ${load.avg15}${getLoadStatus(load.avg15, load.safeLoad)} (安全: ${load.safeLoad})
│ CPU核数: ${load.maxLoad} (物理)
│
${format.separator('🔥 CPU信息')}
│ 型号: ${cpu.model}
│ 核心: ${cpu.cores}核 / ${cpu.threads}线程 @ ${cpu.speed}
│ 使用率: ${cpu.usage}
│ 温度: ${cpu.temp}
│ 进程: ${cpu.processes.active} / ${cpu.processes.total}
│
${format.separator('💾 内存信息')}
│ 总计: ${mem.total}
│ 使用: ${mem.used} ${format.progressBar(mem.percent)}
│ 可用: ${mem.free}
│ SWAP: ${mem.swapUsed} / ${mem.swapTotal}
│
${diskSection}
        `.trim().replace(/^│\n/gm, '│');

        const replyid = await s.reply(info);
        if (!CONFIG.refreshInterval) {
            setTimeout(() => { s.delMsg(replyid).catch(e => console.error(`[${sysMethod.name}] 删除消息 ${replyid} 失败:`, e)); }, CONFIG.delMsgTime);
        }
    } catch (e) {
        console.error(`[${sysMethod.name}] 构建或发送系统信息时出错:`, e);
        try {
            const errorMsg = await s.reply('⚠️ 系统状态获取失败，请查看控制台日志');
            setTimeout(() => { s.delMsg(errorMsg).catch(e => console.error(`[${sysMethod.name}] 删除错误消息失败:`, e)); }, CONFIG.delMsgTime);
        } catch (replyError) { console.error(`[${sysMethod.name}] 发送错误消息也失败了:`, replyError); }
    }
}


// 模块导出 - 入口点
module.exports = async s => {
    if (!s || typeof s.reply !== 'function' || typeof s.delMsg !== 'function') {
        console.error(`[${sysMethod.name}] 无效的输入对象 's', 无法执行.`);
        return;
    }
    await getSystemInfo(s);
};
