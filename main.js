import ws from 'ws';
import moment from 'moment';
import chalk from 'chalk';
import fs from "fs";
import path from 'path';
import { getCachedMeta, setCachedMeta, BoundedMap } from '#serialize';
import db from '#db';

const prefixCache = new BoundedMap(300, 0);
function getBotPrefixRegex(botJid, settings) {
  const sig = `${settings.namebot || ''}|${settings.type || ''}|${JSON.stringify(settings.prefix ?? '')}`;
  const cached = prefixCache.get(botJid);
  if (cached && cached.sig === sig) return cached;
  const rawBotname = settings.namebot || 'Bot';
  const tipo = settings.type || 'Sub';
  const cleanBotname = rawBotname.replace(/[^a-zA-Z0-9\s]/g, '');
  const namebot = cleanBotname || 'Yuki';
  const shortForms = [namebot.charAt(0), namebot.split(" ")[0], tipo.split(" ")[0], namebot.split(" ")[0].slice(0, 2), namebot.split(" ")[0].slice(0, 3)];
  const prefixes = shortForms.map(name => `${name}`);
  prefixes.unshift(namebot);
  let prefix;
  if (Array.isArray(settings.prefix) || typeof settings.prefix === 'string') {
    const prefixArray = Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix];
    prefix = new RegExp('^(' + prefixes.join('|') + ')?(' + prefixArray.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i');
  } else if (settings.prefix === 1) {
    prefix = new RegExp('^', 'i');
  } else {
    prefix = new RegExp('^(' + prefixes.join('|') + ')?', 'i');
  }
  const entry = { sig, regex: prefix, namebot };
  prefixCache.set(botJid, entry);
  return entry;
}

let customPrefixCache = { size: -1, list: [] };
function getCustomPrefixCmds() {
  if (customPrefixCache.size !== global.comandos.size) {
    customPrefixCache = { size: global.comandos.size, list: [...global.comandos].filter(([, data]) => data.customPrefix) };
  }
  return customPrefixCache.list;
}

function getAllSessionBots() {
  const bots = (global.conns ?? []).filter(c => c.userId).map(c => c.userId + '@s.whatsapp.net');
  const ownerId = global.sock?.user?.id?.split(':')[0];
  if (ownerId) bots.push(ownerId + '@s.whatsapp.net');
  return bots;
}

