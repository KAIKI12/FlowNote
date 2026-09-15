const DOWNLOAD_URL_LIFETIME_MS = 1000;

interface DownloadRequest {
  content: string;
  fileName: string;
  type: string;
}

export function downloadText({ content, fileName, type }: DownloadRequest): void {
  const name = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  if (!name) throw new Error('导出文件名不能为空');
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
  }
}
