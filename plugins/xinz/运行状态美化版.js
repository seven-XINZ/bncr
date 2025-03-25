/**
 * @author seven
 * @name 运行状态
 * @team xinz
 * @version 1.2.0
 * @description 本机资源少量bug版本    多硬盘 请将硬盘挂载映射进 bncr  示例:/sata:/sata  /sata1:/sata1  /sata2:/sata2
 * @rule ^(运行状态)$
 * @admin true
 * @public false
 * @priority 9999
 * @disable false
 */

const os = require('os');
const { execSync } = require('child_process');
const si = require('systeminformation');

// 配置项
const CONFIG = {
    delMsgTime: 90000,       // 消息保留时间(毫秒)
    progressBarLength: 15,   // 进度条长度
    refreshInterval: null,   // 刷新间隔(毫秒)，设为null表示不自动刷新
    networkHistory: {},      // 存储上次网络数据以计算速率
    maxDisksToShow: 10,      // 最多显示几个磁盘，设置为较大的数值以显示所有磁盘
    preferredInterfaces: ['enp3s0', 'enp4s0', 'eth0', 'eth1', 'wlan0', 'wlan1'], // 优先选择的网卡，按优先级排序
    hideNetworkAddresses: true,  // 是否隐藏IP地址和MAC地址
    maxNetworksToShow: 15,   // 最多显示几个网卡
    showAllNetworks: true    // 是否显示所有网卡
};

// 美化工具函数
const format = {
    // 进度条生成
    progressBar: (percent, length = CONFIG.progressBarLength) => {
        const filled = Math.round(percent / 100 * length);
        return `[${'■'.repeat(filled)}${'□'.repeat(length - filled)}] ${percent.toFixed(1)}%`;
    },
    // 分隔线生成
    separator: (text) => {
        const line = '─'.repeat(28 - text.length);
        return `┌── ${text} ${line}`;
    },
    // 结束线生成
    sectionEnd: () => '└' + '─'.repeat(32),
    // 格式化字节为人类可读格式
    formatBytes: (bytes, decimals = 1) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
    },
    // 格式化时间
    formatUptime: (seconds) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        let result = '';
        if (days > 0) result += `${days}天 `;
        if (hours > 0 || days > 0) result += `${hours}小时 `;
        result += `${minutes}分钟`;
        
        return result;
    },
    // 格式化CPU速度
    formatCpuSpeed: (speedMhz) => {
        if (!speedMhz) return 'N/A';
        // 如果速度大于1000MHz，转换为GHz
        return speedMhz >= 1000 ? 
            `${(speedMhz / 1000).toFixed(1)} GHz` : 
            `${speedMhz} MHz`;
    },
    // 隐藏敏感信息
    hideAddress: (address, type = 'ip') => {
        if (CONFIG.hideNetworkAddresses) {
            if (type === 'ip') {
                if (!address || address === 'N/A') return 'N/A';
                // 隐藏IP地址的最后一段
                return address.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.$3.***');
            } else if (type === 'mac') {
                if (!address || address === 'N/A') return 'N/A';
                // 隐藏MAC地址的后半部分
                return address.replace(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}):.*/i, '$1:****');
            }
        }
        return address;
    }
};

/**
 * 主函数：获取并显示系统信息
 */
