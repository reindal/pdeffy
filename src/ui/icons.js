/**
 * Paths + helpers for the Pdeffy UI SVG asset pack under assets/icons/svg/.
 */

export function svgPath(base, relative) {
  return `${base}assets/icons/svg/${relative}`;
}

/** Absolute URL — required for CSS masks (url() resolves against the stylesheet, not the page). */
export function svgAbsoluteUrl(base, relative) {
  const rel = svgPath(base, relative);
  try {
    return new URL(rel, window.location.href).href;
  } catch {
    return rel;
  }
}

/** Navigation / action icons that use currentColor — rendered via CSS mask. */
export function navMaskIcon(base, file, className = '') {
  const url = svgAbsoluteUrl(base, `navigation/${file}`);
  return `<span class="pdeffy-icon-mask ${className}" style="--pdeffy-icon:url('${url}')" aria-hidden="true"></span>`;
}

export function actionMaskIcon(base, file, className = '') {
  const url = svgAbsoluteUrl(base, `actions/${file}`);
  return `<span class="pdeffy-icon-mask ${className}" style="--pdeffy-icon:url('${url}')" aria-hidden="true"></span>`;
}

/** Colored tool icons — safe as <img>. */
export function toolImg(base, file, alt = '') {
  return `<img src="${svgPath(base, `pdf-tools/${file}`)}" alt="${alt}" aria-hidden="${alt ? 'false' : 'true'}">`;
}

export function logoWordmark(base) {
  return svgPath(base, 'logo/pdeffy-wordmark.svg');
}

export function logoMark(base) {
  return svgPath(base, 'logo/pdeffy-mark.svg');
}

export const TOOL_ICON_FILE = {
  merge: 'merge-pdf.svg',
  split: 'split-pdf.svg',
  template: 'template-pdf.svg',
  protect: 'shield.svg',
  compress: 'compress-pdf.svg',
  docx: 'docx-to-pdf.svg',
  xlsx: 'xlsx-to-pdf.svg',
  pptx: 'pptx-to-pdf.svg',
  image: 'image-to-pdf.svg',
  markdown: 'text-to-pdf.svg',
  pdfToFile: 'pdf-to-file.svg',
  pdfToDocx: 'pdf-to-docx.svg',
  pdfToXlsx: 'pdf-to-xlsx.svg',
  pdfToPptx: 'pdf-to-pptx.svg',
  pdfToImage: 'pdf-to-image.svg',
  pdfToMarkdown: 'pdf-to-markdown.svg',
  pdfFile: 'pdf-file.svg',
  edit: 'edit-pdf.svg',
  watermark: 'watermark.svg',
  redact: 'redact.svg',
  rotate: 'rotate-pages.svg',
  deletePages: 'delete-pages.svg',
  signature: 'signature.svg',
  settingsTool: 'settings-tool.svg',
  speed: 'speed.svg',
  ordering: 'ordering.svg',
  shield: 'shield.svg',
};

/** Map pathname segment → pdf-tools filename (same icon as Home/hub cards). */
const TOOL_PATH_ICON = [
  [/\/merge\//, TOOL_ICON_FILE.merge],
  [/\/split\//, TOOL_ICON_FILE.split],
  [/\/compressPdf\//, TOOL_ICON_FILE.compress],
  [/\/docxToPdf\//, TOOL_ICON_FILE.docx],
  [/\/excelToPdf\//, TOOL_ICON_FILE.xlsx],
  [/\/powerPointToPdf\//, TOOL_ICON_FILE.pptx],
  [/\/imageToPdf\//, TOOL_ICON_FILE.image],
  [/\/markdownToPdf\//, TOOL_ICON_FILE.markdown],
  [/\/pdfToDocx\//, TOOL_ICON_FILE.pdfToDocx],
  [/\/pdfToExcel\//, TOOL_ICON_FILE.pdfToXlsx],
  [/\/pdfToPptx\//, TOOL_ICON_FILE.pdfToPptx],
  [/\/pdfToImage\//, TOOL_ICON_FILE.pdfToImage],
  [/\/pdfToMarkdown\//, TOOL_ICON_FILE.pdfToMarkdown],
  [/\/watermark\//, TOOL_ICON_FILE.watermark],
  [/\/deletePages\//, TOOL_ICON_FILE.deletePages],
  [/\/redactPdf\//, TOOL_ICON_FILE.redact],
  [/\/protectPdf\//, TOOL_ICON_FILE.protect],
  [/\/pdfGenerator\//, TOOL_ICON_FILE.template],
  [/\/rotatePdf\//, TOOL_ICON_FILE.rotate],
  [/\/pdfEditor\//, TOOL_ICON_FILE.edit],
];

export function toolIconFileForPath(pathname) {
  const path = String(pathname || '').replace(/\\/g, '/');
  for (const [re, file] of TOOL_PATH_ICON) {
    if (re.test(path)) return file;
  }
  return TOOL_ICON_FILE.pdfFile;
}
