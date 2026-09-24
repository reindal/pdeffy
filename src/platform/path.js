function normalize(p) {
  if (!p) return '.';
  return String(p).replace(/\\/g, '/');
}

function basename(p, ext) {
  const n = normalize(p);
  const parts = n.split('/');
  let base = parts[parts.length - 1] || '';
  if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
  return base;
}

function dirname(p) {
  const n = normalize(p);
  const idx = n.lastIndexOf('/');
  if (idx <= 0) return n.startsWith('/') ? '/' : '.';
  return n.slice(0, idx) || '/';
}

function extname(p) {
  const base = basename(p);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i) : '';
}

function join(...parts) {
  const joined = parts
    .filter((p) => p != null && p !== '')
    .map((p, i) => {
      let s = normalize(String(p));
      if (i > 0) s = s.replace(/^\/+/, '');
      return s.replace(/\/+$/, '');
    })
    .filter(Boolean)
    .join('/');
  // Preserve Windows drive roots like C:/
  return joined.replace(/\/+/g, '/');
}

function parse(p) {
  const n = normalize(p);
  const base = basename(n);
  const ext = extname(n);
  const name = ext ? base.slice(0, -ext.length) : base;
  return { root: '', dir: dirname(n), base, ext, name };
}

const path = { join, basename, dirname, extname, parse, normalize, sep: '/' };
export default path;
export { join, basename, dirname, extname, parse, normalize };