async function getSystemInfo(s) {
    try {
        // 获取系统信息
        const [uptime, cpu, mem, disks, load, networks] = await Promise.all([
            getUptime(),
            getCpuInfo(),
            getMemoryInfo(),
            getDiskInfo(),
            getLoadInfo(),
            getAllNetworkInfo()
        ]);

        // 构建磁盘信息部分
        let diskSection = `${format.separator('💽 磁盘信息')}\n`;
        
        // 检查是否有磁盘信息
        if (disks.length === 0) {
            diskSection += "│ 未能获取磁盘信息\n";
        } else {
            // 显示所有磁盘，不限制数量
            disks.forEach((disk, index) => {
                if (index > 0) diskSection += "│\n"; // 磁盘之间添加空行
                
                diskSection += `│ 挂载点: ${disk.mount}\n`;
                diskSection += `│ 文件系统: ${disk.fs}\n`;
                diskSection += `│ 类型: ${disk.type}\n`;
                diskSection += `│ 总空间: ${disk.total}\n`;
                diskSection += `│ 已用空间: ${disk.used} ${format.progressBar(disk.percent)}\n`;
                diskSection += `│ 可用空间: ${disk.available}\n`;
            });
        }

        // 构建网络信息部分
        let networkSection = `${format.separator('🌐 网络信息')}\n`;
        
        // 检查是否有网络信息
        if (networks.length === 0) {
            networkSection += "│ 未能获取网络信息\n";
        } else {
            // 对网络接口进行排序：首先是物理接口，然后是虚拟接口
            networks.sort((a, b) => {
                // 首先按照是否为虚拟接口排序
                const aVirtual = isVirtualInterface(a.interface);
                const bVirtual = isVirtualInterface(b.interface);
                if (aVirtual !== bVirtual) {
                    return aVirtual ? 1 : -1;
                }
                
                // 然后按照状态排序（已连接优先）
                if (a.status.includes('已连接') && !b.status.includes('已连接')) {
                    return -1;
                }
                if (!a.status.includes('已连接') && b.status.includes('已连接')) {
                    return 1;
                }
                
                // 最后按照名称排序
                return a.interface.localeCompare(b.interface);
            });
            
            // 确定要显示的网卡数量
            const networksToShow = CONFIG.showAllNetworks ? 
                networks : 
                networks.slice(0, CONFIG.maxNetworksToShow);
            
            networksToShow.forEach((network, index) => {
                if (index > 0) networkSection += "│\n"; // 网卡之间添加空行
                
                networkSection += `│ 网卡名称: ${network.interface} (${network.type})\n`;
                networkSection += `│ IP地址: ${format.hideAddress(network.ip, 'ip')}\n`;
                networkSection += `│ MAC地址: ${format.hideAddress(network.mac, 'mac')}\n`;
                networkSection += `│ 下载速度: ${network.rx}/s (总计: ${network.rxTotal})\n`;
                networkSection += `│ 上传速度: ${network.tx}/s (总计: ${network.txTotal})\n`;
                networkSection += `│ 连接状态: ${network.status}\n`;
            });
            
            // 如果限制了显示数量且有更多网卡未显示，添加提示
            if (!CONFIG.showAllNetworks && networks.length > CONFIG.maxNetworksToShow) {
                networkSection += `│\n│ (还有 ${networks.length - CONFIG.maxNetworksToShow} 个网卡未显示)\n`;
            }
        }

        // 构建信息模板
        const info = `
${format.separator('🖥️ 系统信息')}
│
│ 运行时间: ${uptime.formatted}
│ 版本: ${process.version}
│ 操作系统: ${os.type()} ${os.release()}
│ 主机名: ${os.hostname()}
│ 
${format.separator('📊 系统负载')}
│ 1分钟负载: ${load.avg1} ${getLoadStatus(load.avg1, load.safeLoad)}
│ 5分钟负载: ${load.avg5} ${getLoadStatus(load.avg5, load.safeLoad)}
│ 15分钟负载: ${load.avg15} ${getLoadStatus(load.avg15, load.safeLoad)}
│ CPU核心数: ${load.maxLoad}
│ 安全负载: ${load.safeLoad}
│ 
${format.separator('🔥 CPU信息')}
│ CPU型号: ${cpu.model}
│ 核心/线程: ${cpu.cores}核 / ${cpu.threads}线程
│ 主频: ${cpu.speed}
│ CPU使用率: ${cpu.usage}
│ CPU温度: ${cpu.temp}
│ 进程: ${cpu.processes.active}活动 / ${cpu.processes.total}总数
│ 
${format.separator('💾 内存信息')}
│ 总内存: ${mem.total}
│ 已用内存: ${mem.used} ${format.progressBar(mem.percent)}
│ 可用内存: ${mem.free}
│ SWAP: ${mem.swapUsed}/${mem.swapTotal}
│ 
${diskSection}
${networkSection}
${format.sectionEnd()}
        `.trim();

        // 发送并设置删除
        const replyid = await s.reply(info);
        
        // 如果设置了自动刷新，则不自动删除
        if (CONFIG.refreshInterval) {
            // 实现自动刷新逻辑
        } else {
            setTimeout(() => s.delMsg(replyid).catch(e => console.error('删除消息失败:', e)), CONFIG.delMsgTime);
        }

    } catch (e) {
        console.error('系统信息获取失败:', e);
        const errorMsg = await s.reply('⚠️ 系统状态获取失败，请查看日志');
        setTimeout(() => s.delMsg(errorMsg).catch(e => console.error('删除错误消息失败:', e)), CONFIG.delMsgTime);
    }
}

