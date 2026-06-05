import { proto, delay, areJidsSameUser, generateWAMessage, generateWAMessageFromContent, generateWAMessageContent, prepareWAMessageMedia, downloadContentFromMessage, getContentType, getDevice, extractMessageContent, jidDecode } from 'baileys';
import fs from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import FileType from 'file-type';
import path from 'path';
import exif from './exif.js';
import { fileURLToPath } from 'url';
import GraphemeSplitter from 'grapheme-splitter';

const splitter = new GraphemeSplitter();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = exif;

class BoundedMap {
  #map = new Map();
  #max;
  #ttl;
  constructor(max, ttlMs = 0) { this.#max = max; this.#ttl = ttlMs; }
  #expired(e) { return this.#ttl > 0 && Date.now() - e.ts > this.#ttl; }
  has(k) {
    const e = this.#map.get(k);
    if (!e) return false;
    if (this.#expired(e)) { this.#map.delete(k); return false; }
    return true;
  }
  get(k) {
    const e = this.#map.get(k);
    if (!e) return undefined;
    if (this.#expired(e)) { this.#map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    if (this.#map.size >= this.#max) this.#map.delete(this.#map.keys().next().value);
    this.#map.set(k, { v, ts: Date.now() });
  }
}

const groupMetaCache = new Map();
const lidCache = new BoundedMap(2000, 24 * 60 * 60_000);
const META_TTL = 300_000;

const gcMeta = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of groupMetaCache)
    if (now - val.ts > META_TTL) groupMetaCache.delete(key);
}, 10 * 60 * 1000);
gcMeta.unref();

function getCachedMeta(groupJid) {
  const c = groupMetaCache.get(groupJid);
  if (!c || Date.now() - c.ts > META_TTL) return null;
  return c.metadata;
}

function setCachedMeta(groupJid, metadata) {
  groupMetaCache.set(groupJid, { metadata, ts: Date.now() });
}

function deleteCachedMeta(groupJid) {
  groupMetaCache.delete(groupJid);
}

