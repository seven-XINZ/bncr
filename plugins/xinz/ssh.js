/**作者
 * @author seven
 * @name s
 * @team xi
 * @version 1.0
 * @description 测试
 * @rule ^(SSH|ssh)$
 * @priority 10000
 * @admin true
 * @public true
 * @disable false
 * @classification ["功能插件"]  
 */

// 引入所需的 SSH2 模块和 child_process 模块
sysMethod.testModule(['ssh2'], { install: true });
const Client = require('ssh2').Client;
const { exec } = require('child_process');

// 定义设备列表，每个设备包含名称、主机地址、端口、用户名和密码
const devices = [
    { name: '设备1', host: '', port: 22, username: ' ', password: ' ' },
    { name: '设备2', host: '', port: 22, username: ' ', password: ' ' },
    // 可以在此添加更多设备
];

module.exports = async s => {
    // 显示设备选择菜单
    await s.reply("请选择设备:\n" + devices.map((d, index) => `${index + 1}: ${d.name}`).join('\n'));

    // 等待用户输入设备选择
    let deviceChoice = await s.waitInput(async (s) => { }, 30);
    if (deviceChoice === null) return s.reply('超时退出');

    // 解析用户输入的设备索引
    const deviceIndex = parseInt(deviceChoice.getMsg()) - 1;

    // 检查用户输入的索引是否有效
    if (deviceIndex < 0 || deviceIndex >= devices.length) {
        return s.reply('无效选择');
    }

    // 获取所选设备的连接信息
    const { host, port, username, password } = devices[deviceIndex];

    // 验证主机是否在线
    if (!(await isHostOnline(host))) {
        return s.reply(`主机 ${host} 不可达，请检查网络连接。`);
    }

    // 验证用户名和密码是否正确
    const isValidCredentials = await validateCredentials(host, port, username, password);
    if (!isValidCredentials) {
        return s.reply(`用户名或密码错误，请检查并重试。`);
    }

    await s.reply("请输入ssh命令(发送'q'退出)");

    // 等待用户输入 SSH 命令
    let command_id = await s.waitInput(async (s) => { }, 30);
    if (command_id === null) return s.reply('超时退出');
    command_id = command_id.getMsg();
    if (command_id === 'q') return s.reply('已退出');

    // 执行 SSH 命令并获取输出
    const output = await sshExecCommand(host, port, username, password, command_id);
    const formattedOutput = output.replace(/\n/g, "").replace(/Done/g, "成功");
    await s.reply("操作结果:\n" + formattedOutput);

    // 定义 SSH 命令执行的函数
    async function sshExecCommand(host, port, username, password, command) {
        return new Promise((resolve, reject) => {
            const conn = new Client();
            conn.on('ready', () => {
                // 当连接准备好后，执行命令
                conn.exec(command, (err, stream) => {
                    if (err) {
                        reject(err); // 如果有错误，拒绝 Promise
                        return;
                    }
                    let output = '';
                    stream.on('close', (code, signal) => {
                        conn.end(); // 关闭连接
                        resolve(output); // 解析 Promise，返回输出
                    }).on('data', (data) => {
                        output += data.toString().trim(); // 收集输出数据
                    }).stderr.on('data', (data) => {
                        console.error('STDERR: ' + data); // 处理错误输出
                    });
                });
            }).connect({ host, port, username, password }); // 连接到 SSH 服务器
        });
    }

    // 检查主机是否在线
    async function isHostOnline(host) {
        return new Promise((resolve) => {
            exec(`ping -c 1 ${host}`, (error) => {
                resolve(!error); // 如果没有错误，主机在线
            });
        });
    }

    // 验证用户名和密码是否正确
    async function validateCredentials(host, port, username, password) {
        return new Promise((resolve) => {
            const conn = new Client();
            conn.on('ready', () => {
                conn.exec('whoami', (err) => {
                    conn.end(); // 关闭连接
                    resolve(!err); // 如果没有错误，凭据有效
                });
            }).connect({ host, port, username, password });
            conn.on('error', () => {
                resolve(false); // 如果连接错误，凭据无效
            });
        });
    }
}
