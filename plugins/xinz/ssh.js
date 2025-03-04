/**
 * @author seven
 * @name SSH终端管家
 * @team xinz
 * @version 1.1
 * @description 多主机SSH管理｜智能连接检测｜可视化操作
 * @rule ^(SSH|ssh)$
 * @priority 10000
 * @admin true
 * @disable false
 */

sysMethod.testModule(['ssh2'], { install: true });
const Client = require('ssh2').Client;
const { exec } = require('child_process');

// 设备配置中心
const DEVICES = [
    { 
        name: '🏠 家庭NAS', 
        host: '192.168.0.0', 
        port: 22, 
        username: 'admin', 
        password: 'securePass123',
        icon: '🖥️'
    },
    {
        name: '☁️ 云服务器',
        host: '103.107.198.12',
        port: 58222,
        username: 'root',
        password: 'Cloud@2023',
        icon: '🌐'
    }
];

// 超时配置
const TIMEOUTS = {
    selection: 30,    // 选择超时(秒)
    command: 60,      // 命令输入超时
    connect: 10000    // SSH连接超时(毫秒)
};

module.exports = async s => {
    try {
        // 显示设备菜单
        const device = await selectDevice(s);
        if (!device) return;

        // 连接验证流程
        await verifyConnection(device);
        
        // 进入命令循环
        await commandLoop(s, device);
        
    } catch (error) {
        handleError(s, error);
    }
};

// ========== 核心功能模块 ==========
async function selectDevice(s) {
    const menu = [
        "🔧 可用设备列表",
        "────────────────",
        ...DEVICES.map((d, i) => `${i+1}. ${d.icon} ${d.name}\n   ▸ ${d.host}:${d.port}`),
        "────────────────",
        "输入序号选择设备 (q退出)"
    ].join('\n');

    const choice = await getInput(s, menu, TIMEOUTS.selection);
    const index = parseInt(choice) - 1;
    
    if (isNaN(index) || index < 0 || index >= DEVICES.length) {
        throw new Error('INVALID_DEVICE', `无效设备序号: ${choice}`);
    }
    
    return DEVICES[index];
}

async function verifyConnection(device) {
    const checks = {
        host: await pingHost(device.host),
        auth: await testCredentials(device)
    };

    if (!checks.host) throw new Error('HOST_OFFLINE', `${device.host} 无法访问`);
    if (!checks.auth) throw new Error('AUTH_FAILED', '认证失败');
}

async function commandLoop(s, device) {
    const conn = await createConnection(device);
    
    while (true) {
        const command = await getInput(s, [
            `🚀 ${device.name} 终端就绪`,
            "────────────────",
            "输入 Linux 命令执行",
            "支持多命令用 ; 分隔",
            "────────────────",
            "▸ 输入 'q' 退出会话",
            "▸ 输入 'menu' 返回主菜单"
        ].join('\n'), TIMEOUTS.command);

        if (command.toLowerCase() === 'q') break;
        if (command === 'menu') throw new Error('RETURN_MENU');

        const output = await executeSSH(conn, command);
        await formatOutput(s, output);
    }
    
    conn.end();
}

// ========== SSH 核心服务 ==========
function createConnection(device) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        const timer = setTimeout(() => 
            reject(new Error('CONNECT_TIMEOUT', '连接超时')), 
            TIMEOUTS.connect
        );

        conn.on('ready', () => {
            clearTimeout(timer);
            resolve(conn);
        }).on('error', err => {
            clearTimeout(timer);
            reject(new Error('CONNECTION_FAILED', err.message));
        }).connect(device);
    });
}

function executeSSH(conn, command) {
    return new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
            if (err) return reject(new Error('EXEC_FAILED', err.message));
            
            let output = '';
            stream.on('data', data => output += data)
                  .on('close', () => resolve(output))
                  .stderr.on('data', data => output += `\n[ERROR] ${data}`);
        });
    });
}

// ========== 工具函数模块 ==========
async function getInput(s, prompt, timeout) {
    const reply = await s.reply(prompt);
    const response = await s.waitInput(() => {}, timeout * 1000);
    
    if (!response) throw new Error('INPUT_TIMEOUT');
    return response.getMsg().trim();
}

async function formatOutput(s, output) {
    const MAX_LENGTH = 800;
    const truncated = output.length > MAX_LENGTH 
        ? output.slice(0, MAX_LENGTH) + '\n...（输出已截断）' 
        : output;

    await s.reply([
        "📋 执行结果",
        "────────────────",
        truncated,
        "────────────────",
        `字符数: ${output.length} | 状态: ${output.includes('[ERROR]') ? '❌' : '✅'}`
    ].join('\n'));
}

async function pingHost(host) {
    return new Promise(resolve => {
        exec(`ping -c 1 -W 1 ${host}`, err => resolve(!err));
    });
}

async function testCredentials(device) {
    return new Promise(resolve => {
        const conn = new Client();
        conn.on('ready', () => {
            conn.end();
            resolve(true);
        }).on('error', () => resolve(false))
          .connect(device);
    });
}

function handleError(s, error) {
    const errorMap = {
        'HOST_OFFLINE': `🛑 主机不可达\n${error.message}`,
        'AUTH_FAILED': '🔑 认证失败\n请检查用户名/密码',
        'CONNECT_TIMEOUT': '⏰ 连接超时\n请检查网络或端口配置',
        'INPUT_TIMEOUT': '⏰ 操作超时\n自动返回主菜单'
    };

    const message = errorMap[error.type] || `⚠️ 未知错误\n${error.message}`;
    s.reply([
        "❌ 操作异常",
        "────────────────",
        message,
        "────────────────",
        "错误代码: " + error.type
    ].join('\n'));
}

