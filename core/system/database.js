import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = path.join(process.cwd(), 'core', 'database.db');
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -32000");
db.exec("PRAGMA busy_timeout = 5000");

const stmts = {};
function stmt(sql) {
  if (!stmts[sql]) stmts[sql] = db.prepare(sql);
  return stmts[sql];
}

class TtlCache {
  map = new Map();
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > entry.ttl) { this.map.delete(key); return undefined; }
    return entry.data;
  }
  set(key, data, ttl) {
    this.map.set(key, { data, ts: Date.now(), ttl });
  }
  delete(key) { this.map.delete(key); }
  deletePrefix(prefix) {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
  clear() { this.map.clear(); }
  startGC(intervalMs = 120000) {
    const id = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.map) if (now - v.ts > v.ttl) this.map.delete(k);
    }, intervalMs);
    id.unref?.();
    return id;
  }
}

const memCache = new TtlCache();
memCache.startGC();
const USER_CACHE_TTL = 600000;
const CHAT_CACHE_TTL = 600000;
const CHATUSER_CACHE_TTL = 600000;
const SET_CACHE_TTL = 300000;
const CHAR_CACHE_TTL = 600000;
const STICKERPACK_CACHE_TTL = 600000;

function toStore(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val;
}

function parseJSON(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function getCacheKey(type, id) {
  return `${type}:${id}`;
}

export const defUser = {
  name: '',
  exp: 0,
  level: 0,
  usedcommands: 0,
  pasatiempo: '',
  description: '',
  marry: '',
  genre: '',
  birth: '',
  metadatos: null,
  metadatos2: null
};

export const defChat = {
  isBanned: 0,
  welcome: 0,
  goodbye: 0,
  sWelcome: '',
  sGoodbye: '',
  nsfw: 0,
  alerts: 1,
  gacha: 1,
  economy: 1,
  adminonly: 0,
  primaryBot: null,
  antilinks: 1,
  antistatus: 0,
  rolls: '{}'
};

export const defChatUser = {
  coins: 0,
  bank: 0,
  lastCmd: 0,
  usedTime: null,
  afk: -1,
  afkReason: '',
  health: 100,
  stamina: 100,
  magic: 100,
  characters: '[]',
  stats: '{}'
};

export const defSets = {
  self: 0,
  prefix: '[\"/\",\"!\",\".\",\"#\"]',
  commandsejecut: 0,
  newsletter_id: '120363401404146384@newsletter',
  nameid: 'ೃ࿔ ყµҡเ ωαɓσƭร - σƒƒเ૮เαℓ ૮ɦαɳɳεℓ .ೃ࿐',
  type: 'Owner',
  link: 'https://api.yuki-wabot.my.id',
  banner: 'https://cdn.yuki-wabot.my.id/files/tCVD.jpeg',
  icon: 'https://cdn.yuki-wabot.my.id/files/4U5V.jpeg',
  currency: 'Yenes',
  namebot: 'Yuki',
  botname: 'Yuki Suou',
  owner: ''
};

export const defStickerPack = {
  packs: '[]'
};

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      exp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      usedcommands INTEGER DEFAULT 0,
      pasatiempo TEXT DEFAULT '',
      description TEXT DEFAULT '',
      marry TEXT DEFAULT '',
      genre TEXT DEFAULT '',
      birth TEXT DEFAULT '',
      metadatos TEXT,
      metadatos2 TEXT
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      isBanned BOOLEAN DEFAULT 0,
      welcome BOOLEAN DEFAULT 0,
      goodbye BOOLEAN DEFAULT 0,
      sWelcome TEXT DEFAULT '',
      sGoodbye TEXT DEFAULT '',
      nsfw BOOLEAN DEFAULT 0,
      alerts BOOLEAN DEFAULT 1,
      gacha BOOLEAN DEFAULT 1,
      economy BOOLEAN DEFAULT 1,
      adminonly BOOLEAN DEFAULT 0,
      primaryBot TEXT,
      antilinks BOOLEAN DEFAULT 1,
      antistatus BOOLEAN DEFAULT 0,
      rolls TEXT DEFAULT '{}'
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_users (
      chat_id TEXT,
      user_id TEXT,
      coins INTEGER DEFAULT 0,
      bank INTEGER DEFAULT 0,
      lastCmd INTEGER DEFAULT 0,
      usedTime TEXT,
      afk INTEGER DEFAULT -1,
      afkReason TEXT DEFAULT '',
      health INTEGER DEFAULT 100,
      stamina INTEGER DEFAULT 100,
      magic INTEGER DEFAULT 100,
      characters TEXT DEFAULT '[]',
      stats TEXT DEFAULT '{}',
      PRIMARY KEY (chat_id, user_id)
    )`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      self BOOLEAN DEFAULT 0,
      prefix TEXT DEFAULT '[\"/\",\"!\",\".\",\"#\"]',
      commandsejecut INTEGER DEFAULT 0,
      newsletter_id TEXT DEFAULT '120363401404146384@newsletter',
      nameid TEXT DEFAULT 'ೃ࿔ ყµҡเ ωαɓσƭร - σƒƒเ૮เαℓ ૮ɦαɳɳεℓ .ೃ࿐',
      type TEXT DEFAULT 'Owner',
      link TEXT DEFAULT 'https://api.yuki-wabot.my.id',
      banner TEXT DEFAULT 'https://cdn.yuki-wabot.my.id/files/tCVD.jpeg',
      icon TEXT DEFAULT 'https://cdn.yuki-wabot.my.id/files/4U5V.jpeg',
      currency TEXT DEFAULT 'Yenes',
      namebot TEXT DEFAULT 'Yuki',
      botname TEXT DEFAULT 'Yuki Suou',
      owner TEXT DEFAULT ''
    )`);
  db.exec(`CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, packs TEXT DEFAULT '[]')`);
}

