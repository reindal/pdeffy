import { invoke } from '@tauri-apps/api/core';

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function toNumberArray(bytes) {
  const out = new Array(bytes.length);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    for (let j = i; j < end; j++) out[j] = bytes[j];
  }
  return out;
}

async function writeFileAsync(filePath, data, encoding) {
  let bytes;
  if (encoding === 'utf8' || encoding === 'utf-8' || typeof data === 'string') {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(toBytes(data));
    bytes = new TextEncoder().encode(text);
  } else {
    bytes = toBytes(data);
  }
  // Serialize as number[] — reliable across Tauri IPC for Vec<u8>
  await invoke('write-file-bytes', { path: filePath, contents: toNumberArray(bytes) });
}

async function readFileAsync(filePath, encoding) {
  const bytes = new Uint8Array(await invoke('read-file-bytes', { path: filePath }));
  if (encoding === 'utf8' || encoding === 'utf-8') {
    return new TextDecoder().decode(bytes);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function unlinkAsync(filePath) {
  try {
    await invoke('remove-path', { path: filePath });
  } catch (_) {
    /* best-effort */
  }
}

async function mkdirAsync(dirPath, opts) {
  await invoke('mkdir-path', {
    path: dirPath,
    options: { recursive: !!(opts && opts.recursive) },
  });
}

async function accessAsync(filePath) {
  const ok = await invoke('path-exists', { path: filePath });
  if (!ok) throw new Error(`ENOENT: ${filePath}`);
}

async function statAsync(filePath) {
  const s = await invoke('file-stat', { path: filePath });
  return {
    size: s.size,
    isFile: () => !!s.isFile,
    isDirectory: () => !!s.isDirectory,
  };
}

const promises = {
  writeFile: writeFileAsync,
  readFile: readFileAsync,
  unlink: unlinkAsync,
  mkdir: mkdirAsync,
  access: accessAsync,
  stat: statAsync,
  rm: async (p) => {
    await unlinkAsync(p);
  },
};

const fs = {
  promises,
  writeFileSync() {
    throw new Error('fs.writeFileSync is not available; use fs.promises.writeFile');
  },
  readFileSync() {
    throw new Error('fs.readFileSync is not available; use fs.promises.readFile');
  },
  existsSync() {
    throw new Error('fs.existsSync is not available in the webview');
  },
};

export default fs;
export { promises };
