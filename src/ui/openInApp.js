/**
 * Open outputs inside Pdeffy when possible (PDF → editor). Non-PDF uses the OS default app.
 */
import { invoke } from '@tauri-apps/api/core';
import { openRecentInEditor } from './shell.js';

export function isPdfFilePath(filePath) {
  return /\.pdf$/i.test(String(filePath || '').trim());
}

function basenamePath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const name = normalized.split('/').pop();
  return name || 'document.pdf';
}

/**
 * @param {string} filePath
 * @returns {Promise<{ success: boolean, inApp?: boolean }>}
 */
export async function openFileInPdeffy(filePath) {
  const path = String(filePath || '').trim();
  if (!path) return { success: false };

  if (isPdfFilePath(path)) {
    openRecentInEditor({ path, name: basenamePath(path) });
    return { success: true, inApp: true };
  }

  await invoke('open-file', { filePath: path });
  return { success: true, inApp: false };
}

export default { openFileInPdeffy, isPdfFilePath };