function normalizeJid(raw) {
  if (!raw) return null;
  const s = typeof raw === 'number' ? String(raw) : String(raw).trim();
  if (!s) return null;
  if (s.endsWith('@g.us')) return s;
  if (s.endsWith('@newsletter')) return s;
  if (s.endsWith('@lid')) return s;
  if (/:\d+@/i.test(s)) {
    const decoded = jidDecode(s);
    if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`;
  }
  if (s.endsWith('@s.whatsapp.net')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits && digits.length >= 4 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  return s;
}

function resolveParticipantJid(p, sock) {
  if (!p) return null;
  if (p.phoneNumber) {
    const n = normalizeJid(p.phoneNumber);
    if (n && !n.endsWith('@lid')) return n;
  }
  if (p.id && !p.id.endsWith('@lid')) {
    const n = normalizeJid(p.id);
    if (n && !n.endsWith('@lid')) return n;
  }
  if (p.jid && !p.jid.endsWith('@lid')) {
    const n = normalizeJid(p.jid);
    if (n && !n.endsWith('@lid')) return n;
  }
  const rawLid = p.lid || (p.id?.endsWith('@lid') ? p.id : null) || (p.jid?.endsWith('@lid') ? p.jid : null);
  if (rawLid) {
    if (lidCache.has(rawLid)) return lidCache.get(rawLid);
    if (typeof sock?.findJidByLid === 'function') {
      const found = sock.findJidByLid(rawLid);
      if (found && !found.endsWith('@lid')) {
        const r = normalizeJid(found);
        if (r) { lidCache.set(rawLid, r); return r; }
      }
    }
    return rawLid;
  }
  return null;
}

function resolveParticipants(participants, sock) {
  if (!Array.isArray(participants)) return [];
  return participants.map(p => {
    const realJid = resolveParticipantJid(p, sock);
    if (!realJid) return p;
    const originalLid = p.lid || (p.id?.endsWith('@lid') ? p.id : undefined) || (p.jid?.endsWith('@lid') ? p.jid : undefined);
    return { ...p, id: realJid, ...(originalLid ? { lid: originalLid } : {}), ...(p.phoneNumber ? { phoneNumber: p.phoneNumber } : {}) };
  }).filter(p => p.id);
}

function resolveJidSync(raw, sock) {
  if (!raw) return null;
  const norm = normalizeJid(raw);
  if (!norm) return null;
  if (!norm.endsWith('@lid')) return norm;
  if (lidCache.has(norm)) return lidCache.get(norm);
  if (typeof sock?.findJidByLid === 'function') {
    const found = sock.findJidByLid(norm);
    if (found && !found.endsWith('@lid')) {
      const r = normalizeJid(found);
      if (r) { lidCache.set(norm, r); return r; }
    }
  }
  return norm;
}

async function resolveJidAsync(raw, sock, groupJid) {
  if (!raw) return null;
  const norm = normalizeJid(raw);
  if (!norm) return null;
  if (!norm.endsWith('@lid')) return norm;
  const sync = resolveJidSync(norm, sock);
  if (sync && !sync.endsWith('@lid')) return sync;
  if (!groupJid?.endsWith('@g.us')) return norm;
  const lidBase = norm.split('@')[0];
  let meta = getCachedMeta(groupJid);
  if (!meta) {
    try { meta = await sock.groupMetadata(groupJid); if (meta?.participants) setCachedMeta(groupJid, meta); else meta = null; }
    catch { return norm; }
  }
  for (const p of meta.participants ?? []) {
    const pLidBase = p.lid?.split('@')[0];
    const pIdBase  = (p.id && !p.id.endsWith('@lid')) ? p.id.split('@')[0] : null;
    if (pLidBase !== lidBase && pIdBase !== lidBase) continue;
    const phone = p.phoneNumber ? normalizeJid(p.phoneNumber) : (p.id && !p.id.endsWith('@lid') ? normalizeJid(p.id) : null);
    if (phone) { lidCache.set(norm, phone); return phone; }
  }
  return norm;
}

function patchGroupMetadata(sock) {
  if (sock.groupMetadataPatched) return;
  sock.groupMetadataPatched = true;
  const orig = sock.groupMetadata.bind(sock);
  sock.groupMetadata = async (jid) => {
    try {
      const meta = await orig(jid);
      if (!meta?.participants) return meta;
      meta.participants = resolveParticipants(meta.participants, sock);
      return meta;
    } catch (e) {
      return null;
    }
  };
}

export { normalizeJid, resolveParticipantJid, resolveJidSync, patchGroupMetadata, getCachedMeta, setCachedMeta, deleteCachedMeta };

export async function getBuffer(url, options = {}) {
  try {
    const res = await axios({ method: 'get', url, headers: { DNT: 1, 'Upgrade-Insecure-Request': 1 }, responseType: 'arraybuffer', timeout: 30_000, ...options });
    return res.data;
  } catch (e) { throw e; }
}

export async function getFile(PATH, saveToFile = false) {
  let filename;
  let data;
  if (Buffer.isBuffer(PATH)) {
    data = PATH;
  } else if (PATH instanceof ArrayBuffer) {
    data = Buffer.from(PATH);
  } else if (/^data:.*?\/.*?;base64,/i.test(PATH)) {
    data = Buffer.from(PATH.split`,`[1], 'base64');
  } else if (/^https?:\/\//.test(PATH)) {
    data = await getBuffer(PATH);
  } else if (fs.existsSync(PATH)) {
    filename = PATH;
    data = fs.readFileSync(PATH);
  } else {
    throw new TypeError(`getFile: input invalido — ${typeof PATH}`);
  }
  if (!Buffer.isBuffer(data)) throw new TypeError('getFile: el resultado no es un Buffer');
  const type = (await FileType.fromBuffer(data)) || { mime: 'application/octet-stream', ext: '.bin' };
  if (saveToFile && !filename) {
    filename = path.join(__dirname, '../tmp/' + Date.now() + '.' + type.ext);
    await fs.promises.writeFile(filename, data);
  }
  return { filename, ...type, data, deleteFile: () => filename ? fs.promises.unlink(filename) : Promise.resolve() };
}

export async function fetchJson(url, options) {
  try {
    const res = await axios({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36' }, ...options });
    return res.data;
  } catch (err) { return err; }
}

export async function smsg(sock, msg, store) {
  const botId = sock?.user?.id.split(':')[0] + '@s.whatsapp.net' || '';
  const botSetting = global.db.data.settings[botId] || {};
  if (!sock.decodeJid) {
    sock.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server && decoded.user + '@' + decoded.server) || jid;
      }
      return jid;
    };
  }
  patchGroupMetadata(sock);
  if (!sock.downloadMediaMessage) {
  sock.downloadMediaMessage = async (message) => {
    const m = message.msg || message;
    const mime = m.mimetype || '';
    const messageType = (message.type || mime.split('/')[0]).replace(/Message/gi, '');
    const stream = await downloadContentFromMessage(m, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
  };
  }
  if (!msg) return msg;
  if (msg.key) {
    msg.id = msg.key.id;
    msg.chat = msg.key.remoteJid;
    msg.fromMe = msg.key.fromMe;
    msg.isBot = ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some((a) => msg.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.id.length)) || /(.)\\1{5,}|[^a-zA-Z0-9]|[^0-9A-F]/.test(msg.id) || false;
    msg.isGroup = msg.chat?.endsWith('@g.us') ?? false;
    if (!msg.isGroup && msg.chat?.endsWith('@lid')) {
      const resolved = await resolveJidAsync(msg.chat, sock, null);
      if (resolved && !resolved.endsWith('@lid')) msg.chat = resolved;
    }
    const rawSender = (msg.fromMe && sock.user.id) || msg.key?.participant || msg.key?.remoteJid || '';
    msg.sender = await resolveJidAsync(sock.decodeJid(rawSender), sock, msg.key?.remoteJid);
  }

  if (msg.message) {
    msg.type = getContentType(msg.message) || Object.keys(msg.message)[0];
    msg.msg = /viewOnceMessage|viewOnceMessageV2Extension|editedMessage|ephemeralMessage/i.test(msg.type) ? msg.message[msg.type].message[getContentType(msg.message[msg.type].message)] : extractMessageContent(msg.message[msg.type]) || msg.message[msg.type];
    msg.body = msg.message?.conversation || msg.msg?.text || msg.msg?.conversation || msg.msg?.caption || msg.msg?.selectedButtonId || msg.msg?.singleSelectReply?.selectedRowId || msg.msg?.selectedId || msg.msg?.contentText || msg.msg?.selectedDisplayText || msg.msg?.title || msg.msg?.name || '';
    const rawMentioned = msg.msg?.contextInfo?.mentionedJid ?? [];
    let metaParticipants = null;
    if (msg.isGroup && rawMentioned.some(j => j?.endsWith('@lid'))) {
      try {
        const meta = getCachedMeta(msg.chat) ?? await sock.groupMetadata(msg.chat).catch(() => null);
        if (meta) setCachedMeta(msg.chat, meta);
        metaParticipants = meta?.participants ?? null;
      } catch {}
    }
    const resolveMentionJid = (raw) => {
      if (!raw) return null;
      const norm = normalizeJid(raw);
      if (!norm) return null;
      if (!norm.endsWith('@lid')) return norm;
      const sync = resolveJidSync(norm, sock);
      if (sync && !sync.endsWith('@lid')) return sync;
      if (metaParticipants) {
        const lidBase = norm.split('@')[0];
        for (const p of metaParticipants) {
          if (p.lid?.split('@')[0] === lidBase) return p.id;
          if (p.id?.split('@')[0] === lidBase) return p.id;
        }
      }
      return norm;
    };
    msg.mentionedJid = rawMentioned.map(resolveMentionJid).filter(Boolean);
    msg.text = msg.msg?.text || msg.msg?.caption || msg.message?.conversation || msg.msg?.contentText || msg.msg?.selectedDisplayText || msg.msg?.title || '';
    let activePrefixes = [];
    if (botSetting.prefix === 1) activePrefixes = [];
    else if (Array.isArray(botSetting.prefix)) activePrefixes = botSetting.prefix;
    else if (typeof botSetting.prefix === 'string') activePrefixes = splitter.splitGraphemes(botSetting.prefix);
    else activePrefixes = ['#', '/', '.', '!'];
    msg.usedPrefix = '';
    for (const p of activePrefixes) { if (msg.body?.startsWith(p)) { msg.usedPrefix = p; break; } }
    msg.command = msg.body && msg.body.replace(msg.usedPrefix, '').trim().split(/ +/).shift();
    msg.args = msg.body?.trim().replace(new RegExp('^' + (msg.usedPrefix || '').replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, '\\$&'), 'i'), '').replace(msg.command, '').split(/ +/).filter((a) => a) || [];
    msg.device = getDevice(msg.id);
    msg.expiration = msg.msg?.contextInfo?.expiration || msg?.metadata?.ephemeralDuration || sock?.messages?.[msg.chat]?.array?.slice(-1)[0]?.metadata?.ephemeralDuration || 0;
    msg.timestamp = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp?.low || msg.messageTimestamp?.high) || (msg.msg?.timestampMs * 1000);
    msg.isMedia = !!msg.msg?.mimetype || !!msg.msg?.thumbnailDirectPath;
    if (msg.isMedia) {
      msg.mime = msg.msg?.mimetype;
      msg.size = msg.msg?.fileLength;
      msg.height = msg.msg?.height || '';
      msg.width = msg.msg?.width || '';
      if (/webp/i.test(msg.mime)) msg.isAnimated = msg.msg?.isAnimated;
    }
    msg.quoted = msg.msg?.contextInfo?.quotedMessage ? {} : null;
    if (msg.quoted) {
      msg.quoted.message = extractMessageContent(msg.msg?.contextInfo?.quotedMessage);
      msg.quoted.type = getContentType(msg.quoted.message) || Object.keys(msg.quoted.message)[0];
      msg.quoted.msg = extractMessageContent(msg.quoted.message[msg.quoted.type]) || msg.quoted.message[msg.quoted.type];
      msg.quoted.id = msg.msg.contextInfo.stanzaId;
      msg.quoted.device = getDevice(msg.quoted.id);
      msg.quoted.chat = msg.msg.contextInfo.remoteJid || msg.chat;
      msg.quoted.isBot = msg.quoted.id ? ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some((a) => msg.quoted.id.startsWith(a) && [12, 16, 20, 22, 40].includes(msg.quoted.id.length)) || /(.)\\1{5,}|[^a-zA-Z0-9]|[^0-9A-F]/.test(msg.quoted.id) : false;
      const rawQP = msg.msg?.contextInfo?.participant ?? '';
      msg.quoted.sender = await resolveJidAsync(sock.decodeJid(rawQP), sock, msg.chat);
      msg.quoted.fromMe = areJidsSameUser(msg.quoted.sender, sock.decodeJid(sock.user.id));
      msg.quoted.text = msg.quoted.msg?.text || msg.quoted.msg?.caption || msg.quoted.msg?.conversation || msg.quoted.msg?.contentText || msg.quoted.msg?.selectedDisplayText || msg.quoted.msg?.title || '';
      msg.quoted.body = msg.quoted.msg?.text || msg.quoted.msg?.caption || msg.quoted.message?.conversation || msg.quoted.msg?.selectedButtonId || msg.quoted.msg?.singleSelectReply?.selectedRowId || msg.quoted.msg?.selectedId || msg.quoted.msg?.contentText || msg.quoted.msg?.selectedDisplayText || msg.quoted.msg?.title || msg.quoted.msg?.name || '';
      msg.quoted.mentionedJid = (msg.quoted.msg?.contextInfo?.mentionedJid ?? []).map(resolveMentionJid).filter(Boolean);
      msg.quoted.mentions = msg.quoted.mentionedJid;
      msg.quoted.isGroup = msg.quoted.chat?.endsWith('@g.us');
      let quotedPrefix = '';
      for (const p of activePrefixes) { if (msg.quoted.body?.startsWith(p)) { quotedPrefix = p; break; } }
      msg.quoted.usedPrefix = quotedPrefix;
      msg.quoted.command = msg.quoted.body && msg.quoted.body.replace(msg.quoted.usedPrefix, '').trim().split(/ +/).shift();
      msg.quoted.isMedia = !!msg.quoted.msg?.mimetype || !!msg.quoted.msg?.thumbnailDirectPath;
      if (msg.quoted.isMedia) {
        msg.quoted.fileSha256 = msg.quoted[msg.quoted.type]?.fileSha256 || '';
        msg.quoted.mime = msg.quoted.msg?.mimetype;
        msg.quoted.size = msg.quoted.msg?.fileLength;
        msg.quoted.height = msg.quoted.msg?.height || '';
        msg.quoted.width = msg.quoted.msg?.width || '';
        if (/webp/i.test(msg.quoted.mime)) msg.quoted.isAnimated = msg.quoted?.msg?.isAnimated || false;
      }
      msg.quoted.key = { remoteJid: msg.msg?.contextInfo?.remoteJid || msg.chat, participant: msg.quoted.sender, fromMe: areJidsSameUser(sock.decodeJid(msg.msg?.contextInfo?.participant), sock.decodeJid(sock?.user?.id)), id: msg.msg?.contextInfo?.stanzaId };
      msg.quoted.fakeObj = proto.WebMessageInfo.fromObject({ key: { remoteJid: msg.quoted.chat, fromMe: msg.quoted.fromMe, id: msg.quoted.id }, message: msg.quoted.message, ...(msg.isGroup ? { participant: msg.quoted.sender } : {}) });
      msg.getQuotedObj = async () => {
        if (!msg.quoted.id) return false;
        const q = store ? await store.loadMessage(msg.chat, msg.quoted.id).catch(() => null) : null;
        return await exports.smsg(sock, q);
      };
      msg.quoted.download = () => sock.downloadMediaMessage(msg.quoted);
      msg.quoted.delete = () => {
        sock.sendMessage(msg.quoted.chat, { delete: { remoteJid: msg.quoted.chat, fromMe: msg.isBotAdmin ? false : true, id: msg.quoted.id, participant: msg.quoted.sender } });
      };
    }
  }
  msg.download = () => sock.downloadMediaMessage(msg);
  msg.copy = () => exports.smsg(sock, proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject(msg)));
  msg.react = (u) => sock.sendMessage(msg.chat, { react: { text: u, key: msg.key } });
  msg.copyNForward = (jid = msg.chat, forceForward = false, options = {}) => sock.copyNForward(jid, msg, forceForward, options);

  msg.reply = async (content, options = {}) => {
    const quoted = msg;
    const chat = msg.chat;
    const caption = '';
    const ephemeralExpiration = msg.expiration;
    const mentions = '';
    if (typeof content === 'object') {
      return sock.sendMessage(chat, content, { ...options, quoted, ephemeralExpiration });
    } else if (typeof content === 'string') {
      try {
        if (/^https?:\/\//.test(content)) {
          const data = await axios.get(content, { responseType: 'arraybuffer' });
          const mime = data.headers['content-type'] || (await FileType.fromBuffer(data.data)).mime;
          if (/gif|image|video|audio|pdf|stream/i.test(mime)) {
            return sock.sendMedia(chat, data.data, '', caption, quoted, content);
          } else {
            return sock.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration });
          }
        } else {
          return sock.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration });
        }
      } catch (e) {
        return sock.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration });
      }
    }
  };

  if (!sock.parseMention) {
  sock.parseMention = async (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => v[1] + '@s.whatsapp.net');
  };
  }
  
  if (!sock.sendImageAsSticker) {
  sock.sendImageAsSticker = async (jid, p, quoted, options = {}) => {
    const buff = Buffer.isBuffer(p) ? p : /^data:.*?\/.*?;base64,/i.test(p) ? Buffer.from(p.split`,`[1], 'base64') : /^https?:\/\//.test(p) ? await getBuffer(p) : fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
    const buffer = (options?.packname || options?.author) ? await writeExifImg(buff, options) : await imageToWebp(buff);
    await sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };
  }

  if (!sock.sendVideoAsSticker) {
  sock.sendVideoAsSticker = async (jid, p, quoted, options = {}) => {
    const buff = Buffer.isBuffer(p) ? p : /^data:.*?\/.*?;base64,/i.test(p) ? Buffer.from(p.split`,`[1], 'base64') : /^https?:\/\//.test(p) ? await getBuffer(p) : fs.existsSync(p) ? fs.readFileSync(p) : Buffer.alloc(0);
    const buffer = (options?.packname || options?.author) ? await writeExifVid(buff, options) : await videoToWebp(buff);
    await sock.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };
  }

  if (!sock.sendFile) {
  sock.sendFile = async (jid, p, filename = 'file', caption = '', quoted = null, ptt = false, options = {}) => {
    let buffer;
    if (Buffer.isBuffer(p)) buffer = p;
    else if (/^https?:\/\//.test(p)) buffer = await getBuffer(p);
    else if (fs.existsSync(p)) buffer = fs.readFileSync(p);
    else throw new Error('Ruta o buffer inválido');
    const type = (await FileType.fromBuffer(buffer)) ?? { mime: 'application/octet-stream', ext: 'bin' };
    const mimetype = options.mimetype ?? type.mime;
    let mtype = 'document';
    if (/webp/i.test(type.mime)) mtype = 'sticker';
    else if (/image/i.test(type.mime)) mtype = 'image';
    else if (/video/i.test(type.mime)) mtype = 'video';
    else if (/audio/i.test(type.mime)) mtype = 'audio';
    if (options.asDocument) mtype = 'document';
    const clean = { ...options };
    ;['asDocument', 'asSticker', 'asImage', 'asVideo'].forEach(k => delete clean[k]);
    return sock.sendMessage(jid, { ...clean, caption, ptt, [mtype]: buffer, mimetype, fileName: filename }, { quoted });
  };
  }

  if (!sock.sendAlbumMessage) {
  sock.sendAlbumMessage = async (jid, medias, options = {}) => {
    if (typeof jid !== 'string') throw new TypeError(`jid must be string, received: ${jid}`);
    if (!Array.isArray(medias) || medias.length < 2) throw new RangeError('Minimum 2 media required');
    for (const media of medias) {
      if (!media.type || (media.type !== 'image' && media.type !== 'video')) throw new TypeError(`Invalid media type: ${media.type}`);
      if (!media.data || (!media.data.url && !Buffer.isBuffer(media.data))) throw new TypeError(`Invalid media data`);
    }
    const caption = options.text || options.caption || '';
    const delayMs = !isNaN(options.delay) ? options.delay : 500;
    delete options.text; delete options.caption; delete options.delay;
    const album = generateWAMessageFromContent(jid, { messageContextInfo: {}, albumMessage: { expectedImageCount: medias.filter(m => m.type === 'image').length, expectedVideoCount: medias.filter(m => m.type === 'video').length, ...(options.quoted ? { contextInfo: { remoteJid: options.quoted.key.remoteJid, fromMe: options.quoted.key.fromMe, stanzaId: options.quoted.key.id, participant: options.quoted.key.participant || options.quoted.key.remoteJid, quotedMessage: options.quoted.message } } : {}) } }, {});
    await sock.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id });
    for (let i = 0; i < medias.length; i++) {
      const { type, data, caption } = medias[i];
      const mediaMsg = await generateWAMessage(album.key.remoteJid, { [type]: data, ...(caption ? { caption } : {}) }, { upload: sock.waUploadToServer });
      mediaMsg.message.messageContextInfo = { messageAssociation: { associationType: 1, parentMessageKey: album.key } };
      await sock.relayMessage(mediaMsg.key.remoteJid, mediaMsg.message, { messageId: mediaMsg.key.id });
      await delay(delayMs);
    }
    return album;
  };
  }
  
  if (!sock.sendCodeMessage) {
  sock.sendCodeMessage = async (jid, filename, code, quoted, tableData) => {
    const KEYWORDS = new Set(['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','async','await','static']);
    const METHOD_NAMES = new Set(['log','parse','stringify','from','toString','readFileSync','existsSync','statSync','resolve','join','randomUUID','randomBytes','startsWith','replace','trim','isFile','relayMessage','sendMessage']);
    function tokenize(src) {
      const tokens = [];
      let i = 0;
      const push = (content, type = 'DEFAULT') => { if (content) tokens.push({ content, type }); };
      while (i < src.length) {
        const ch = src[i];
        const rest = src.slice(i);
        if (rest.startsWith('//')) { let j = i + 2; while (j < src.length && src[j] !== '\n') j++; push(src.slice(i, j), 'DEFAULT'); i = j; continue; }
        if (rest.startsWith('/*')) { let j = i + 2; while (j < src.length - 1 && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(j + 2, src.length); push(src.slice(i, j), 'DEFAULT'); i = j; continue; }
        if (ch === "'" || ch === '"' || ch === '`') {
          const quote = ch; let j = i + 1, escaped = false;
          while (j < src.length) { const c = src[j]; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) { j++; break; } j++; }
          push(src.slice(i, j), 'STR'); i = j; continue;
        }
        if (/[0-9]/.test(ch)) { let j = i + 1; while (j < src.length && /[0-9._]/.test(src[j])) j++; push(src.slice(i, j), 'NUMBER'); i = j; continue; }
        if (/[A-Za-z_$]/.test(ch)) {
          let j = i + 1; while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
          const word = src.slice(i, j); const next = src[j] || '', prev = src[i - 1] || '';
          if (KEYWORDS.has(word)) push(word, 'KEYWORD');
          else if ((METHOD_NAMES.has(word) || next === '(') && prev === '.') push(word, 'METHOD');
          else if (METHOD_NAMES.has(word) && next === '(') push(word, 'METHOD');
          else push(word, 'DEFAULT');
          i = j; continue;
        }
        push(ch, 'DEFAULT'); i++;
      }
      const merged = [];
      for (const token of tokens) { const last = merged[merged.length - 1]; if (last?.type === 'DEFAULT' && token.type === 'DEFAULT') last.content += token.content; else merged.push({ ...token }); }
      return merged;
    }
    const codeBlocks = Array.isArray(code) ? code : tokenize(String(code));
    const sections = [];
    const submessages = [];
    sections.push({ view_model: { primitive: { text: filename, __typename: 'GenAIMarkdownTextUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    if (tableData) {
      const tableRows = [{ items: tableData.headers, isHeading: true }, ...tableData.rows.map(r => ({ items: r.map(String) }))];
      submessages.push({ messageType: 4, tableMetadata: { title: tableData.title, rows: tableRows } });
      sections.push({ view_model: { primitive: { title: tableData.title, rows: tableRows.map(row => ({ is_header: row.isHeading ?? false, cells: row.items, markdown_cells: [] })), __typename: 'GenATableUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    }
    sections.push({ view_model: { primitive: { language: 'javascript', code_blocks: codeBlocks, __typename: 'GenAICodeUXPrimitive' }, __typename: 'GenAISingleLayoutViewModel' } });
    const payload = { response_id: crypto.randomUUID(), sections };
    const content = { messageContextInfo: { threadId: [], deviceListMetadata: { senderKeyIndexes: [], recipientKeyIndexes: [], recipientKeyHash: '', recipientTimestamp: Math.floor(Date.now() / 1000) }, deviceListMetadataVersion: 2, messageSecret: crypto.randomBytes(32).toString('base64') }, botForwardedMessage: { message: { richResponseMessage: { submessages, messageType: 1, unifiedResponse: { data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') }, contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [], forwardingScore: 2, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '259786046210223@bot' }, forwardOrigin: 4, botMessageSharingInfo: { botEntryPointOrigin: 1, forwardScore: 2 } } } } } };
    return sock.relayMessage(jid, content, {});
  };
  }

  if (!sock.reply) {
  sock.reply = async (jid, text = '', quoted, options) => {
    return Buffer.isBuffer(text) ? sock.sendFile(jid, text, 'file', '', quoted, false, options) : sock.sendMessage(jid, { ...options, text }, { quoted, ...options });
  };
  }
  
  return msg;
}
