// Confere o wrangler.toml antes de publicar (instalado por `adlc projeto preparar`; `.github/` é
// protegido contra agentes). Mesmas regras de `src/wrangler.ts` no ADLC Hub. Uso:
//   node .github/adlc/conferir-wrangler.mjs <projeto>   (lê ./wrangler.toml)
// Recusa: [build], route/routes, account_id, [site], workers_dev = false, tabelas inline e strings
// multilinha, [env.<x>] que não seja preview, `name` diferente de <projeto> (e de <projeto>-preview
// em [env.preview]), database_name fora de { <projeto>, <projeto>-preview }, binding diferente de DB,
// caminhos absolutos ou com "..", migrations_dir diferente de "migrations". Ok ⇒ escreve `entrada=<arquivo .js do build>` em $GITHUB_OUTPUT.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BINDINGS_PERMITIDOS = ['DB'];

function semComentario(linha) {
  let aspas = null;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (aspas !== null) {
      if (c === '\\' && aspas === '"') i += 1;
      else if (c === aspas) aspas = null;
    } else if (c === '"' || c === "'") aspas = c;
    else if (c === '#') return linha.slice(0, i);
  }
  return linha;
}

function valorSimples(bruto) {
  const v = bruto.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) return v.slice(1, -1);
  return v;
}

function caminhoSeguro(valor) {
  return valor.length > 0 && !valor.startsWith('/') && !valor.split(/[\\/]/).includes('..') && !valor.includes('\\');
}

export function conferirWrangler(texto, projeto) {
  const problemas = [];
  const nomes = { '': projeto, 'env.preview': `${projeto}-preview` };
  const bancos = [projeto, `${projeto}-preview`];
  const vistos = new Set();
  let tabela = '';
  let main = null;
  texto.split(/\r?\n/).forEach((original, indice) => {
    const onde = `linha ${indice + 1}`;
    const linha = semComentario(original).trim();
    if (linha.length === 0) return;
    if (linha.includes('"""') || linha.includes("'''")) problemas.push(`${onde}: string multilinha não é aceita`);
    const cabecalho = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(linha);
    if (cabecalho !== null) {
      tabela = cabecalho[1].split('.').map((parte) => valorSimples(parte)).join('.');
      vistos.add(tabela);
      const partes = tabela.split('.');
      if (partes.includes('build')) problemas.push(`${onde}: [build] não é aceito (o build é do workflow)`);
      if (partes.includes('site')) problemas.push(`${onde}: [site] não é aceito`);
      if (partes.some((parte) => ['route', 'routes', 'account_id'].includes(parte))) problemas.push(`${onde}: [${tabela}] não é aceito`);
      if (partes[0] === 'env' && partes[1] !== 'preview') problemas.push(`${onde}: só [env.preview] é aceito (veio [${tabela}])`);
      return;
    }
    const kv = /^((?:"[^"]*"|'[^']*'|[A-Za-z0-9_-]+)(?:\s*\.\s*(?:"[^"]*"|'[^']*'|[A-Za-z0-9_-]+))*)\s*=\s*(.*)$/.exec(linha);
    if (kv === null) return; // continuação de lista (crons, compatibility_flags...)
    const chave = kv[1].split('.').map((parte) => valorSimples(parte)).join('.');
    const valorBruto = kv[2];
    const completa = tabela.length > 0 ? `${tabela}.${chave}` : chave;
    const partes = completa.split('.');
    const ultima = partes[partes.length - 1];
    const lugar = tabela.length > 0 ? tabela : chave.includes('.') ? chave.split('.').slice(0, -1).join('.') : '';
    if (valorBruto.includes('{')) problemas.push(`${onde}: tabela inline não é aceita (${chave})`);
    if (partes.includes('build')) problemas.push(`${onde}: build não é aceito (${completa})`);
    if (partes.includes('site')) problemas.push(`${onde}: site não é aceito`);
    if (partes.some((parte) => ['route', 'routes', 'account_id'].includes(parte))) problemas.push(`${onde}: ${ultima} não é aceito (rotas e conta são do dono)`);
    if (partes[0] === 'env' && partes[1] !== 'preview') problemas.push(`${onde}: só env.preview é aceito`);
    const valor = valorSimples(valorBruto);
    if (ultima === 'workers_dev' && valor === 'false') problemas.push(`${onde}: workers_dev = false não é aceito`);
    if (ultima === 'name') {
      const esperado = nomes[lugar];
      if (esperado === undefined) problemas.push(`${onde}: name fora do topo e de [env.preview]`);
      else if (valor !== esperado) problemas.push(`${onde}: name "${valor}" diferente de "${esperado}"`);
      else vistos.add(`name:${lugar}`);
    }
    if (ultima === 'database_name' && !bancos.includes(valor)) problemas.push(`${onde}: database_name "${valor}" fora de ${bancos.join(', ')}`);
    if (ultima === 'binding' && !BINDINGS_PERMITIDOS.includes(valor)) problemas.push(`${onde}: binding "${valor}" fora de ${BINDINGS_PERMITIDOS.join(', ')}`);
    if (['main', 'migrations_dir', 'directory', 'bucket'].includes(ultima) && !caminhoSeguro(valor)) problemas.push(`${onde}: ${ultima} precisa ser caminho relativo sem ".."`);
    if (ultima === 'migrations_dir' && valor !== 'migrations') problemas.push(`${onde}: migrations_dir precisa ser "migrations"`);
    if (ultima === 'main' && lugar === '') main = valor;
  });
  if (!vistos.has('name:')) problemas.push(`falta name = "${projeto}" no topo`);
  if (!vistos.has('env.preview')) problemas.push('falta [env.preview]');
  else if (!vistos.has('name:env.preview')) problemas.push(`falta name = "${projeto}-preview" em [env.preview]`);
  let entrada = null;
  if (main === null) problemas.push('falta main');
  else if (!/\.(m?js|ts)$/.test(main)) problemas.push('main precisa terminar em .js, .mjs ou .ts');
  else entrada = main.split('/').pop().replace(/\.(m?js|ts)$/, '.js');
  return { ok: problemas.length === 0, problemas, entrada };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const projeto = process.argv[2] ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(projeto)) {
    console.error('uso: node conferir-wrangler.mjs <projeto>');
    process.exit(2);
  }
  const resultado = conferirWrangler(readFileSync('wrangler.toml', 'utf8'), projeto);
  if (!resultado.ok) {
    console.error('wrangler.toml recusado:');
    for (const problema of resultado.problemas) console.error(`  ${problema}`);
    process.exit(1);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `entrada=${resultado.entrada}\n`);
  console.log(`wrangler.toml confere (entrada ${resultado.entrada}).`);
}
