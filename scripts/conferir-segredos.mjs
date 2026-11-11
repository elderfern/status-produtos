// Checagem simples de segredos nos arquivos VERSIONADOS (instalado por `adlc projeto preparar`).
// Sem dependência e sem ação de terceiros: lista os arquivos com `git ls-files` e procura padrões
// conhecidos de chave e token. Achou algum ⇒ sai com 1 e mostra arquivo e linha (nunca o valor).
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PADROES = [
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token do GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chave da OpenAI/Anthropic', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['token do Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['chave do Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token da Cloudflare atribuído', /CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/],
  ['senha atribuída', /\b(?:password|senha|secret|segredo)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];
const IGNORAR = /(^|\/)(package-lock\.json|scripts\/conferir-segredos\.mjs)$/;
const LIMITE = 2 * 1024 * 1024;

const arquivos = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter((nome) => nome.length > 0 && !IGNORAR.test(nome));
const achados = [];
for (const arquivo of arquivos) {
  let texto;
  try {
    if (!statSync(arquivo).isFile() || statSync(arquivo).size > LIMITE) continue;
    texto = readFileSync(arquivo, 'utf8');
  } catch {
    continue;
  }
  if (texto.includes('\0')) continue; // binário
  texto.split('\n').forEach((linha, indice) => {
    for (const [nome, padrao] of PADROES) if (padrao.test(linha)) achados.push(`${arquivo}:${indice + 1}: possível ${nome}`);
  });
}
if (achados.length > 0) {
  console.error('Possíveis segredos em arquivos versionados (o valor não é mostrado):');
  for (const achado of achados) console.error(`  ${achado}`);
  process.exit(1);
}
console.log(`Nenhum segredo encontrado em ${arquivos.length} arquivo(s) versionado(s).`);
