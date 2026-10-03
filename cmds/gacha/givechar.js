import { promises as fs } from 'fs';
import db from '#db';

const charactersFilePath = './core/characters.json';

async function loadCharacters() {
  const data = await fs.readFile(charactersFilePath, 'utf-8');
  return JSON.parse(data);
}

function flattenCharacters(structure) {
  return Object.values(structure).flatMap(s => Array.isArray(s.characters) ? s.characters : []);
}

export default {
  command: ['givechar', 'givewaifu', 'regalar'],
  category: 'gacha',
  description: 'Regalar un personaje a otro usuario.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const chat = db.getChat(msg.chat);
      if (chat.adminonly || !chat.gacha) {
        return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
      }      
      if (!args.length) {
        return msg.reply(`❀ Debes escribir el nombre del personaje y citar o mencionar al usuario que lo recibirá`);
      }      
      const targetId = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
      if (!targetId) return msg.reply(`❀ Debes mencionar o citar el mensaje del destinatario.`);
      let sender = db.getChatUser(msg.chat, msg.sender);
      let target = targetId === msg.sender ? sender : db.getChatUser(msg.chat, targetId);
      if (!target) {
      return msg.reply(`「✎」 El usuario mencionado no está registrado en el bot.`);
      }
      const characterName = msg.quoted ? args.join(' ').toLowerCase().trim() : args.slice(0, -1).join(' ').toLowerCase().trim();      
      const structure = await loadCharacters();
      const allCharacters = flattenCharacters(structure);
      const character = allCharacters.find(c => c.name.toLowerCase() === characterName);      
      if (!character) {
        return msg.reply(`ꕥ No se encontró el personaje *${characterName}*.`);
      }      
      if (!sender.characters.includes(character.id)) {
        return msg.reply(`ꕥ *${character.name}* no está reclamado por ti.`);
      }
      const charKey = msg.chat + '__' + character.id;
      db.setCreate('characters', charKey, 'name', character.name);
      let characterData = db.getCharacter(charKey);
      if (!characterData) characterData = { name: character.name, value: Number(character.value || 0), votes: 0 };
      characterData.user = targetId;
      characterData.claimedAt = Date.now();
      db.setCharacter(charKey, characterData);
      sender.characters = sender.characters.filter(id => id !== character.id);
      db.setChatUser(msg.chat, msg.sender, 'characters', sender.characters);
      if (!target.characters.includes(character.id)) {
        target.characters.push(character.id);
        db.setChatUser(msg.chat, targetId, 'characters', target.characters);
      }
      if (sender.favorite === character.id) {
        db.setChatUser(msg.chat, msg.sender, 'favorite', '');
        db.setUser(msg.sender, 'favorite', '');
      }
      const senderGlobal = db.getUser(msg.sender);
      const targetGlobal = db.getUser(targetId);
      let senderName = senderGlobal?.name?.trim() || msg.sender.split('@')[0];
      let receiverName = targetGlobal?.name?.trim() || targetId.split('@')[0];
      await sock.reply(msg.chat, `❀ *${character.name}* ha sido regalado a *${receiverName}* por *${senderName}*.`, msg, { mentions: [targetId] });
    } catch (e) {
      await msg.reply(`> An unexpected error occurred while executing command *${usedPrefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`);
    }
  },
};
