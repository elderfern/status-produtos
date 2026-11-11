const ROTULO = { no_ar: "No ar", instavel: "Instável", fora: "Fora" };
const SIMBOLO = { no_ar: "●", instavel: "▲", fora: "✕" };

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Mostra o instante ISO (UTC) no horário de Brasília. */
export function horaBrasilia(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d) + " (Brasília)";
}

export const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#111;--ok:#0b5d1e;--warn:#7a4b00;--bad:#9b1c1c;--bd:#ccc}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#f2f2f2;--ok:#6fdc8c;--warn:#ffc44d;--bad:#ff8a8a;--bd:#444}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:1rem}
ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;border:1px solid var(--bd);border-radius:8px;padding:.75rem 1rem;margin:.5rem 0}
.no_ar{color:var(--ok)}.instavel{color:var(--warn)}.fora{color:var(--bad)}.e{font-weight:700}small{opacity:.85}`;

/** @param produtos lista da configuração; @param estados mapa id -> {estado, checado_em} */
export function renderizar(produtos, estados) {
  const itens = produtos.map((p) => {
    const e = estados[p.id];
    const est = e && ROTULO[e.estado] ? e.estado : null;
    const rot = est ? `${SIMBOLO[est]} ${ROTULO[est]}` : "Sem dados";
    const iso = e?.checado_em ? esc(e.checado_em) : "";
    const hora = e?.checado_em ? esc(horaBrasilia(e.checado_em)) : "—";
    return `<li><span>${esc(p.nome)}</span><span><span class="e ${est ?? ""}">${esc(rot)}</span> <small>última checagem: <time datetime="${iso}">${hora}</time></small></span></li>`;
  });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Status dos produtos</title><link rel="stylesheet" href="/estilo.css"></head><body><h1>Status dos produtos</h1><ul>${itens.join("")}</ul></body></html>`;
}
