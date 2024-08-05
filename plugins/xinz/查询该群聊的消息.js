/**
 * @author zhu
 * @name 上一条消息
 * @team xinz
 * @version v1.0.0
 * @description 注意：该插件需要配合存储所有消息使用。
 * @create_at 2023-01-24 21:24:15
 * @rule ^上([\s\S]+)条消息$
 * @priority 1
 * @admin flase
 * @public false
 * @disable false
 */


module.exports = async s => {
    console.log("查询上" + s.param(1) + "条消息")
    await sysMethod.testModule(['sqlite3'], {install: true});
    const sqlite3 = require('sqlite3').verbose();
    const db = await new sqlite3.Database(__dirname + '/聊天记录/message.db', (err) => {
        if (err) {
            console.error('打开数据库失败:', err.message);
        } else {
            // 检查数据库是否存在
            db.serialize(() => {
                db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='msg'", async (err, row) => {
                    if (row === undefined) {
                        // 如果表不存在，则创建表
                        db.run(`CREATE TABLE msg
                                (
                                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                                    time       TEXT,
                                    "from"     TEXT,
                                    groundName TEXT,
                                    groundId   INTEGER,
                                    userName   TEXT,
                                    userId     INTEGER,
                                    content    TEXT,
                                    msgId      TEXT
                                )`, (err) => {
                            if (err) {
                                console.error('数据表创建失败:', err.message);
                            } else {
                                console.log('数据表创建成功.');
                            }
                        });
                    } else {
                        console.log('Table "msg" already exists.');
                        if (s.getGroupId() == "0") {
                            console.log("私聊查询")
                            var whereClause = 'userId = ?';
                            var params = s.getUserId();
                        } else {
                            console.log("群聊查询")
                            var whereClause = 'groundId = ?';
                            var params = s.getGroupId();
                        }
                        db.all(`SELECT *
                                FROM msg
                                WHERE ${whereClause}`, params, (err, rows) => {
                            if (err) {
                                console.error('Error querying data:', err.message);
                            } else {
                                console.log(`Data in "msg" table with WHERE clause (${whereClause}):`);
                                console.log(rows[rows.length - 2])
                                redata = ""
                                n = 0
                                for (var i = rows.length - 2; i > 0; i--) {
                                    const sqldata = rows[i]
                                    //   console.log(sqldata)
                                    redata += `记录ID:${sqldata.id}\n` +
                                        `发送时间:${sqldata.time}\n` +
                                        `消息来源:${sqldata.from}\n` +
                                        `群聊名称:${sqldata.groundName}\n` +
                                        `群聊ID:${sqldata.groundId}\n` +
                                        `用户昵称:${sqldata.userName}\n` +
                                        `用户ID:${sqldata.userId}\n` +
                                        `消息内容:${sqldata.content}\n` +
                                        `消息ID:${sqldata.msgId}\n` +
                                        "**************************\n"
                                    if (n == Number(s.param(1) - 1)) {
                                        break
                                    }
                                    if (n > 10) {
                                        break
                                    }
                                    n++
                                }
                                s.reply(redata)
                            }
                        });
                    }
                });
            });
            // 关闭数据库连接
            db.close();
        }
    });

    // console.log(qqb)
}
