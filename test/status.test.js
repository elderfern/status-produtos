import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { classificar, consolidar } from "../src/classificar.js";
import { checar, urlPermitida, USER_AGENT } from "../src/verificador.js";
import { renderizar } from "../src/pagina.js";
import worker, { verificarTodos } from "../src/worker.js";

const lista = [{ id: "a", nome: "A", url: "https://evolus.app.br" }];

test("CA2 classificação", () => {
  assert.equal(classificar({ status: 200, ms: 100 }), "no_ar");
  assert.equal(classificar({ status: 301, ms: 2999 }), "no_ar");
  assert.equal(classificar({ status: 200, ms: 3000 }), "instavel");
  assert.equal(classificar({ status: 204, ms: 9999 }), "instavel");
  assert.equal(classificar({ status: 200, ms: 10000 }), "fora");
  assert.equal(classificar({ status: 404, ms: 10 }), "fora");
  assert.equal(classificar({ status: 500, ms: 10 }), "fora");
  assert.equal(classificar({ status: 199, ms: 10 }), "fora");
  assert.equal(classificar({ status: 400, ms: 10 }), "fora");
  assert.equal(classificar({ erro: true }), "fora");
});

test("fora só após 2 falhas seguidas", () => {
  const a = consolidar({ estado: "no_ar", falhas: 0 }, "fora");
  assert.equal(a.estado, "no_ar");
  const b = consolidar(a, "fora");
  assert.equal(b.estado, "fora");
  assert.equal(consolidar(b, "no_ar").estado, "no_ar");
});

test("CA7 urlPermitida", () => {
  assert.ok(urlPermitida("https://evolus.app.br", lista));
  assert.ok(!urlPermitida("http://evolus.app.br", lista));
  assert.ok(!urlPermitida("https://evolus.app.br.evil.com", lista));
  assert.ok(!urlPermitida("https://10.0.0.1", lista));
  assert.ok(!urlPermitida("https://outro.com", lista));
  assert.ok(!urlPermitida("lixo", lista));
});

test("CA7 checar: User-Agent, redirect manual, URL fora da lista não é acessada", async () => {
  let opts, chamadas = 0;
  const f = async (_u, o) => { chamadas++; opts = o; return new Response(null, { status: 302, headers: { location: "https://evil.com" } }); };
  const r = await checar("https://evolus.app.br", lista, { fetchFn: f });
  assert.equal(opts.redirect, "manual");
  assert.equal(opts.headers["User-Agent"], USER_AGENT);
  assert.equal(r.estado, "no_ar");
  const r2 = await checar("https://outro.com", lista, { fetchFn: f });
  assert.equal(r2.estado, "fora");
  assert.equal(chamadas, 1);
});

test("checar: erro de rede e 5xx = fora", async () => {
  assert.equal((await checar("https://evolus.app.br", lista, { fetchFn: async () => { throw new Error("x"); } })).estado, "fora");
  assert.equal((await checar("https://evolus.app.br", lista, { fetchFn: async () => new Response("e", { status: 503 }) })).estado, "fora");
});

test("checar: lento = instável", async () => {
  let t = 0;
  const r = await checar("https://evolus.app.br", lista, { fetchFn: async () => { t += 4000; return new Response("", { status: 200 }); }, agora: () => t });
  assert.equal(r.estado, "instavel");
});

test("página escapa HTML e funciona sem JS", () => {
  const h = renderizar([{ id: "x", nome: "<script>" }], { x: { estado: "fora", checado_em: "2026-01-01T00:00:00Z" } });
  assert.ok(!h.includes("<script"));
  assert.ok(h.includes("Fora"));
});

test("consolidar sem histórico: 1a falha não vira fora", () => {
  const a = consolidar(null, "fora");
  assert.equal(a.falhas, 1);
  assert.notEqual(a.estado, "fora");
});

test("checar: corta em 10 s pelo AbortController", async () => {
  const f = (_u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("abortado"))));
  const ini = Date.now();
  const r = await checar("https://evolus.app.br", lista, { fetchFn: f });
  assert.equal(r.estado, "fora");
  assert.ok(Date.now() - ini >= 9500);
});

test("horário exibido em Brasília", () => {
  const h = renderizar([{ id: "x", nome: "X" }], { x: { estado: "no_ar", checado_em: "2026-11-11T15:05:00.000Z" } });
  assert.ok(h.includes("12:05:00 (Brasília)"));
  assert.ok(h.includes('datetime="2026-11-11T15:05:00.000Z"'));
});

// D1 falso sobre node:sqlite, usando a migração real
function d1(db) {
  return { prepare(sql) { const mk = (args) => ({
    bind: (...a) => mk(a),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  }); return mk([]); } };
}

test("migração aplica e reverte; worker grava e página lê", async () => {
  const db = new DatabaseSync(":memory:");
  const tabelas = () => db.prepare("SELECT name FROM sqlite_master WHERE name='estado'").all().length;
  db.exec(readFileSync("migrations/0001_estado.sql", "utf8"));
  assert.equal(tabelas(), 1);
  const env = { DB: d1(db), TESTE_LIGADO: "1" };
  const prods = [{ id: "teste", nome: "Teste", url: "interno:teste" }, { id: "a", nome: "A", url: "https://evolus.app.br" }];
  const f = async () => new Response("", { status: 200 });
  await verificarTodos(env, { fetchFn: f, lista: prods, esperaMs: 0 });
  await verificarTodos(env, { fetchFn: f, lista: prods, esperaMs: 0 });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM estado").get().c, 2);
  env.TESTE_LIGADO = "0";
  // CA3: a 1a falha é repetida na mesma execução, então uma execução basta para "fora"
  await verificarTodos(env, { fetchFn: f, lista: prods, esperaMs: 0 });
  assert.equal(db.prepare("SELECT estado FROM estado WHERE produto='teste'").get().estado, "fora");
  assert.equal(db.prepare("SELECT estado FROM estado WHERE produto='a'").get().estado, "no_ar");
  // falha passageira: a repetição dá certo e não vira "fora"
  let n = 0;
  const g = async () => (n++ === 0 ? new Response("", { status: 503 }) : new Response("", { status: 200 }));
  await verificarTodos(env, { fetchFn: g, lista: [prods[1]], esperaMs: 0 });
  assert.equal(db.prepare("SELECT estado FROM estado WHERE produto='a'").get().estado, "no_ar");
  assert.equal(db.prepare("SELECT falhas_seguidas f FROM estado WHERE produto='a'").get().f, 0);
  const resp = await worker.fetch(new Request("https://s/"), env);
  assert.equal(resp.status, 200);
  assert.equal((await worker.fetch(new Request("https://s/", { method: "POST" }), env)).status, 405);
  db.exec(readFileSync("migrations/0001_estado.down.sql", "utf8"));
  assert.equal(tabelas(), 0);
});
