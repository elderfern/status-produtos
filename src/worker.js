import produtos from "../config/produtos.json" with { type: "json" };
import { checar } from "./verificador.js";
import { classificar, consolidar } from "./classificar.js";
import { renderizar, CSS } from "./pagina.js";

const CABECALHOS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "public, s-maxage=60",
};

async function lerEstados(db) {
  const { results } = await db.prepare("SELECT produto, estado, checado_em, falhas_seguidas FROM estado").all();
  return Object.fromEntries(results.map((r) => [r.produto, r]));
}

// espera antes de repetir uma checagem que falhou (CA3: "fora" em até 6 min)
export const ESPERA_REPETICAO_MS = 45000;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function verificarTodos(env, { fetchFn = fetch, lista = produtos, esperaMs = ESPERA_REPETICAO_MS } = {}) {
  const anteriores = await lerEstados(env.DB);
  const medir = async (p) => {
    if (p.url === "interno:teste") {
      // rota de teste da própria página (CA3): passa pela mesma regra de classificação
      const ligado = env.TESTE_LIGADO === "1";
      return { estado: classificar({ status: ligado ? 200 : 503, ms: 0 }) };
    }
    return checar(p.url, lista, { fetchFn });
  };
  for (const p of lista) {
    const r = await medir(p);
    const ant = anteriores[p.id];
    let c = consolidar(ant ? { estado: ant.estado, falhas: ant.falhas_seguidas } : null, r.estado);
    if (r.estado === "fora" && c.estado !== "fora") {
      // 1a falha: repete na mesma execução e conta como a 2a, sem esperar 5 min
      if (esperaMs > 0) await dormir(esperaMs);
      const r2 = await medir(p);
      c = consolidar(c, r2.estado);
    }
    const agora = new Date().toISOString(); // horário de cada checagem, depois dela
    // 1 escrita por produto por execução: 4 x 288 = 1.152/dia (CA8)
    await env.DB.prepare(
      "INSERT INTO estado (produto, estado, checado_em, falhas_seguidas) VALUES (?1, ?2, ?3, ?4) " +
      "ON CONFLICT(produto) DO UPDATE SET estado=?2, checado_em=?3, falhas_seguidas=?4",
    ).bind(p.id, c.estado, agora, c.falhas).run();
  }
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Método não permitido", { status: 405 });
    if (pathname === "/estilo.css") {
      return new Response(CSS, { headers: { ...CABECALHOS, "Content-Type": "text/css; charset=utf-8" } });
    }
    if (pathname === "/_teste") {
      return new Response(env.TESTE_LIGADO === "1" ? "ok" : "desligado", { status: env.TESTE_LIGADO === "1" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    }
    if (pathname !== "/") return new Response("Não encontrado", { status: 404 });
    const html = renderizar(produtos, await lerEstados(env.DB));
    return new Response(html, { headers: { ...CABECALHOS, "Content-Type": "text/html; charset=utf-8" } });
  },
  // única porta de entrada da checagem: sem rota HTTP de disparo
  async scheduled(_evento, env) {
    await verificarTodos(env);
  },
};
