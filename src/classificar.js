// Regra do CA2: classifica o resultado de uma checagem.
export const LIMITE_INSTAVEL_MS = 3000;
export const LIMITE_TOTAL_MS = 10000;
export const FALHAS_PARA_FORA = 2;

/**
 * @param {{status?: number, ms?: number, erro?: boolean}} r
 * @returns {"no_ar"|"instavel"|"fora"}
 */
export function classificar(r) {
  if (!r || r.erro || !Number.isFinite(r.status) || !Number.isFinite(r.ms)) return "fora";
  if (r.status < 200 || r.status > 399) return "fora";
  if (r.ms >= LIMITE_TOTAL_MS) return "fora";
  return r.ms >= LIMITE_INSTAVEL_MS ? "instavel" : "no_ar";
}

/**
 * Mitigação de falso "fora": só vira "fora" após 2 falhas seguidas.
 * @param {{estado: string, falhas: number}|null} anterior
 * @param {"no_ar"|"instavel"|"fora"} bruto
 */
export function consolidar(anterior, bruto) {
  if (bruto !== "fora") return { estado: bruto, falhas: 0 };
  const falhas = (anterior?.falhas ?? 0) + 1;
  if (falhas >= FALHAS_PARA_FORA) return { estado: "fora", falhas };
  // ainda não confirmado: mantém o estado anterior (ou instável se não havia)
  return { estado: anterior?.estado && anterior.estado !== "fora" ? anterior.estado : anterior?.estado === "fora" ? "fora" : "instavel", falhas };
}
