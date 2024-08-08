/** 
 * @author seven
 * @name 天气
 * @team xinz
 * @version 1.0.22
 * @description 中文城市自动转英文查询天气
 * @rule ^天气([\s\S]+)$
 * @rule ^([\s\S]+)(天气)$
 * @admin false
 * @public true
 * @priority 9999
 * @disable false
 * @service false
 * @classification ["功能插件"]  
 */

const https = require('https'); // 使用 Node.js 内置的 https 模块

// 中文城市名称与英文名称的映射表
const cityMapping = {
    "北京": "Beijing",
    "上海": "Shanghai",
    "广州": "Guangzhou",
    "深圳": "Shenzhen",
    "天津": "Tianjin",
    "重庆": "Chongqing",
    "杭州": "Hangzhou",
    "南京": "Nanjing",
    "武汉": "Wuhan",
    "成都": "Chengdu",
    "西安": "Xi'an",
    "青岛": "Qingdao",
    "大连": "Dalian",
    "厦门": "Xiamen",
    "郑州": "Zhengzhou",
    "哈尔滨": "Harbin",
    "长沙": "Changsha",
    "苏州": "Suzhou",
    "合肥": "Hefei",
    "福州": "Fuzhou",
    "南宁": "Nanning",
    "石家庄": "Shijiazhuang",
    "济南": "Jinan",
    "昆明": "Kunming",
    "长春": "Changchun",
    "台北": "Taipei",
    "香港": "Hong Kong",
    "澳门": "Macau",
    "洛杉矶": "Los Angeles",
    "纽约": "New York",
    "旧金山": "San Francisco",
    "芝加哥": "Chicago",
    "华盛顿": "Washington",
    "伦敦": "London",
    "巴黎": "Paris",
    "东京": "Tokyo",
    "首尔": "Seoul",
    "新加坡": "Singapore",
    "吉隆坡": "Kuala Lumpur",
    "曼谷": "Bangkok",
    "悉尼": "Sydney",
    "墨尔本": "Melbourne",
    "温哥华": "Vancouver",
    "多伦多": "Toronto",
    "巴西利亚": "Brasilia",
    // 可以继续添加更多城市
};

// 风向转换映射
const windDirectionMapping = {
    "N": "北风",
    "NE": "东北风",
    "E": "东风",
    "SE": "东南风",
    "S": "南风",
    "SW": "西南风",
    "W": "西风",
    "NW": "西北风",
    "ESE": "东南偏东", // 新增翻译
    "NNE": "东北偏北", // 新增翻译
};

// 天气状况翻译映射
const weatherConditionMapping = {
    "Sunny": "晴",
    "Partly cloudy": "局部多云",
    "Cloudy": "多云",
    "Overcast": "阴天",
    "Rain": "雨",
    "Drizzle": "毛毛雨",
    "Thunderstorm": "雷暴",
    "Snow": "雪",
    "Fog": "雾",
    "Patchy rain nearby": "局部降雨", // 新增翻译
};

// 导出模块
module.exports = async s => {
    // 获取用户输入的城市名
    const cityInput = s.param(1).trim();  // 获取输入并去除多余空格

    // 检查是否为中文城市名称并转换为英文
    const city = cityMapping[cityInput] || cityInput; // 如果映射表中存在则转换，否则使用原输入

    // 构造请求 URL
    const apiKey = '去下面地址免费注册获取api'; // 使用您提供的 WeatherAPI API 密钥
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;
    console.log("请求的 URL:", url); // 打印请求的 URL
    console.log("查询的城市名称:", city); // 打印查询的城市名称

    // 发送 HTTPS 请求
    https.get(url, async (response) => {
        let data = '';
        
        // 监听数据接收
        response.on('data', chunk => {
            data += chunk;
        });

        // 监听请求结束
        response.on('end', async () => {
            console.log("接收到的原始数据:", data); // 打印接收到的原始数据
            
            // 尝试解析 JSON 格式
            try {
                const result = JSON.parse(data);
                console.log("解析后的结果:", result); // 打印解析后的结果
                
                // 检查返回的结果
                if (result.error) {
                    // 如果返回的状态码不是 200，说明请求失败
                    await s.reply(`查询失败：${result.error.message}。请检查城市名称是否正确。`);
                    return;
                }

                // 提取天气数据
                const location = result.location.name; // 城市名称
                const temperature = result.current.temp_c; // 温度
                const weather = weatherConditionMapping[result.current.condition.text] || result.current.condition.text; // 天气状况翻译
                const windDirection = windDirectionMapping[result.current.wind_dir] || result.current.wind_dir; // 风向翻译
                const windPower = result.current.wind_kph; // 风速
                const humidity = result.current.humidity; // 湿度
                const reportTime = result.current.last_updated; // 发布时间

                // 格式化返回信息为中文标准
                const weatherReport = `地区：${location}（${cityInput}）\n` + // 显示原输入城市名称
                                      `温度：${temperature}°C\n` +
                                      `天气状况：${weather}\n` +
                                      `风向：${windDirection}\n` +  // 这里使用了中文风向
                                      `风速：${windPower}公里/小时\n` +
                                      `湿度：${humidity}%\n` +
                                      `发布时间：${reportTime}`;

                // 发送天气信息
                await s.reply(weatherReport);
            } catch (error) {
                console.error("解析错误:", error);
                console.error("接收到的数据:", data); // 打印接收到的数据用于调试
                await s.reply("解析天气数据失败，请稍后再试。");
            }
        });
    }).on('error', async (error) => {
        console.error("请求错误:", error);
        await s.reply("天气查询失败，请稍后再试。");
    });

    // 插件运行结束时，如果返回 'next'，则继续向下匹配插件，否则只运行当前插件
    return 'next';  // 继续向下匹配插件
}
