/**
 * Utilitários de data no padrão brasileiro (DD/MM/AAAA).
 */

function todayParts() {
  const now = new Date();
  return {
    d: String(now.getDate()).padStart(2, '0'),
    m: String(now.getMonth() + 1).padStart(2, '0'),
    y: String(now.getFullYear()),
  };
}

/** Data de hoje (fuso local do aparelho) em DD/MM/AAAA. */
export function todayBR(): string {
  const { d, m, y } = todayParts();
  return `${d}/${m}/${y}`;
}

/** Data de hoje (fuso local do aparelho) em AAAA-MM-DD. */
export function todayISO(): string {
  const { d, m, y } = todayParts();
  return `${y}-${m}-${d}`;
}

/** Converte AAAA-MM-DD (ou ISO completo) para DD/MM/AAAA. Vazio => hoje. */
export function isoToBR(value?: string | null): string {
  if (!value || !value.trim()) return todayBR();
  const clean = value.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return clean;
}

/** Aplica máscara de digitação DD/MM/AAAA. */
export function maskBR(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/** Valida DD/MM/AAAA (inclui dia/mês reais). */
export function isValidBR(value: string): boolean {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const last = new Date(year, month, 0).getDate();
  return day <= last;
}

/** Converte DD/MM/AAAA para AAAA-MM-DD; se inválida, retorna a data de hoje. */
export function brToISO(value?: string | null): string {
  if (value && isValidBR(value)) {
    const [d, m, y] = value.trim().split('/');
    return `${y}-${m}-${d}`;
  }
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().substring(0, 10);
  return todayISO();
}