/**
 * 根据负载值返回状态指示符
 */
function getLoadStatus(load, safeLoad) {
    const loadNum = parseFloat(load);
    const safeNum = parseFloat(safeLoad);
    
    if (loadNum >= safeNum * 1.5) return '⚠️'; // 高负载
    if (loadNum >= safeNum) return '⚡'; // 中等负载
    return '✓'; // 低负载
}

/**
 * 获取CPU信息
 */
async function getCpuInfo() {
    try {
        const [cpuData, load, temp] = await Promise.all([
            si.cpu(),
            si.currentLoad(),
            si.cpuTemperature().catch(() => ({ main: null }))
        ]);
        
        const processes = await si.processes();

        // 获取并格式化CPU速度
        let cpuSpeed = format.formatCpuSpeed(cpuData.speed);
        
        // 如果systeminformation提供的速度看起来不正确，尝试从os.cpus()获取
        if (cpuData.speed < 100) { // 如果速度异常低，可能是错误的
            const osCpus = os.cpus();
            if (osCpus && osCpus.length > 0 && osCpus[0].speed) {
                cpuSpeed = format.formatCpuSpeed(osCpus[0].speed);
            }
        }

        return {
            model: cpuData.manufacturer + ' ' + cpuData.brand,
            speed: cpuSpeed,
            cores: cpuData.physicalCores,
            threads: cpuData.cores,
            usage: format.progressBar(load.currentLoad),
            temp: temp.main ? `${temp.main.toFixed(1)}°C` : 'N/A',
            processes: {
                total: processes.all,
                active: processes.running
            }
        };
    } catch (error) {
        console.error('获取CPU信息失败:', error);
        // 回退到使用os模块
        try {
            const osCpus = os.cpus();
            const cpuModel = osCpus[0].model.split('@')[0].trim();
            const cpuSpeed = osCpus[0].speed;
            
            return {
                model: cpuModel,
                speed: format.formatCpuSpeed(cpuSpeed),
                cores: os.cpus().length,
                threads: os.cpus().length,
                usage: format.progressBar(0),
                temp: 'N/A',
                processes: { total: 0, active: 0 }
            };
        } catch (osError) {
            console.error('使用OS API获取CPU信息失败:', osError);
            return {
                model: 'Unknown',
                speed: 'N/A',
                cores: 'N/A',
                threads: 'N/A',
                usage: format.progressBar(0),
                temp: 'N/A',
                processes: { total: 0, active: 0 }
            };
        }
    }
}

/**
 * 获取内存信息
 */
async function getMemoryInfo() {
    try {
        const mem = await si.mem();
        const percent = (mem.active / mem.total) * 100;
        
        return {
            total: format.formatBytes(mem.total),
            free: format.formatBytes(mem.available),
            used: format.formatBytes(mem.active),
            percent: percent,
            swapTotal: format.formatBytes(mem.swaptotal),
            swapUsed: format.formatBytes(mem.swapused)
        };
    } catch (error) {
        console.error('获取内存信息失败:', error);
        const total = os.totalmem();
        const free = os.freemem();
        return {
            total: format.formatBytes(total),
            free: format.formatBytes(free),
            used: format.formatBytes(total - free),
            percent: ((total - free) / total) * 100,
            swapTotal: 'N/A',
            swapUsed: 'N/A'
        };
    }
}

/**
 * 获取磁盘信息
 */