export function getUser(id, opt = {}) {
  if (!id) {
    const { orderBy, limit = null, desc = true } = opt;
    if (orderBy) {
      const allowedCols = ['exp', 'level', 'usedcommands', 'name'];
      if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
      let q = `SELECT * FROM users ORDER BY ${orderBy} ${desc ? 'DESC' : 'ASC'}`;
      if (limit) q += ` LIMIT ${limit}`;
      return stmt(q).all();
    }
    return stmt('SELECT * FROM users').all();
  }
  const key = getCacheKey('user', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let user = stmt('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    stmt(`INSERT OR IGNORE INTO users (id, name, exp, level, usedcommands, pasatiempo, description, marry, genre, birth, metadatos, metadatos2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defUser.name, defUser.exp, defUser.level, defUser.usedcommands, defUser.pasatiempo, defUser.description, defUser.marry, defUser.genre, defUser.birth, defUser.metadatos, defUser.metadatos2);
    user = stmt('SELECT * FROM users WHERE id = ?').get(id);
  }
  if (user.metadatos) { try { user.metadatos = JSON.parse(user.metadatos); } catch {} }
  if (user.metadatos2) { try { user.metadatos2 = JSON.parse(user.metadatos2); } catch {} }
  memCache.set(key, user, USER_CACHE_TTL);
  return user;
}

export function setUser(id, field, val) {
  const user = stmt('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return;
  memCache.delete(getCacheKey('user', id));
  return stmt(`UPDATE users SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

export function getChat(id) {
  if (!id) return stmt('SELECT * FROM chats').all();
  const key = getCacheKey('chat', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
  if (!chat) {
    stmt(`INSERT OR IGNORE INTO chats (id, isBanned, welcome, goodbye, sWelcome, sGoodbye, nsfw, alerts, gacha, economy, adminonly, primaryBot, antilinks, antistatus, rolls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defChat.isBanned, defChat.welcome, defChat.goodbye, defChat.sWelcome, defChat.sGoodbye, defChat.nsfw, defChat.alerts, defChat.gacha, defChat.economy, defChat.adminonly, defChat.primaryBot, defChat.antilinks, defChat.antistatus, defChat.rolls);
    chat = stmt('SELECT * FROM chats WHERE id = ?').get(id);
  }
  chat.rolls = parseJSON(chat.rolls, {});
  memCache.set(key, chat, CHAT_CACHE_TTL);
  return chat;
}

export function setChat(id, field, val) {
  const chat = stmt('SELECT id FROM chats WHERE id = ?').get(id);
  if (!chat) return;
  memCache.delete(getCacheKey('chat', id));
  return stmt(`UPDATE chats SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

export function getChatUser(chatId, userId, opt = {}) {
  if (!chatId) {
    return stmt('SELECT * FROM chat_users').all().map(u => {
      u.characters = parseJSON(u.characters, []);
      u.stats = parseJSON(u.stats, {});
      return u;
    });
  }
  if (chatId && !userId) {
    const { orderBy, limit = null, desc = true } = opt;
    let query = 'SELECT * FROM chat_users WHERE chat_id = ?';
    const params = [chatId];
    if (orderBy) {
      const allowedCols = ['coins', 'bank', 'lastCmd', 'usedTime', 'afk', 'health', 'stamina', 'magic'];
      if (!allowedCols.includes(orderBy)) throw new Error('Columna no permitida');
      query += ` ORDER BY ${orderBy} ${desc ? 'DESC' : 'ASC'}`;
    }
    if (limit) { query += ' LIMIT ?'; params.push(limit); }
    return stmt(query).all(...params).map(u => {
      u.characters = parseJSON(u.characters, []);
      u.stats = parseJSON(u.stats, {});
      return u;
    });
  }
  const key = getCacheKey('chatuser', `${chatId}:${userId}`);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  if (!cu) {
    stmt(`INSERT OR IGNORE INTO chat_users (chat_id, user_id, coins, bank, lastCmd, usedTime, afk, afkReason, health, stamina, magic, characters, stats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(chatId, userId, defChatUser.coins, defChatUser.bank, defChatUser.lastCmd, defChatUser.usedTime, defChatUser.afk, defChatUser.afkReason, defChatUser.health, defChatUser.stamina, defChatUser.magic, defChatUser.characters, defChatUser.stats);
    cu = stmt('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
  }
  if (cu) {
    cu.characters = parseJSON(cu.characters, []);
    cu.stats = parseJSON(cu.stats, {});
    memCache.set(key, cu, CHATUSER_CACHE_TTL);
  }
  return cu;
}

export function setChatUser(chatId, userId, field, val) {
  memCache.delete(getCacheKey('chatuser', `${chatId}:${userId}`));
  return stmt(`UPDATE chat_users SET ${field} = ? WHERE chat_id = ? AND user_id = ?`).run(toStore(val), chatId, userId);
}

export function getSettings(id) {
  if (!id) {
    return stmt('SELECT * FROM settings').all().map(row => {
      row.prefix = parseJSON(row.prefix, []);
      return row;
    });
  }
  const key = getCacheKey('set', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
  if (!row) {
    stmt(`INSERT OR IGNORE INTO settings (id, self, prefix, commandsejecut, newsletter_id, nameid, type, link, banner, icon, currency, namebot, botname, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, defSets.self, defSets.prefix, defSets.commandsejecut, defSets.newsletter_id, defSets.nameid, defSets.type, defSets.link, defSets.banner, defSets.icon, defSets.currency, defSets.namebot, defSets.botname, defSets.owner);
    row = stmt('SELECT * FROM settings WHERE id = ?').get(id);
  }
  if (row.prefix != null) {
    try { row.prefix = JSON.parse(row.prefix); }
    catch { row.prefix = row.prefix === 'true' || row.prefix === '1' ? true : []; }
  }
  memCache.set(key, row, SET_CACHE_TTL);
  return row;
}

export function setSettings(id, field, val) {
  const setting = stmt('SELECT id FROM settings WHERE id = ?').get(id);
  if (!setting) return;
  memCache.delete(getCacheKey('set', id));
  let stored = val;
  if (val === true) stored = "1";
  else if (Array.isArray(val) || typeof val === 'object') stored = JSON.stringify(val);
  return stmt(`UPDATE settings SET ${field} = ? WHERE id = ?`).run(stored, id);
}

export function getCharacter(id) {
  const key = getCacheKey('char', id || 'all');
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  if (!id) {
    const rows = stmt('SELECT id, data FROM characters').all();
    const characters = {};
    for (const row of rows) { characters[row.id] = parseJSON(row.data, row.data); }
    memCache.set(key, characters, CHAR_CACHE_TTL);
    return characters;
  }
  const row = stmt('SELECT data FROM characters WHERE id = ?').get(id);
  if (!row) return null;
  const data = parseJSON(row.data, row.data);
  memCache.set(key, data, CHAR_CACHE_TTL);
  return data;
}

export function setCharacter(id, data) {
  memCache.delete(getCacheKey('char', id));
  stmt('REPLACE INTO characters (id, data) VALUES (?, ?)').run(id, toStore(data));
  return true;
}

export function getStickersPack(id) {
  if (!id) return stmt('SELECT * FROM sticker_packs').all();
  const key = getCacheKey('stickerpack', id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
  if (!stickerPack) {
    stmt(`INSERT OR IGNORE INTO sticker_packs (id, packs) VALUES (?, ?)`).run(id, defStickerPack.packs);
    stickerPack = stmt('SELECT * FROM sticker_packs WHERE id = ?').get(id);
  }
  stickerPack.packs = parseJSON(stickerPack.packs, []);
  memCache.set(key, stickerPack, STICKERPACK_CACHE_TTL);
  return stickerPack;
}

export function setStickersPack(id, field, val) {
  const stickerPack = stmt('SELECT id FROM sticker_packs WHERE id = ?').get(id);
  if (!stickerPack) return;
  memCache.delete(getCacheKey('stickerpack', id));
  return stmt(`UPDATE sticker_packs SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

export function deletedb(type, ...ids) {
  if (!type || !ids || ids.length === 0) return false;
  switch (type) {
    case 'user':       memCache.delete(getCacheKey('user', ids[0]));        return stmt('DELETE FROM users WHERE id = ?').run(ids[0]).changes > 0;
    case 'chat':       memCache.delete(getCacheKey('chat', ids[0]));        return stmt('DELETE FROM chats WHERE id = ?').run(ids[0]).changes > 0;
    case 'chatuser':
      if (ids.length < 2) return false;
      memCache.delete(getCacheKey('chatuser', `${ids[0]}:${ids[1]}`));
      return stmt('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?').run(ids[0], ids[1]).changes > 0;
    case 'settings':   memCache.delete(getCacheKey('set', ids[0]));         return stmt('DELETE FROM settings WHERE id = ?').run(ids[0]).changes > 0;
    case 'character':  memCache.delete(getCacheKey('char', ids[0]));        return stmt('DELETE FROM characters WHERE id = ?').run(ids[0]).changes > 0;
    case 'stickerpack': memCache.delete(getCacheKey('stickerpack', ids[0])); return stmt('DELETE FROM sticker_packs WHERE id = ?').run(ids[0]).changes > 0;
    default: return false;
  }
}

export function setCreate(table, identifier, field, value) {
  const tableConfig = { users: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['metadatos', 'metadatos2'] }, chats: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['rolls'] }, chat_users: { primaryKeys: ['chat_id', 'user_id'], identifierFields: ['chat_id', 'user_id'], jsonFields: ['characters', 'stats'] }, settings: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['prefix'] }, characters: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: [], isSimpleTable: true }, sticker_packs: { primaryKeys: ['id'], identifierFields: ['id'], jsonFields: ['packs'] } };
  const config = tableConfig[table];
  if (!config) throw new Error(`Tabla '${table}' no soportada`);
  if (config.isSimpleTable) {
    let existingData = getCharacter(identifier);
    if (!existingData) {
      setCharacter(identifier, { [field]: value });
      return value;
    }
    if (existingData[field] === undefined) {
      setCharacter(identifier, { ...existingData, [field]: value });
      return value;
    }
    return existingData[field];
  }
  const columnExists = (tableName, columnName) => {
    try {
      return stmt(`PRAGMA table_info(${tableName})`).all().some(col => col.name === columnName);
    } catch { return false; }
  };
  if (!columnExists(table, field)) {
    const sqlType = typeof value === 'number' ? 'INTEGER' : typeof value === 'boolean' ? 'BOOLEAN' : 'TEXT';
    let defaultVal = "''";
    if (typeof value === 'number' || typeof value === 'boolean') defaultVal = '0';
    else if (Array.isArray(value)) defaultVal = "'[]'";
    else if (typeof value === 'object' && value !== null) defaultVal = "'{}'";
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${sqlType} DEFAULT ${defaultVal}`);
    for (const k of Object.keys(stmts).filter(k => k.includes(table))) {
      try { stmts[k].finalize(); } catch {}
      delete stmts[k];
    }
  }
  if (table === 'chat_users') {
    if (!Array.isArray(identifier) || identifier.length < 2) throw new Error('chat_users requiere [chatId, userId]');
    const [chatId, userId] = identifier;
    const record = getChatUser(chatId, userId);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO chat_users (chat_id, user_id, ${field}) VALUES (?, ?, ?)`).run(chatId, userId, value);
      clearCache('chatuser', `${chatId}:${userId}`);
      return value;
    }
    if (record[field] === undefined) { setChatUser(chatId, userId, field, value); return value; }
    return record[field];
  } else if (table === 'users') {
    const record = getUser(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO users (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('user', identifier);
      return value;
    }
    if (record[field] === undefined) { setUser(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'chats') {
    const record = getChat(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO chats (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('chat', identifier);
      return value;
    }
    if (record[field] === undefined) { setChat(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'settings') {
    const record = getSettings(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO settings (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('set', identifier);
      return value;
    }
    if (record[field] === undefined) { setSettings(identifier, field, value); return value; }
    return record[field];
  } else if (table === 'sticker_packs') {
    const record = getStickersPack(identifier);
    if (!record) {
      stmt(`INSERT OR IGNORE INTO sticker_packs (id, ${field}) VALUES (?, ?)`).run(identifier, value);
      clearCache('stickerpack', identifier);
      return value;
    }
    if (record[field] === undefined) { setStickersPack(identifier, field, value); return value; }
    return record[field];
  }
  return value;
}

export function clearCache(type, id) {
  if (type === undefined && id === undefined) { memCache.clear(); return true; }
  if (id) {
    memCache.delete(getCacheKey(type, id));
  } else {
    memCache.deletePrefix(`${type}:`);
  }
}

try {
  const tables = [{ name: 'users', def: defUser, exclude: ['id'] }, { name: 'chats', def: defChat, exclude: ['id'] }, { name: 'chat_users', def: defChatUser, exclude: ['chat_id', 'user_id'] }, { name: 'settings', def: defSets, exclude: ['id'] }, { name: 'sticker_packs', def: defStickerPack, exclude: ['id'] }];
  for (const table of tables) {
    if (!stmt(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table.name)) continue;
    const existingCols = stmt(`PRAGMA table_info(${table.name})`).all();
    const existingNames = existingCols.map(c => c.name);
    const missingCols = Object.keys(table.def).filter(col => !existingNames.includes(col) && !table.exclude.includes(col));
    for (const col of missingCols) {
      const defaultValue = table.def[col];
      let sqlType = 'TEXT';
      if (typeof defaultValue === 'number') sqlType = 'INTEGER';
      else if (typeof defaultValue === 'boolean') sqlType = 'BOOLEAN';
      const defaultStr = defaultValue === null ? 'NULL' : JSON.stringify(defaultValue);
      db.exec(`ALTER TABLE ${table.name} ADD COLUMN ${col} ${sqlType} DEFAULT ${defaultStr}`);
      if (table.name === 'chat_users') {
        for (const row of stmt(`SELECT chat_id, user_id FROM ${table.name}`).all())
          stmt(`UPDATE ${table.name} SET ${col} = ? WHERE chat_id = ? AND user_id = ?`).run(defaultValue, row.chat_id, row.user_id);
      } else {
        for (const row of stmt(`SELECT id FROM ${table.name}`).all())
          stmt(`UPDATE ${table.name} SET ${col} = ? WHERE id = ?`).run(defaultValue, row.id);
      }
    }
  }
} catch (e) { console.error('[DB migration error]', e); }

export function clearDB() {
  if (!global.cleardb) {
    global.cleardb = true;
    const INACTIVE_MS = 7 * 86400000;
    setInterval(() => {
      const now = Date.now();
      for (const cu of stmt('SELECT chat_id, user_id, usedTime, lastCmd FROM chat_users').all()) {
        const last = cu.lastCmd > 0 ? cu.lastCmd : (cu.usedTime ? new Date(JSON.parse(cu.usedTime)).getTime() : 0);
        if (last === 0 || now - last > INACTIVE_MS) {
          stmt('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?').run(cu.chat_id, cu.user_id);
          memCache.delete(getCacheKey('chatuser', `${cu.chat_id}:${cu.user_id}`));
        }
      }
      for (const u of stmt('SELECT id FROM users WHERE exp = 0 AND id NOT IN (SELECT user_id FROM chat_users)').all()) {
        stmt('DELETE FROM users WHERE id = ?').run(u.id);
        memCache.delete(getCacheKey('user', u.id));
      }
    }, 86400000);
  }
}


export default { initDB, getUser, setUser, getChat, setChat, getChatUser, setChatUser, getSettings, setSettings, getCharacter, setCharacter, getStickersPack, setStickersPack, deletedb, setCreate, clearCache, clearDB, db };
