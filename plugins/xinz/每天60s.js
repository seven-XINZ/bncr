/**
 *  @author seven
 *  @name 每天60s
 *  @team xinz
 *  @version 1.0.0
 *  @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty
 *  @description 60秒读懂世界
 *  @rule ^(60s)$
 *  @admin false
 *  @public false
 *  @priority 99999
 *  @disable false
 *  @cron 0 10 9 * * *
 */

module.exports = async s => {
	//填写定时要发送的平台
	var platform = 'qq'
	//填写定时要发送的群id
	var groupid='376940436'
	//填写定时要发送的用户id
	var userid='536576656e'
	//s.delMsg(s.getMsgId(), { wait: 1})
	const axios = require('axios').default
	let url = "https://api.vvhan.com/api/60s"
	let res = await axios.request({
		url: url,
		family: 4,
		//timeout: 1000,
		method: 'get',
		json: true
	})
	//console.log(res.data)
	let title = res.data.title.replace(/在这里每天/g, "")
	let todaydate = res.data.time
	let datalength = res.data.data.size
	//let info = res.data.data
	let info = await displayDataWithIndex(res.data.data)
	let result = res.data
	let msg_60s = "【" + todaydate + "】" + title + "\n" + info
	//console.log(info)
	//console.log(res.data)
	if(s.getFrom() == "cron") {
			sysMethod.push({
				platform: platform,
				groupId: groupid,
				userId: userid,
				msg: msg_60s
			})
	}
	else {
		await s.reply(msg_60s)	
		//console.log(msg_60s)
	}
};
async function displayDataWithIndex(data) {
  let result = "";
  data.forEach((item, index) => {
    // 去除字符串中的 "undefined"
    item = item.replace(/undefined/g, "");
    result += `${index + 1}. ${item}\n`;
  });
  return result;
}