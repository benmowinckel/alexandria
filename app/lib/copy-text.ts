export type CopyState = 'idle' | 'copied' | 'error';

export async function copyText(text: string): Promise<CopyState> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* noop */ }
    document.body.removeChild(area);
    return copied ? 'copied' : 'error';
  }
}
