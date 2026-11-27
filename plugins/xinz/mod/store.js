/**
 * mod/store.js —— 插件目录下的轻量数据模块
 * 所有数据落在 plugins/xinz/mod/data/<命名空间>.json，可直接查看/备份/手改
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function safeNs(ns) {
    return String(ns || 'default').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 40);
}
function fileOf(ns) {
    ensureDir();
    return path.join(DATA_DIR, safeNs(ns) + '.json');
}
function readAll(ns) {
    try {
        return JSON.parse(fs.readFileSync(fileOf(ns), 'utf8')) || {};
    } catch (e) {
        return {};
    }
}
function writeAll(ns, obj) {
    const f = fileOf(ns);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, f);
}

async function get(ns, key, def) {
    const all = readAll(ns);
    return key in all ? all[key] : def;
}
async function set(ns, key, val) {
    const all = readAll(ns);
    all[key] = val;
    writeAll(ns, all);
    return true;
}
async function del(ns, key) {
    const all = readAll(ns);
    delete all[key];
    writeAll(ns, all);
    return true;
}
async function keys(ns) {
    return Object.keys(readAll(ns));
}
async function dump(ns) {
    return readAll(ns);
}
async function push(ns, key, item, max) {
    const all = readAll(ns);
    const arr = Array.isArray(all[key]) ? all[key] : [];
    arr.push(item);
    while (max && arr.length > max) arr.shift();
    all[key] = arr;
    writeAll(ns, all);
    return arr;
}

module.exports = { get, set, del, keys, dump, push, DATA_DIR };
