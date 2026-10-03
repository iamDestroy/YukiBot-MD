import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsFolder = path.resolve(__dirname, '../../cmds');
const pluginCache = new Map();
const debounceMap = new Map();
const watchers = new Map();
global.comandos = global.comandos ?? new Map();
global.plugins = global.plugins ?? {};
global.cmdsExecute = global.cmdsExecute ?? [];

function registerModule(filePath, mod) {
  global.commandRevision = (global.commandRevision || 0) + 1;
  const key = path.relative(commandsFolder, filePath).replace(/\\/g, '/').replace(/\.js$/, '');
  for (const [cmd, data] of global.comandos)
    if (data.pluginKey === key) global.comandos.delete(cmd);
  global.cmdsExecute = global.cmdsExecute.filter(p => p.key !== key);
  const cmd = mod?.default;
  const dirname = path.dirname(filePath);
  const allFn = typeof cmd?.all === 'function' ? cmd.all : typeof mod?.all === 'function' ? mod.all : null;
  const beforeFn = typeof cmd?.before === 'function' ? cmd.before : typeof mod?.before === 'function' ? mod.before : null;
  global.plugins[key] = { ...mod, dirname, ...(beforeFn ? { before: beforeFn } : {}), ...(allFn ? { all: allFn } : {}) };
  if (allFn) global.cmdsExecute.push({ key, type: 'all', fn: allFn, dirname });
  if (beforeFn) global.cmdsExecute.push({ key, type: 'before', fn: beforeFn, dirname });
  if (typeof cmd?.run !== 'function') return;
  const cmds = Array.isArray(cmd.command) ? cmd.command : cmd.command ? [cmd.command] : [];
  const keys = cmds.filter(Boolean).length > 0 ? cmds.filter(Boolean).map(c => c.toLowerCase()) : cmd.customPrefix ? [key.split('/').pop().toLowerCase()] : [];
  if (!keys.length) return;
  for (const c of keys) {
    global.comandos.set(c, {
      pluginKey: key,
      run: cmd.run,
      category: cmd.category ?? 'general',
      description: cmd.description ?? '',
      isOwner: cmd.isOwner ?? false,
      isAdmin: cmd.isAdmin ?? false,
      botAdmin: cmd.botAdmin ?? false,
      customPrefix: cmd.customPrefix ?? null,
    });
  }
}

async function importModule(filePath) {
  const mtime = fs.statSync(filePath).mtimeMs;
  const cached = pluginCache.get(filePath);
  if (cached?.mtime === mtime) return cached.mod;
  const url = `${pathToFileURL(filePath).href}?v=${mtime}`;
  const mod = await import(url);
  pluginCache.set(filePath, { mtime, mod });
  return mod;
}

function collectFiles(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { collectFiles(full, out); continue; }
    if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

async function scan(dir) {
  const files = collectFiles(dir);
  const results = await Promise.allSettled(files.map(async (filePath) => {
      const mod = await importModule(filePath);
      registerModule(filePath, mod);
    }));
  let errCount = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      errCount++;
      console.error(chalk.gray(`[ ✿ ] Error cargando ${path.basename(files[i])}: ${results[i].reason?.message ?? results[i].reason}`));
    }
  }
  return { total: files.length, errors: errCount };
}

async function reloadFile(filePath) {
  if (!filePath.endsWith('.js')) return;
  if (!fs.existsSync(filePath)) {
    global.commandRevision = (global.commandRevision || 0) + 1;
    pluginCache.delete(filePath);
    const key = path.relative(commandsFolder, filePath).replace(/\\/g, '/').replace(/\.js$/, '');
    for (const [cmd, data] of global.comandos)
      if (data.pluginKey === key) global.comandos.delete(cmd);
    global.cmdsExecute = global.cmdsExecute.filter(p => p.key !== key);
    delete global.plugins[key];
    console.log(chalk.gray(`[ ✿ ] Plugin eliminado: ${path.basename(filePath)}`));
    return;
  }
  const mtime = fs.statSync(filePath).mtimeMs;
  if (pluginCache.get(filePath)?.mtime === mtime) return;
  try {
    const mod = await importModule(filePath);
    registerModule(filePath, mod);
    console.log(chalk.gray(`[ ✿ ] Plugin recargado: ${path.basename(filePath)}`));
  } catch (e) {
    console.error(chalk.gray(`[ ✿ ] Error recargando ${path.basename(filePath)}: ${e.message}`));
  }
}

global.reload = (_, filePath) => {
  if (!filePath?.endsWith('.js')) return;
  if (debounceMap.has(filePath)) clearTimeout(debounceMap.get(filePath));
  debounceMap.set(filePath, setTimeout(() => {
    debounceMap.delete(filePath);
    reloadFile(filePath).catch(() => {});
  }, 300));
};

function watchDir(dir) {
  if (watchers.has(dir) || !fs.existsSync(dir)) return;
  try {
    const w = fs.watch(dir, (event, filename) => {
      if (filename?.endsWith('.js'))
        global.reload(event, path.join(dir, filename));
    });
    w.unref();
    watchers.set(dir, w);
  } catch {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
    if (entry.isDirectory()) watchDir(path.join(dir, entry.name));
}

export default async function cmdsLoader() {
  const t = Date.now();
  const { total, errors } = await scan(commandsFolder);
  const ms = Date.now() - t;
  console.log(chalk.gray(`[ ✿ ] ${global.comandos.size}/${total} comandos cargados en ${ms}ms${errors > 0 ? ` · ${errors} con errores` : ''}`));
  watchDir(commandsFolder);
}
