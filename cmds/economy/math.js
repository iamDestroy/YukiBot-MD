global.math = global.math || {};

const limits = { facil: 10, medio: 50, dificil: 90, imposible: 100, imposible2: 160 };
const rewardRanges = { facil: [500, 1000], medio: [1000, 2000], dificil: [2000, 3500], imposible: [3500, 4800], imposible2: [5000, 6500] };

const generateRandomNumber = (max) => Math.floor(Math.random() * max) + 1;
const getOperation = () => ['+', '-', '*', '/'][Math.floor(Math.random() * 4)];

const generarProblema = (dificultad) => {
  const maxLimit = limits[dificultad] || 30;
  const num1 = generateRandomNumber(maxLimit);
  const num2 = generateRandomNumber(maxLimit);
  const operador = getOperation();
  const resultado = eval(`${num1} ${operador} ${num2}`);
  const simbolo = operador === '*' ? '×' : operador === '/' ? '÷' : operador;
  return { problema: `${num1} ${simbolo} ${num2}`, resultado };
};

export default {
  command: ['math', 'mates'],
  category: 'economy',
  description: 'Iniciar un juego de matemáticas.',
  before: async ({ msg, sock }) => {
    const chatId = msg.chat;
    const juego = global.math[chatId];
    if (!juego?.juegoActivo) return;
    const respuestaUsuario = parseFloat(msg.text?.trim());
    if (isNaN(respuestaUsuario)) return;
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const chat = global.db.data.chats[chatId];
    if (chat.primaryBot && chat.primaryBot !== botId) return;
    const user = global.db.data.chats[chatId]?.users?.[msg.sender];
    const respuestaCorrecta = parseFloat(juego.respuesta);
    if (respuestaUsuario === respuestaCorrecta) {
      const [min, max] = rewardRanges[juego.dificultad] || [500, 1000];
      const coinsAleatorio = Math.floor(Math.random() * (max - min + 1)) + min;
      global.db.data.chats[chatId].users[msg.sender].coins = (user.coins || 0 + coinsAleatorio);
      clearTimeout(juego.tiempoLimite);
      delete global.math[chatId];
      await sock.reply(chatId, `「❀」Respuesta correcta.\n> *Ganaste ›* ¥${coinsAleatorio.toLocaleString()}`, msg);
    } else {
      juego.intentos += 1;
      if (juego.intentos >= 3) {
        clearTimeout(juego.tiempoLimite);
        delete global.math[chatId];
        await sock.reply(chatId, '「✎」Te quedaste sin intentos. Suerte a la próxima.', msg);
      } else {
        await sock.reply(chatId, `「✎」Respuesta incorrecta, te quedan ${3 - juego.intentos} intentos.`, msg);
      }
    }
    return true;
  },
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const chat = global.db.data.chats[chatId];
    if (chat.adminonly || !chat.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }
    if (global.math[chatId]?.juegoActivo) {
      return sock.reply(chatId, 'ꕥ Ya hay un juego activo. Espera a que termine.', msg);
    }
    const dificultad = args[0]?.toLowerCase();
    if (!limits[dificultad]) {
      return sock.reply(chatId, '「✎」Especifica una dificultad válida: *facil, medio, dificil, imposible, imposible2*', msg);
    }
    const { problema, resultado } = generarProblema(dificultad);
    const problemMessage = await sock.reply(chatId, `「✩」Tienes 1 minuto para resolver:\n\n> ✩ *${problema}*\n\n_✐ Responde con el número correcto!_`, msg);
    global.math[chatId] = { juegoActivo: true, problema, respuesta: resultado.toString(), intentos: 0, dificultad, timeout: Date.now() + 60000, problemMessageId: problemMessage.key?.id, tiempoLimite: setTimeout(() => {
        if (global.math[chatId]?.juegoActivo) {
          delete global.math[chatId];
          sock.reply(chatId, `「✿」Tiempo agotado. La respuesta era *${resultado}*.`, msg);
        }
      }, 60000)
    };
  }
};