export default async (sock, msg) => {
  const sender = msg.sender;
  const from = msg.key.remoteJid;
  const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const chat = db.getChat(msg.chat);
  const settings = db.getSettings(botJid);
  const user = db.getUser(sender);
  const users = db.getChatUser(msg.chat, sender);
  const pushname = msg.pushName || 'Sin nombre';
  const isOwner = global.owner.map(num => num + '@s.whatsapp.net').includes(sender);
  const isROwner = [botJid, ...(settings.owner ? [settings.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(sender);

  let groupMetadata = null;
  let groupName = '';
  if (msg.isGroup) {
    groupMetadata = getCachedMeta(msg.chat);
    if (!groupMetadata) {
      groupMetadata = await sock.groupMetadata(msg.chat).catch(() => null);
      if (groupMetadata) setCachedMeta(msg.chat, groupMetadata);
    }
    groupName = groupMetadata?.subject || '';
  }
  const participants = groupMetadata?.participants || [];
  const adminSet = new Set(participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').flatMap(p => [p.id?.split('@')[0], p.lid?.split('@')[0], p.phoneNumber?.split('@')[0]].filter(Boolean)));
  const senderBase = sender.split('@')[0];
  const botBase = botJid.split('@')[0];
  const isBotAdmins = msg.isGroup ? adminSet.has(botBase) : false;
  const isAdmins = msg.isGroup ? adminSet.has(senderBase) : false;

  Promise.allSettled((global.cmdsExecute ?? []).filter(p => p.type === 'all').map(p => p.fn({ msg, sock, groupMetadata, participants, isAdmins, isBotAdmins, isOwner, __dirname: p.dirname }).catch(e => console.error(chalk.gray(`[ ✿ ] Error all-plugin ${p.key}: ${e.message}`)))));

  const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
  if (!users.stats) users.stats = {};
  if (!users.stats[today]) users.stats[today] = { msgs: 0, cmds: 0 };
  users.stats[today].msgs++;
  db.setChatUser(from, sender, 'stats', users.stats);

  const rawBotname = settings.namebot || 'Yuki';
  const { regex: prefix, namebot } = getBotPrefixRegex(botJid, settings);
  const tipo = settings.type || 'Sub';
  const strRegex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  let customCmd = null;
  let pluginPrefix = prefix;
  for (const [cmdName, data] of getCustomPrefixCmds()) {
    const cp = data.customPrefix;
    const ms = cp instanceof RegExp ? [[cp.exec(msg.text), cp]] : Array.isArray(cp) ? cp.map(p => { let r = p instanceof RegExp ? p : new RegExp(strRegex(p)); return [r.exec(msg.text), r]; }) : typeof cp === 'string' ? [[new RegExp(strRegex(cp)).exec(msg.text), new RegExp(strRegex(cp))]] : [[null, null]];
    if (ms.find(p => p[0])) { customCmd = cmdName; pluginPrefix = cp; break; }
  }
  let matchs = pluginPrefix instanceof RegExp ? [[pluginPrefix.exec(msg.text), pluginPrefix]] : Array.isArray(pluginPrefix) ? pluginPrefix.map(p => {
    let regex = p instanceof RegExp ? p : new RegExp(strRegex(p));
    return [regex.exec(msg.text), regex];
  }) : typeof pluginPrefix === 'string' ? [[new RegExp(strRegex(pluginPrefix)).exec(msg.text), new RegExp(strRegex(pluginPrefix))]] : [[null, null]];
  let match = matchs.find(p => p[0]) || null;

  const botprimaryId = chat?.primaryBot;
  if (!botprimaryId || botprimaryId === botJid) {
    await Promise.allSettled((global.cmdsExecute ?? []).filter(p => p.type === 'before').map(p => p.fn({ msg, sock, match, groupMetadata, participants, isAdmins, isBotAdmins, isOwner, __dirname: p.dirname }).catch(e => console.error(chalk.gray(`[ ✿ ] Error before-plugin ${p.key}: ${e.message}`)))));
  }

  if (!match) return;
  if (msg.isCommands) return;
  let usedPrefix = (match[0] || [])[0] || '';
  let args = msg.text.slice(usedPrefix.length).trim().split(" ");
  let command = customCmd ?? (args.shift() || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let text = args.join(' ');
  if (!command) return;

  if (!botprimaryId || botprimaryId === botJid) {
    console.log(chalk.bold.blue(`╭────────────────────────────···\n│ ${chalk.cyan('Bot')}: ${chalk.greenBright(botJid)}\n│ ${chalk.bold.yellow('Fecha')}: ${chalk.yellowBright(moment().format('DD/MM/YY HH:mm:ss'))}\n│ ${chalk.bold.blueBright('Usuario')}: ${chalk.blueBright(pushname)}\n│ ${chalk.bold.magentaBright('Remitente')}: ${chalk.magentaBright(sender)}\n${msg.isGroup ? '│' + chalk.bold.green(' Grupo') + ': ' + chalk.greenBright(groupName) : '│' + chalk.bold.green(' Privado') + ': ' + chalk.magentaBright('Chat Privado')}\n${'│' + chalk.bold.magenta(' ID') + ': ' + chalk.blueBright(msg.isGroup ? from : 'Chat Privado')}\n│ ${chalk.bold.cyanBright('Comando usado')}: ${chalk.gray(command ? command : 'No Command')}\n╰────────────────────────────···\n`));
  }

  const hasPrefix = settings.prefix === 1 ? 1 : (Array.isArray(settings.prefix) ? settings.prefix : typeof settings.prefix === 'string' ? [settings.prefix] : []).some(p => msg.text?.startsWith(p));
  if (botprimaryId && botprimaryId !== botJid) {
    if (hasPrefix) {
      const groupJids = participants.map(p => p.id);
      const sessionBots = getAllSessionBots();
      const primaryInGroup = groupJids.includes(botprimaryId);
      const isPrimarySelf = botprimaryId === botJid;
      const primaryInSessions = sessionBots.includes(botprimaryId);
      if (!primaryInSessions || !primaryInGroup) return;
      if ((primaryInSessions && primaryInGroup) || isPrimarySelf) return;
    }
  }

  if (!isROwner && settings.self) return;
  if (msg.chat && !msg.chat.endsWith('g.us')) {
    const cmds = ['allmenu', 'help', 'menu', 'infobot', 'botinfo', 'invite', 'invitar', 'ping', 'speed', 'p', 'status', 'estado', 'report', 'reporte', 'sug', 'suggest', 'token', 'join', 'unir', 'logout', 'reload', 'self', 'setbanner', 'setbotbanner', 'setchannel', 'setbotchannel', 'setbotcurrency', 'setcurrency', 'seticon', 'setboticon', 'setlink', 'setbotlink', 'setbotname', 'setname', 'setbotowner', 'setowner', 'setimage', 'setpfp', 'setprefix', 'setbotprefix', 'setstatus', 'setusername', 'code', 'qr', 'codepremium', 'qrpremium', 'codemod', 'qrmod'];
    if (!isOwner && !cmds.includes(command)) return;
  }
  if (chat?.isBanned && !(command === 'bot' && text === 'on') && !isOwner) {
    await msg.reply(`ꕥ El bot *${settings.botname || 'Yuki'}* está desactivado en este grupo.\n\n> ✎ Un *administrador* puede activarlo con el comando:\n> » *${usedPrefix}bot on*`);
    return;
  }

  if (chat.adminonly && !isAdmins) return;
  const cmdData = global.comandos.get(command);
  if (!cmdData) {
    if (settings.prefix === 1) return;
    await sock.readMessages([msg.key]);
    return msg.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help* para ver la lista de comandos disponibles.`);
  }
  if (cmdData.isOwner && !isOwner) {
    if (settings.prefix === 1) return;
    return msg.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help* para ver la lista de comandos disponibles.`);
  }
  if (cmdData.isAdmin && !isAdmins) return sock.reply(msg.chat, '《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.', msg);
  if (cmdData.botAdmin && !isBotAdmins) return sock.reply(msg.chat, '《✧》 Este comando solo puede ser ejecutado si el Socket es Administrador del Grupo.', msg);
  try {
    await sock.sendPresenceUpdate('composing', msg.chat);
    await sock.readMessages([msg.key]);
    user.usedcommands = (user.usedcommands || 0) + 1;
    user.exp = (user.exp || 0) + Math.floor(Math.random() * 100);
    user.name = msg.pushName;
    db.setUser(sender, 'usedcommands', user.usedcommands);
    db.setUser(sender, 'exp', user.exp);
    db.setUser(sender, 'name', user.name);
    users.usedTime = new Date();
    users.lastCmd = Date.now();
    users.stats[today].cmds++;
    db.setChatUser(msg.chat, sender, 'usedTime', users.usedTime);
    db.setChatUser(msg.chat, sender, 'lastCmd', users.lastCmd);
    db.setChatUser(msg.chat, sender, 'stats', users.stats);
    settings.commandsejecut = (settings.commandsejecut || 0) + 1;
    db.setSettings(botJid, 'commandsejecut', settings.commandsejecut);
    await cmdData.run({ msg, sock, args, usedPrefix, command, text, groupMetadata, participants, isAdmins, isBotAdmins, isOwner, __dirname: global.plugins[cmdData.pluginKey]?.dirname });
  } catch (error) {
    await sock.sendMessage(msg.chat, { text: `《✧》 Error al ejecutar el comando ${command}.\n\n${error}` }, { quoted: msg });
  }
};
