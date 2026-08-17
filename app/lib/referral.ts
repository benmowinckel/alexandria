export function parseReferralInput(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';

  const fromQuery = (value: string) => {
    try {
      const href = value.includes('://') ? value : `https://${value}`;
      const url = new URL(href);
      const ref = url.searchParams.get('ref');
      if (ref) return ref.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
      if (/(^|\.)github\.com$/i.test(url.hostname)) {
        const handle = url.pathname.split('/').filter(Boolean)[0] || '';
        return handle.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
      }
    } catch {
      return '';
    }
    return '';
  };

  const linked = fromQuery(text);
  if (linked) return linked;

  const at = text.match(/@([A-Za-z0-9-]{1,39})/);
  if (at) return at[1];

  return text.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

export async function checkReferral(code: string): Promise<boolean> {
  const handle = parseReferralInput(code);
  if (!handle) return false;
  try {
    const response = await fetch(`/api/referral?code=${encodeURIComponent(handle)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({ valid: false }))) as { valid?: boolean };
    return data.valid === true;
  } catch {
    return false;
  }
}
