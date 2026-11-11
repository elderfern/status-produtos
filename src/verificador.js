import { classificar, LIMITE_TOTAL_MS } from "./classificar.js";

export const USER_AGENT = "status-produtos-verificador/1.0 (+pagina de status; 1 GET a cada 5 min)";

/** CA7: só https, sem IP literal, e a URL precisa constar da lista. */
export function urlPermitida(url, produtos) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return false;
  return produtos.some((p) => {
    try { return new URL(p.url).href === u.href; } catch { return false; }
  });
}

/**
 * Faz 1 GET. Nunca segue redirecionamento (3xx já conta como "no ar"),
 * não lê o corpo e não devolve mensagens da resposta.
 */
export async function checar(url, produtos, { fetchFn = fetch, agora = () => Date.now() } = {}) {
  if (!urlPermitida(url, produtos)) return { estado: "fora", status: 0, ms: 0 };
  const ini = agora();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LIMITE_TOTAL_MS);
  try {
    const resp = await fetchFn(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    const ms = agora() - ini;
    try { await resp.body?.cancel(); } catch { /* ignora */ }
    // redirect "manual" no Workers devolve a resposta 3xx; em outros runtimes pode vir "opaqueredirect" (status 0)
    const status = resp.type === "opaqueredirect" ? 302 : resp.status;
    return { estado: classificar({ status, ms }), status, ms };
  } catch {
    return { estado: "fora", status: 0, ms: agora() - ini };
  } finally {
    clearTimeout(t);
  }
}
