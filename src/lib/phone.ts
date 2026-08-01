/** Normaliza um número brasileiro para o formato aceito pelo WhatsApp (55 + DDD + número). */
export function normalizeBrPhone(input: string): string {
  let digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  // 10 (fixo) ou 11 (celular) dígitos = falta o código do país.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
