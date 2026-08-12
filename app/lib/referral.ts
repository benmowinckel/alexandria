export async function checkReferral(code: string): Promise<boolean> {
  if (!code) return false;
  try {
    const response = await fetch(`/api/referral?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const data = (await response.json().catch(() => ({ valid: false }))) as { valid?: boolean };
    return data.valid === true;
  } catch {
    return false;
  }
}