async function getDiskInfo() {
    try {
        // 获取文件系统信息
        const fsData = await si.fsSize();
        
        // 排除一些特殊挂载点
        const excludeMounts = ['/boot', '/dev', '/run', '/sys', '/proc', '/snap'];
        const validFs = fsData.filter(fs => 
            !excludeMounts.some(mount => fs.mount.startsWith(mount)) && 
            fs.size > 0 && 
            !fs.mount.includes('docker')
        );
        
        // 排序：首先是根目录，然后按挂载点字母顺序
        validFs.sort((a, b) => {
            if (a.mount === '/') return -1;
            if (b.mount === '/') return 1;
            return a.mount.localeCompare(b.mount);
        });
        
        // 转换为格式化的磁盘信息
        return validFs.map(fs => ({
            mount: fs.mount,
            fs: fs.fs || 'N/A',
            type: fs.type || 'N/A',
            total: format.formatBytes(fs.size),
            used: format.formatBytes(fs.used),
            available: format.formatBytes(fs.size - fs.used),
            percent: fs.use
        }));
    } catch (error) {
        console.error('获取磁盘信息失败(si.fsSize):', error);
        
        // 尝试使用命令行获取
        try {
            const output = execSync("df -hT | grep -v 'tmpfs\\|devtmpfs\\|squashfs'").toString();
            const lines = output.trim().split('\n');
            
            // 跳过标题行
            const diskData = lines.slice(1).map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 7) {
                    const [fs, type, total, used, avail, percent, mount] = parts;
                    return {
                        mount: mount,
                        fs: fs,
                        type: type,
                        total: total,
                        used: used,
                        available: avail,
                        percent: parseInt(percent.replace('%', '') || '0')
                    };
                }
                return null;
            }).filter(Boolean);
            
            // 排序：首先是根目录，然后按挂载点字母顺序
            diskData.sort((a, b) => {
                if (a.mount === '/') return -1;
                if (b.mount === '/') return 1;
                return a.mount.localeCompare(b.mount);
            });
            
            return diskData;
        } catch (cmdError) {
            console.error('使用命令行获取磁盘信息失败:', cmdError);
            
            // 最后的回退方案：尝试至少获取根目录的信息
            try {
                const rootOutput = execSync("df -h / | awk 'NR==2{print $1,$2,$3,$4,$5,$6}'").toString();
                const [fs, total, used, avail, percent, mount] = rootOutput.trim().split(/\s+/);
                
                return [{
                    mount: mount || '/',
                    fs: fs || 'N/A',
                    type: 'N/A',
                    total: total || 'N/A',
                    used: used || 'N/A',
                    available: avail || 'N/A',
                    percent: parseInt(percent?.replace('%', '') || '0')
                }];
            } catch (e) {
                console.error('获取根目录磁盘信息失败:', e);
                return [];
            }
        }
    }
}

/**
 * 获取系统运行时间
 */
function getUptime() {
    const uptime = os.uptime();
    return {
        seconds: uptime,
        hours: Math.floor(uptime / 3600),
        minutes: Math.floor(uptime % 3600 / 60),
        formatted: format.formatUptime(uptime)
    };
}

/**
 * 获取系统负载信息
 */
async function getLoadInfo() {
    try {
        const load = await si.currentLoad();
        const loadAvg = os.loadavg();
        const cpuCount = os.cpus().length;
        
        return {
            avg1: loadAvg[0].toFixed(2),
            avg5: loadAvg[1].toFixed(2),
            avg15: loadAvg[2].toFixed(2),
            maxLoad: cpuCount,
            safeLoad: (cpuCount * 0.7).toFixed(2) // 安全负载为核心数的70%
        };
    } catch (error) {
        console.error('获取负载信息失败:', error);
        const cpuCount = os.cpus().length;
        return {
            avg1: '0.00',
            avg5: '0.00',
            avg15: '0.00',
            maxLoad: cpuCount,
            safeLoad: (cpuCount * 0.7).toFixed(2)
        };
    }
}

/**
 * 获取网络连接状态描述
 */
function getNetworkStatusDescription(operstate) {
    const statusMap = {
        'up': '已连接 ✓',
        'down': '已断开 ✗',
        'unknown': '未知状态',
        'dormant': '休眠状态',
        'not present': '设备不存在',
        'lower layer down': '底层连接断开',
        'testing': '测试中',
        'middle layer down': '中间层连接断开'
    };
    return statusMap[operstate] || operstate;
}

/**
 * 获取网络类型描述
 */
function getNetworkTypeDescription(type) {
    const typeMap = {
        'wired': '有线网络',
        'wireless': '无线网络',
        'bluetooth': '蓝牙网络',
        'virtual': '虚拟网络',
        'loopback': '回环接口',
        'cellular': '蜂窝网络'
    };
    return typeMap[type] || type;
}

/**
 * 判断是否为虚拟网络接口
 */
