/**作者
 * @author xinz&咸鱼
 * @name 容器操作
 * @team xinz&咸鱼
 * @version 1.2
 * @description 增强版容器操作，包含状态显示、资源占用等信息
 * @rule ^(容器操作)$
 * @priority 10000
 * @admin true
 * @disable false
 */

sysMethod.testModule(['ssh2'], { install: true });
const Client = require('ssh2').Client;

// 定义SSH配置为模块级变量，以便各函数访问
const SSH_CONFIG = {
    host: "192.168.3.00",
    port: "22",
    username: "admin",
    password: "password"
};

module.exports = async s => {
    // 获取容器列表及状态信息
    const containerList = await getContainerList(SSH_CONFIG.host, SSH_CONFIG.port, SSH_CONFIG.username, SSH_CONFIG.password);
    if (containerList.length === 0) {
        await s.reply("当前没有可用容器");
        return;
    }

    let isValid = true; // 控制主循环
    while (isValid) {
        // 显示带编号的容器列表及详细信息
        const outputWithNumbers = containerList.map((item, index) => {
            const statusDesc = getStatusDescription(item.Status);
            return `${index + 1}. ${item.Name} [${statusDesc}] 镜像: ${item.Image}`;
        });
        await s.reply("容器列表:\n" + outputWithNumbers.join('\n') + "\nq.退出");

        const command_id = await s.waitInput(async (s) => { }, 30);
        if (command_id === null) return s.reply('超时退出');
        const userInput = command_id.getMsg().toLowerCase();
        if (userInput === 'q') {
            await s.reply('已退出');
            isValid = false;
            continue;
        }

        const content = await getContentByNumber(containerList, userInput);
        if (content !== "序列号超出范围") {
            let userChoice;
            do {
                // 显示当前容器操作菜单
                await s.reply(`\n当前容器: ${content.Name}\n` +
                    `1. 启动\n` +
                    `2. 停止\n` +
                    `3. 重启\n` +
                    `4. 升级\n` +
                    `5. 设置开机启动\n` +
                    `6. 查看详细信息\n` +
                    `q. 退出\n` +
                    `u. 返回`);
                
                const command_eid = await s.waitInput(async (s) => { }, 30);
                if (command_eid === null) return s.reply('超时退出');
                userChoice = command_eid.getMsg().toLowerCase();
                if (userChoice === 'q') {
                    await s.reply('已退出');
                    isValid = false;
                    break;
                }

                let docker_command;
                switch (userChoice) {
                    case "1":
                        docker_command = `docker start ${content.Name}`;
                        break;
                    case "2":
                        docker_command = `docker stop ${content.Name}`;
                        break;
                    case "3":
                        docker_command = `docker restart ${content.Name}`;
                        break;
                    case "4":
                        docker_command = `docker pull ${content.Image} && docker restart ${content.Name}`;
                        break;
                    case "5":
                        docker_command = `docker update --restart=always ${content.Name}`;
                        break;
                    case "6":
                        await showContainerDetails(s, content.Name, SSH_CONFIG);
                        continue; // 查看详情后继续当前循环
                    // 移除了 case "7": 刷新状态
                    case "u":
                        isValid = false;
                        break;
                    default:
                        await s.reply("错误：无效输入，请重新输入。");
                        continue;
                }

                if (userChoice === 'u') {
                    break;
                }

                try {
                    const output = await sshExecCommand(SSH_CONFIG.host, SSH_CONFIG.port, SSH_CONFIG.username, SSH_CONFIG.password, docker_command);
                    const formattedOutput = output.replace(/\n/g, "").replace(/Done/g, "成功");
                    await s.reply("操作结果:\n" + formattedOutput);
                } catch (error) {
                    await s.reply(`操作失败：${error.message}`);
                }

            } while (userChoice !== 'q');
        } else {
            await s.reply("错误：序列号超出范围，请重新输入。");
        }
    }
};

// ================== 核心功能函数 ==================

// 获取容器列表及基本信息
async function getContainerList(host, port, username, password) {
    const listCommand = "docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}'";
    try {
        const output = await sshExecCommand(host, port, username, password, listCommand);
        return output.split('\n').filter(Boolean).map(line => {
            const [name, status, image] = line.split('|').map(s => s.trim());
            return {
                Name: name,
                Status: status,
                Image: image
            };
        });
    } catch (error) {
        throw new Error(`获取容器列表失败：${error.message}`);
    }
}

// 根据编号获取容器内容
async function getContentByNumber(containerList, number) {
    if (number >= 1 && number <= containerList.length) {
        return containerList[number - 1];
    } else {
        return "序列号超出范围";
    }
}

// SSH命令执行
async function sshExecCommand(host, port, username, password, command) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }
                let output = '';
                stream.on('close', (code, signal) => {
                    conn.end();
                    resolve(output);
                }).on('data', (data) => {
                    output += data.toString().trim();
                }).stderr.on('data', (data) => {
                    console.error('STDERR:', data.toString());
                });
            });
        }).connect({ host, port, username, password });
    });
}

// 获取容器状态中文描述
function getStatusDescription(status) {
    if (status.includes('Up')) return '运行中';
    if (status.includes('Exited')) return '已停止';
    if (status.includes('Paused')) return '已暂停';
    return '未知状态';
}

// 显示容器详细信息
async function showContainerDetails(s, containerName, config) {
    try {
        const detailsCommand = `docker inspect --format '{{json .}}' ${containerName}`;
        const output = await sshExecCommand(config.host, config.port, config.username, config.password, detailsCommand);
        const details = JSON.parse(output);
        const statusDesc = getStatusDescription(details.State.Status);

        const detailsMsg = [
            `📦 容器名称: ${containerName}`,
            `🖼️ 镜像版本: ${details.Config.Image}`,
            `📊 运行状态: ${statusDesc}`,
            `📜 创建时间: ${details.State.StartedAt}`,
            `🔗 网络模式: ${JSON.stringify(details.NetworkSettings.Networks)}`
        ].join('\n');

        await s.reply(detailsMsg);
    } catch (error) {
        await s.reply(`获取容器详细信息失败：${error.message}`);
    }
}
}
