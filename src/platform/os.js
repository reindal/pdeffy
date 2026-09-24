function platform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win32';
  if (ua.includes('mac')) return 'darwin';
  return 'linux';
}

function tmpdir() {
  // Temp files are written beside user-chosen output paths in this app.
  return '';
}

function homedir() {
  return '';
}

const os = { platform, tmpdir, homedir };
export default os;
export { platform, tmpdir, homedir };