function isVirtualInterface(ifaceName) {
    // Docker相关接口
    if (ifaceName.startsWith('docker') || 
        ifaceName.startsWith('br-') || 
        ifaceName.startsWith('veth') || 
        ifaceName === 'lo') {
        return true;
    }
    
    // 其他常见虚拟接口
    const virtualPrefixes = ['virbr', 'vnet', 'tun', 'tap', 'vbox', 'vmnet'];
    return virtualPrefixes.some(prefix => ifaceName.startsWith(prefix));
}

/**
 * 获取单个网络接口的信息
 */
async function getNetworkInterfaceInfo(iface) {
    try {
        // 获取网络统计信息
        let stats = { rx_bytes: 0, tx_bytes: 0 };
        try {
            const networkStats = await si.networkStats(iface.iface);
            if (networkStats && networkStats.length > 0) {
                stats = networkStats[0];
            }
        } catch (statsError) {
            console.error(`获取网卡${iface.iface}统计信息失败:`, statsError);
        }
        
        // 确定网络类型
        let networkType = 'unknown';
        if (iface.type) {
            networkType = iface.type;
        } else if (iface.iface.includes('eth') || iface.iface.includes('en')) {
            networkType = 'wired';
        } else if (iface.iface.includes('wlan') || iface.iface.includes('wi')) {
            networkType = 'wireless';
        } else if (iface.iface.includes('lo')) {
            networkType = 'loopback';
        } else if (isVirtualInterface(iface.iface)) {
            networkType = 'virtual';
        }
        
        // 保存历史数据以便下次计算速率
        const now = Date.now();
        const lastStats = CONFIG.networkHistory[iface.iface] || {
            rx_bytes: stats.rx_bytes || 0,
            tx_bytes: stats.tx_bytes || 0,
            timestamp: now
        };
        
        // 计算速率
        const timeDiff = (now - lastStats.timestamp) / 1000; // 秒
        const rx_sec = timeDiff > 0 ? (stats.rx_bytes - lastStats.rx_bytes) / timeDiff : 0;
        const tx_sec = timeDiff > 0 ? (stats.tx_bytes - lastStats.tx_bytes) / timeDiff : 0;
        
        // 更新历史数据
        CONFIG.networkHistory[iface.iface] = {
            rx_bytes: stats.rx_bytes || 0,
            tx_bytes: stats.tx_bytes || 0,
            timestamp: now
        };
        
        // 确保从systeminformation获取到IP地址，如果没有，则使用os模块
        let ipAddress = iface.ip4 || iface.ip6;
        
        // 如果没有获取到IP地址，尝试从os模块获取
        if (!ipAddress || ipAddress === 'N/A') {
            const osNetworkInterfaces = os.networkInterfaces();
            const osInterface = osNetworkInterfaces[iface.iface];
            
            if (osInterface) {
                const ipv4 = osInterface.find(addr => addr.family === 'IPv4');
                const ipv6 = osInterface.find(addr => addr.family === 'IPv6');
                
                ipAddress = (ipv4 && ipv4.address) || (ipv6 && ipv6.address) || 'N/A';
            }
        }
        
        return {
            interface: iface.iface,
            ip: ipAddress || 'N/A',
            mac: iface.mac || 'N/A',
            type: getNetworkTypeDescription(networkType),
            status: getNetworkStatusDescription(iface.operstate),
            rx: format.formatBytes(rx_sec),
            tx: format.formatBytes(tx_sec),
            rxTotal: format.formatBytes(stats.rx_bytes || 0),
            txTotal: format.formatBytes(stats.tx_bytes || 0)
        };
    } catch (error) {
        console.error(`获取网卡${iface.iface}信息失败:`, error);
        
        // 返回基本信息
        return {
            interface: iface.iface,
            ip: 'N/A',
            mac: iface.mac || 'N/A',
            type: isVirtualInterface(iface.iface) ? '虚拟网络' : '未知类型',
            status: getNetworkStatusDescription(iface.operstate),
            rx: '0 B',
            tx: '0 B',
            rxTotal: '未知',
            txTotal: '未知'
        };
    }
}

/**
 * 获取所有网络接口信息
 */
