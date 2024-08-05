/** 
 * @name 各种小姐姐视频
 * @rule ^(吊带|丝滑舞蹈|小姐姐|美女穿搭|鞠婧祎|完美身材|杀猪饲料|章若楠|古风|玉足|慢摇|清纯|COS|纯情女高|萝莉|欲梦|甜妹|jk|热舞)$
 * @admin false
 * @public false
 * @author zhu
 * @origin zhu
 * @Github https://github.com/Mrzqd
 * @version 1.0.0
 * @disable false
 * @priority 100
 * @create_at 2023-08-06 16:42:58
 * @Description 暂无描述
 * @LastEditTime 2023-08-06 20:02:55
 * @Copyright Copyright (c) 2023 by zhu, All Rights Reserved.
 */
const request = require('util').promisify(require('request'));

module.exports = async s => {
    var USER_AGENT_Browser = [
        'Mozilla/5.0 (Linux; U; Android 7.1.1; zh-cn; OPPO A73 Build/N6F26Q) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/70.0.3538.80 Mobile Safari/537.36 HeyTapBrowser/10.7.29.2',
        'Mozilla/5.0 (Linux; Android 7.1.1; vivo X20Plus A Build/NMF26X; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/10.2.10.0',
        'Mozilla/5.0 (Linux; U; Android 7.0; zh-cn; HUAWEI CAZ-AL10 Build/HUAWEICAZ-AL10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045817',
        'Mozilla/5.0 (Linux; Android 7.0; Redmi Note 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 7.1.2; zh-cn; vivo X9L Build/N2G47H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045817',
        'Mozilla/5.0 (Linux; Android 7.1.2; vivo Y66i Build/N2G47H; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/10.2.10.0',
        'Mozilla/5.0 (Linux; Android 7.1.2; vivo X9 Build/N2G47H; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/10.2.11.4',
        'Mozilla/5.0 (Linux; U; Android 7.1.1; zh-cn; vivo Y75A Build/N6F26Q) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045816',
        'Mozilla/5.0 (Linux; Android 7.1.1; OD105 Build/NMF26F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043409 Safari/537.36 MicroMessenger/6.5.13.1100 NetType/WIFI Language/zh_CN',
        'Mozilla/5.0 (Linux; Android 7.1.1; OPPO A83t Build/N6F26Q; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/62.0.3202.84 Mobile Safari/537.36 iThunder;thirdChannel_SHOUJIXUNLEI/7.32.0.7705 xl_cloud statusBarHeight/36 statusBarHeightDp/18.0',
        'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-CN; V1818CA Build/O11019) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.6.0.1140 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 8.1.0; vivo Y83A Build/O11019; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/9.9.10.0',
        'Mozilla/5.0 (Linux; U; Android 8.0.0; zh-CN; VIE-AL10 Build/HUAWEIVIE-AL10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.6.0.1140 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; SM-N9600 Build/M1AJQ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045816',
        'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; DUB-AL00 Build/HUAWEIDUB-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045817',
        'Mozilla/5.0 (Linux; Android 8.0.0; BLN-AL10; HMSCore 6.1.0.313; GMSCore 17.4.55) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.105 HuaweiBrowser/11.1.5.320 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 8.0.0; zh-cn; Mi Note 2 Build/OPR1.170623.032) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.116 Mobile Safari/537.36 XiaoMi/MiuiBrowser/15.4.12',
        'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; vivo X20A Build/OPM1.171019.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045730',
        'Mozilla/5.0 (Linux; Android 8.1.0; V1818A Build/OPM1.171019.026; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/9.8.53.0',
        'Mozilla/5.0 (Linux; U; Android 8.0.0; zh-cn; SM-G9300 Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045816',
        'Mozilla/5.0 (Linux; U; Android 9; en-US; SM-G950F Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 9; zh-cn; RVL-AL09 Build/HUAWEIRVL-AL09) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.126 MQQBrowser/10.7 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 9; zh-cn; PDBM00 Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/11.9 Mobile Safari/537.36 COVC/045709',
        'Mozilla/5.0 (Linux; Android 9; INE-AL00; HMSCore 6.1.0.313; GMSCore 19.6.29) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.93 HuaweiBrowser/11.1.5.310 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 9; V1913A Build/P00610; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36 VivoBrowser/10.2.11.6',
        'Mozilla/5.0 (Linux; Android 9; V1934A Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/68.0.3440.91 Mobile Safari/537.36 iThunder;thirdChannel_SHOUJIXUNLEI/7.09.2.7123 xl_cloud',
        'Mozilla/5.0 (Linux; U; Android 9; zh-cn; MI 6X Build/PKQ1.180904.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.116 Mobile Safari/537.36 XiaoMi/MiuiBrowser/15.4.12',
        'Mozilla/5.0 (Linux; Android 9; Mi Note 3 Build/PKQ1.181007.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/80.0.3987.99 Mobile Safari/537.36 iThunder;thirdChannel_SHOUJIXUNLEI/7.32.0.7705 xl_cloud statusBarHeight/66 statusBarHeightDp/24.0',
        'Mozilla/5.0 (Linux; U; Android 9; zh-cn; LLD-AL30 Build/HONORLLD-AL30) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.72 MQQBrowser/12.0 Mobile Safari/537.36 COVC/045817',
        'Mozilla/5.0 (Linux; Android 9; COL-AL10; HMSCore 6.1.0.305; GMSCore 17.7.85) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.93 HuaweiBrowser/11.1.4.301 Mobile Safari/537.36'
    ]
    let url = ""
    switch(s.getMsg()){
        case "吊带":
            url = "http://api.yujn.cn/api/diaodai.php"
            break;
        case "丝滑舞蹈":
            url = "http://api.yujn.cn/api/shwd.php"
            break;
        case "小姐姐":
            url = "http://api.yujn.cn/api/zzxjj.php"
            break;
        case "美女穿搭":
            url = "http://api.yujn.cn/api/chuanda.php"
            break;
        case "鞠婧祎":
            url = "http://api.yujn.cn/api/jjy.php"
            break;
        case "完美身材":
            url = "http://api.yujn.cn/api/wmsc.php"
            break;
        case "杀猪饲料":
            url = "http://api.yujn.cn/api/shejie.php"
            break;
        case "章若楠":
            url = "http://api.yujn.cn/api/zrn.php"
            break;
        case "古风":
            url = "http://api.yujn.cn/api/hanfu.php"
            break;
        case "玉足":
            let a = "http://api.yujn.cn/api/jpmt.php"
            let b = "http://api.yujn.cn/api/yuzu.php"
            url = Math.random() > 0.5 ? a : b
            break;
        case "慢摇":
            url = "http://api.yujn.cn/api/manyao.php"
            break;
        case "清纯":
            url = "http://api.yujn.cn/api/qingchun.php"
            break;
        case "COS":
            url = "http://api.yujn.cn/api/COS.php"
            break;
        case "纯情女高":
            url = "http://api.yujn.cn/api/nvgao.php"
            break;
        case "萝莉":
            url = "http://api.yujn.cn/api/luoli.php"
            break;
        case "欲梦":
            url = "http://api.yujn.cn/api/ndym.php"
            break;
        case "甜妹":
            url = "http://api.yujn.cn/api/tianmei.php"
            break;
        case "jk":
            url = "http://api.yujn.cn/api/jksp.php"
            break;
        case "热舞":
            url = "http://api.yujn.cn/api/rewu.php"
            break;
    }
    opt = {
        url,
        headers:{
            "User-Agent":USER_AGENT_Browser[Math.floor(Math.random() * USER_AGENT_Browser.length)]
        },
        followRedirect:false
    }
    const r = await request(opt)
    // console.log(r.headers)
    s.reply({
        type:"video",
        path:r.headers.location
    })
    
}
