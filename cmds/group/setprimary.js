import fs from 'fs';
import path from 'path';
import db from '#db';

const sessionsPath = path.resolve(process.cwd(), 'Sessions');
const subsPath = path.join(sessionsPath, 'Subs');
const cleanNumber = (value = '') => String(value).split('@')[0].split(':')[0].replace(/\D/g, '');

function getBotsFromFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((dir) => dir.isDirectory() && fs.existsSync(path.join(folderPath, dir.name, 'creds.json')))
    .map((dir) => `${cleanNumber(dir.name)}@s.whatsapp.net`)
    .filter((jid) => jid !== '@s.whatsapp.net');
}

function getActiveSubBots() {
  if (!Array.isArray(global.conns)) return [];
  return global.conns
    .map((conn) => cleanNumber(conn?.user?.id || conn?.userId || ''))
    .filter(Boolean)
    .map((num) => `${num}@s.whatsapp.net`);
}

function getAllowedBots(mainBotJid) {
  const bots = [...getBotsFromFolder(subsPath), ...getActiveSubBots()];
  if (mainBotJid) bots.push(mainBotJid);
  return [...new Set(bots)];
}

export default {
  command: ['setprimary'],
  category: 'group',
  description: 'Establecer un bot como primario del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, groupMetadata, participants }) => {
    const chat = db.getChat(msg.chat);
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (!who) return sock.reply(msg.chat, '《✧》 Por favor menciona un bot para convertirlo en primario.', msg);
    const groupParticipants = (participants || groupMetadata?.participants || []).map((p) => p.id);
    const mainNumber = cleanNumber(global.sock?.user?.id || '');
    const mainBotJid = mainNumber ? `${mainNumber}@s.whatsapp.net` : '';
    const allowedBots = getAllowedBots(mainBotJid);
    if (!allowedBots.includes(who)) return sock.reply(msg.chat, '《✧》 El usuario mencionado no es una instancia de Sub-Bot.', msg);
    if (!groupParticipants.includes(who)) return sock.reply(msg.chat, '《✧》 El bot mencionado no está presente en este grupo.', msg);
    if (chat.primaryBot === who) return sock.reply(msg.chat, `「✿」 @${who.split('@')[0]} ya es el Bot principal del Grupo.`, msg, { mentions: [who] });
    chat.primaryBot = who;
    db.setChat(msg.chat, 'primaryBot', who);
    await sock.reply(msg.chat, `ꕥ Se ha establecido a @${who.split('@')[0]} como bot primario de este grupo.\n> Ahora todos los comandos de este grupo serán ejecutados por @${who.split('@')[0]}.`, msg, { mentions: [who] });
  },
};