async function getAllNetworkInfo() {
    try {
        // 获取所有网络接口
        const networkInterfaces = await si.networkInterfaces();
        
        // 过滤掉一些不需要显示的接口
        const validInterfaces = networkInterfaces.filter(iface => 
            iface.iface !== 'lo' && // 排除回环接口
            !iface.internal // 排除内部接口
        );
        
        // 并行获取所有接口的详细信息
        const networkPromises = validInterfaces.map(iface => getNetworkInterfaceInfo(iface));
        const networks = await Promise.all(networkPromises);
        
        return networks;
    } catch (error) {
        console.error('获取所有网络接口信息失败:', error);
        
        // 尝试使用操作系统API获取基本信息
        try {
            const osInterfaces = os.networkInterfaces();
            const interfaceNames = Object.keys(osInterfaces);
            
            const networks = [];
            
            for (const name of interfaceNames) {
                // 跳过回环接口
                if (name === 'lo') continue;
                
                const iface = osInterfaces[name];
                const ipv4 = iface.find(addr => addr.family === 'IPv4');
                const ipv6 = iface.find(addr => addr.family === 'IPv6');
                
                networks.push({
                    interface: name,
                    ip: (ipv4 && ipv4.address) || (ipv6 && ipv6.address) || 'N/A',
                    mac: (ipv4 && ipv4.mac) || (ipv6 && ipv6.mac) || 'N/A',
                    type: isVirtualInterface(name) ? '虚拟网络' : 
                          name.includes('wlan') ? '无线网络' : '有线网络',
                    status: '未知状态',
                    rx: '0 B',
                    tx: '0 B',
                    rxTotal: '未知',
                    txTotal: '未知'
                });
            }
            
            return networks;
        } catch (osError) {
            console.error('使用OS API获取网络信息失败:', osError);
            
            // 尝试使用命令行获取网络接口列表
            try {
                const output = execSync('ip link show | grep -v "link/loopback" | grep -oP "(?<=: )\\w+"').toString();
                const interfaceNames = output.trim().split('\n');
                
                return interfaceNames.map(name => ({
                    interface: name,
                    ip: 'N/A',
                    mac: 'N/A',
                    type: isVirtualInterface(name) ? '虚拟网络' : 
                          name.includes('wlan') ? '无线网络' : '有线网络',
                    status: '未知状态',
                    rx: '0 B',
                    tx: '0 B',
                    rxTotal: '未知',
                    txTotal: '未知'
                }));
            } catch (cmdError) {
                console.error('使用命令行获取网络接口列表失败:', cmdError);
                return [];
            }
        }
    }
}

/**
 * 获取单个主要网络接口信息（向后兼容）
 */
async function getNetworkInfo() {
    try {
        // 获取网络接口
        const networkInterfaces = await si.networkInterfaces();
        
        // 按优先级排序网络接口
        let selectedInterface = null;
        
        // 1. 首先尝试找到配置中的优先接口
        for (const preferredIface of CONFIG.preferredInterfaces) {
            const found = networkInterfaces.find(iface => 
                iface.iface === preferredIface && 
                iface.operstate === 'up'
            );
            
            if (found) {
                selectedInterface = found;
                break;
            }
        }
        
        // 2. 如果没有找到优先接口，尝试找到物理接口（非虚拟）
        if (!selectedInterface) {
            const physicalInterfaces = networkInterfaces.filter(iface => 
                !isVirtualInterface(iface.iface) && 
                iface.operstate === 'up' &&
                !iface.internal
            );
            
            if (physicalInterfaces.length > 0) {
                selectedInterface = physicalInterfaces[0];
            }
        }
        
        // 3. 如果仍然没有找到，尝试任何活动的外部接口
        if (!selectedInterface) {
            const activeInterfaces = networkInterfaces.filter(iface => 
                !iface.internal && iface.operstate === 'up'
            );
            
            if (activeInterfaces.length > 0) {
                selectedInterface = activeInterfaces[0];
            }
        }
        
        // 4. 最后的回退：使用任何接口
        if (!selectedInterface) {
            selectedInterface = networkInterfaces.find(iface => iface.operstate === 'up') || 
                               networkInterfaces[0];
        }
        
        if (!selectedInterface) {
            throw new Error('没有找到可用的网络接口');
        }
        
        return await getNetworkInterfaceInfo(selectedInterface);
    } catch (error) {
        console.error('获取网络信息失败:', error);
        
        return {
            interface: 'N/A',
            ip: 'N/A',
            mac: 'N/A',
            type: 'N/A',
            status: 'N/A',
            rx: '0 B',
            tx: '0 B',
            rxTotal: '未知',
            txTotal: '未知'
        };
    }
}

module.exports = async s => {
    await getSystemInfo(s);
};
