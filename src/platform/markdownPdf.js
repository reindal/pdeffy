import { marked } from 'marked';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { writeFile } from '@tauri-apps/plugin-fs';
import { readFile } from '@tauri-apps/plugin-fs';

function wrapMarkdownBodyHtmlForPrint(innerBodyHtml) {
  const body = String(innerBodyHtml);
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
    'font-size:11pt;line-height:1.45;color:#222;margin:24px 36px;box-sizing:border-box;}' +
    '.markdown-body{max-width:720px;margin:0 auto;}' +
    'h1,h2,h3,h4{margin-top:1.1em;margin-bottom:0.35em;font-weight:600;}' +
    'h1{font-size:1.55em;border-bottom:1px solid #eaecef;padding-bottom:0.2em;}' +
    'h2{font-size:1.3em;border-bottom:1px solid #eaecef;padding-bottom:0.15em;}' +
    'p{margin:0.55em 0;}ul,ol{margin:0.5em 0 0.5em 1.25em;}' +
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f6f8fa;' +
    'padding:0.12em 0.35em;border-radius:4px;font-size:0.9em;}' +
    'pre{background:#f6f8fa;padding:12px 14px;border-radius:6px;overflow-x:auto;}' +
    'blockquote{margin:0.6em 0;padding:0 0 0 14px;border-left:4px solid #dfe2e5;color:#555;}' +
    'table{border-collapse:collapse;width:100%;margin:1em 0;}th,td{border:1px solid #dfe2e5;padding:6px 10px;}' +
    'img{max-width:100%;height:auto;}' +
    '</style></head><body><div class="markdown-body">' +
    body +
    '</div></body></html>'
  );
}

/**
 * Render HTML string to PDF via off-screen DOM + html2canvas + jsPDF.
 */
export async function htmlStringToPdf(innerHtml, outputPath) {
  if (innerHtml == null || String(innerHtml).trim().length === 0) {
    throw new Error('Empty HTML: nothing to convert to PDF.');
  }
  if (!outputPath) throw new Error('No output path specified.');

  const fullHtml = wrapMarkdownBodyHtmlForPrint(innerHtml);
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;';
  host.innerHTML = fullHtml;
  document.body.appendChild(host);

  try {
    const target = host.querySelector('.markdown-body') || host;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const arrayBuffer = pdf.output('arraybuffer');
    await writeFile(outputPath, new Uint8Array(arrayBuffer));
    return { success: true };
  } finally {
    host.remove();
  }
}

export async function markdownFileToPdf({ inputPath, outputPath }) {
  if (!inputPath || !outputPath) {
    throw new Error('Missing Markdown file path or output path.');
  }
  const bytes = await readFile(inputPath);
  const raw = new TextDecoder().decode(bytes);
  let innerHtml = marked.parse(raw, { async: false });
  if (innerHtml != null && typeof innerHtml.then === 'function') {
    innerHtml = await innerHtml;
  }
  return htmlStringToPdf(String(innerHtml ?? ''), outputPath);
}
