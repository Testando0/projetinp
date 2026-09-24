/**
 * ════════════════════════════════════════════════════════════════════════
 *  GMPOL Sistema Central v5.16 — MASTER VIP COMPLETO
 *  + VIP + Recados + Foto de Perfil (imgbb) + Master ajusta horas
 *  + Editar prêmios + Punições na auditoria
 *  + 🌟 MASTER VIP: Sequência de dias/turnos, Score do perfil (0-100)
 *  + 🏅 Medalhas (Bronze/Prata/Ouro/Diamante) — só Master dá (máx 5)
 *  + ⏱️ Banco de horas VIP detalhado (normais, extras, operação, semana, recorde)
 *  + 🏆 Hall da Fama / Funcionário do Mês
 *  + 🚓 Sistema Prisional (PF, envolvido, hora, motivo)
 * ════════════════════════════════════════════════════════════════════════
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const TZ = 'America/Sao_Paulo';
function brTimeStr(ts)     { return new Date(ts).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); }
function brTimeStrSec(ts)  { return new Date(ts).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function brDateStr(ts)     { return new Date(ts).toLocaleDateString('pt-BR', { timeZone: TZ }); }
function nextBrDateStr(dstr) {
  const p = dstr.split('/');
  const dd = +p[0], mm = +p[1], yy = +p[2];
  const t = new Date(Date.UTC(yy, mm - 1, dd + 1, 12));
  return String(t.getUTCDate()).padStart(2, '0') + '/' +
         String(t.getUTCMonth() + 1).padStart(2, '0') + '/' +
         t.getUTCFullYear();
}

const CARGO_PERM_SRV = { admin: 7, chefe: 6, delegado: 5, escrivao: 4, tatico: 3, agente: 2, gm: 1 };
const CARGO_LABEL_SRV = {
  admin: 'Admin master', chefe: 'Chefe de polícia', delegado: 'Delegado',
  escrivao: 'Escrivão', tatico: 'Tático', agente: 'Agente oficial', gm: 'Guarda municipal'
};
const CARGO_BASE_MINUTES = { gm: 90, agente: 150, tatico: 210, escrivao: 240, delegado: 300, chefe: 0, admin: 0 };

const MEDALHAS_VALIDAS = { bronze: '🥉', prata: '🥈', ouro: '🥇', diamante: '💎' };
const MEDALHAS_MAX_POR_PATENTE = 5;
const DEFAULT_VIP_COMBOS = [
  { id: 'bronze', dias: 5, valor: 4000, icone: '🥉', cor: 'bronze' },
  { id: 'prata', dias: 10, valor: 8000, icone: '🥈', cor: 'prata' },
  { id: 'ouro', dias: 20, valor: 12000, icone: '🥇', cor: 'ouro' },
  { id: 'diamante', dias: 30, valor: 20000, icone: '💎', cor: 'diamante' }
];
const RECRUTAMENTO_QUESTOES = [
  { id: 1, tipo: 'texto', titulo: 'Cite 8 códigos Q.' },
  { id: 2, tipo: 'texto', titulo: 'Cite 5 regras da Bíblia RP.' },
  { id: 3, tipo: 'texto', titulo: 'O que é hierarquia?' },
  { id: 4, tipo: 'texto', titulo: 'O que é abuso de poder?' },
  { id: 5, tipo: 'texto', titulo: 'Qual sua disponibilidade de horário?' },
  { id: 6, tipo: 'texto', titulo: 'Você pode entrar para ajudar nos 2 CRMs? Explique.' },
  { id: 7, tipo: 'texto', titulo: 'Cite 2 regras de carregamento.' },
  { id: 8, tipo: 'texto', titulo: 'Cite 3 regras que não podem ser quebradas da PF.' },
  { id: 9, tipo: 'texto', titulo: 'Você teria disponibilidade para cobrir algum QTH em hora extra?' },
  { id: 10, tipo: 'texto', titulo: 'Se um grupo de azaralhos vier para te matar e você só tiver o cassetete e estiver sem farda, o que faria?' },
  { id: 11, tipo: 'texto', titulo: 'Se você receber uma ordem direta do Delegado, mas o Chefe de Polícia te der outra ordem, o que faria?' },
  { id: 12, tipo: 'escolha', titulo: 'Se seu cargo fosse rebaixado com motivo justo, o que faria?', opcoes: ['Aceitar a punição e questionar', 'Questionar e entender', 'Pedir para a Chefe repensar', 'Aceitar a punição sem questionamento'], correta: 3 },
  { id: 13, tipo: 'escolha', titulo: 'Cite qual questão não seria considerada abuso de poder.', opcoes: ['Atordoar sem avisar e prender', 'Dar avisos, prender e avisar o motivo da prisão', 'Matar atordoado (legítima defesa)', 'Após morrer, voltar, atordoar e prender o mesmo por homicídio'], correta: 1 },
  { id: 14, tipo: 'escolha', titulo: 'Se estiver sozinho no QTH HP e diversos azaralhos estiverem gritando, xingando e colocando música no VoIP, o que faria?', opcoes: ['Com a pressão total, sairia e deixaria resolverem com a Administração', 'Chamaria QRR e floodaria a rádio sem parar até todos ajudarem', 'Chamaria a Administração e deixaria eles resolverem', 'Manteria a calma, avisaria QRU na rádio, aguardaria o efetivo e conteria conforme as regras da PF', 'Atordoaria todos, gritaria e usaria taser dentro do HP'], correta: 3 },
  { id: 15, tipo: 'escolha', titulo: 'Se uma PF Delegada der uma ordem, mas um Delegado também der uma ordem diferente, o que priorizaria?', opcoes: ['Obedeceria a PF Delegada porque ela deu a primeira ordem', 'Obedeceria o Delegado por ser homem e ter a farda bonita e posturada', 'Conversaria com os dois para resolver qual QTH assumir'], correta: 2 }
];

const DEFAULT_ROLETA_PREMIOS = [
  { id: 'p1', valor: 100,   peso: 70,  cor: '#10b981', cor2: '#059669', corBorda: '#34d399', nome: 'Comum',      icone: '💵', raridade: 'common' },
  { id: 'p2', valor: 500,   peso: 20,  cor: '#3b82f6', cor2: '#1d4ed8', corBorda: '#60a5fa', nome: 'Incomum',    icone: '💰', raridade: 'uncommon' },
  { id: 'p3', valor: 2000,  peso: 40,  cor: '#f59e0b', cor2: '#b45309', corBorda: '#fbbf24', nome: 'Raro',       icone: '💎', raridade: 'rare' },
  { id: 'p4', valor: 3000,  peso: 5,   cor: '#ef4444', cor2: '#991b1b', corBorda: '#f87171', nome: 'Muito Raro', icone: '🏆', raridade: 'epic' },
  { id: 'p5', valor: 4000,  peso: 5,   cor: '#8b5cf6', cor2: '#5b21b6', corBorda: '#a78bfa', nome: 'Épico',      icone: '👑', raridade: 'epic2' },
  { id: 'p6', valor: 10000, peso: 0.5, cor: '#ec4899', cor2: '#9d174d', corBorda: '#f9a8d4', nome: 'LENDÁRIO',   icone: '💠', raridade: 'legendary' }
];

const PROVAS_CARGO = {
  gm: [
    { enunciado: 'O Guarda inicia o serviço na qual patente?', alt: ['Agente','Guarda','Escrivão','Tático'], correta: 1 },
    { enunciado: 'Quais equipamentos o Guarda pode utilizar no serviço?', alt: ['Pistola G18, colete e cassetete','Cassetete, taser, colete e Desert Eagle somente em caso de ameaça','Fuzil M4, pistola e colete','Apenas cassetete e colete'], correta: 1 },
    { enunciado: 'Onde o Guarda deve permanecer durante o turno?', alt: ['Em todo o mapa livremente','Somente na Delegacia (DP)','Na rua e na DP','Onde o chefe mandar'], correta: 2 },
    { enunciado: 'Qual das três regras básicas da PF NÃO faz parte?', alt: ['Respeito','Comprometimento','Velocidade','Não azaralhar'], correta: 2 },
    { enunciado: 'A Desert Eagle do Guarda é liberada para uso em qual situação?', alt: ['Sempre que estiver de plantão','Apenas em caso de ameaça','Nunca, é proibida','Quando o chefe autorizar por rádio'], correta: 1 },
    { enunciado: 'Quais patentes da PF podem utilizar a arma de fogo liberada (tipo Desert)?', alt: ['Guardas e Agentes','Escrivão, Tático e Delegado/Chefe','Todos os cargos','Apenas o Chefe'], correta: 1 },
    { enunciado: 'Para o Guarda ser promovido, ele precisa:', alt: ['Apenas de tempo jogado','Fazer paradinhas e passar pela prova','Pagar a administração','Pedir pra chefe diretamente'], correta: 1 },
    { enunciado: 'Qual é a ÚNICA patente da PF em que a promoção é feita APENAS por mérito, sem prova?', alt: ['Agente','Tático','Escrivão','Delegado'], correta: 2 },
    { enunciado: 'É correto afirmar que o Guarda pode conduzir presos?', alt: ['Sim, sempre','Não, isso é função do Agente ou superior','Sim, mas só a pé','Só quando autorizado pelo Chefe na hora'], correta: 1 },
    { enunciado: 'O que o Guarda DEVE fazer ao encontrar um superior no Barra Amiga ou no interior da DP?', alt: ['Ignorar','Prender','Prestar continência','Pedir hora'], correta: 2 }
  ],
  agente: [
    { enunciado: 'Qual é uma das principais funções de um Agente?', alt: ['Patrulhar e atender ocorrências','Ignorar chamados','Aplicar punições sem motivo','Fazer apenas escoltas'], correta: 0 },
    { enunciado: 'O que é abuso de poder?', alt: ['Cumprir uma ordem legítima','Usar a autoridade de forma indevida','Fazer uma abordagem','Solicitar apoio'], correta: 1 },
    { enunciado: 'Um policial pode prender alguém apenas porque não gosta da pessoa?', alt: ['Sim','Não','Apenas se estiver fardado','Apenas durante patrulhamento'], correta: 1 },
    { enunciado: 'Durante uma abordagem, o Agente deve:', alt: ['Agir com respeito e seguir os procedimentos','Ofender o cidadão','Usar força sem necessidade','Prender todos os envolvidos'], correta: 0 },
    { enunciado: 'O policial pode usar sua autoridade para conseguir dinheiro de um jogador?', alt: ['Sim','Não','Apenas em ocorrências','Apenas se for pouco dinheiro'], correta: 1 },
    { enunciado: 'Se um policial ameaça prender alguém sem justificativa para conseguir vantagem, isso pode ser:', alt: ['Abuso de poder','Patrulhamento','Procedimento normal','QRR'], correta: 0 },
    { enunciado: 'O que deve ser feito ao receber um QRR?', alt: ['Ignorar','Prestar apoio conforme os procedimentos','Desligar o rádio','Sair da ocorrência'], correta: 1 },
    { enunciado: 'O uso da força deve ser:', alt: ['Sempre utilizado','Necessário e proporcional à situação','Usado para intimidar','Usado contra pessoas'], correta: 1 },
    { enunciado: 'O Agente pode utilizar o armamento apenas para intimidar um cidadão?', alt: ['Sim','Não','Sempre que estiver armado','Durante qualquer discussão'], correta: 1 },
    { enunciado: 'Um policial presencia outro Agente cometendo abuso de poder. O correto é:', alt: ['Ajudar a esconder','Seguir o procedimento correto para comunicar a infração','Ignorar sempre','Fazer o mesmo'], correta: 1 },
    { enunciado: 'O que é considerado uma conduta profissional?', alt: ['Respeito, disciplina e cumprimento das regras','Abuso de autoridade','Provocar suspeitos','Ignorar superiores'], correta: 0 },
    { enunciado: 'Durante uma perseguição, o Agente deve:', alt: ['Seguir os procedimentos da corporação','Atirar sempre','Bater propositalmente no veículo','Ignorar a segurança'], correta: 0 },
    { enunciado: 'Um Agente pode revistar qualquer pessoa sem motivo?', alt: ['Sim','Não, deve seguir as regras','Sempre que estiver em serviço','Apenas à noite'], correta: 1 },
    { enunciado: 'Se um cidadão insultar o policial, o Agente deve:', alt: ['Manter o controle e agir conforme as regras','Usar a arma','Prender automaticamente','Agredir o cidadão'], correta: 0 },
    { enunciado: 'O que caracteriza uma ordem legítima?', alt: ['Uma ordem compatível com as regras','Qualquer ordem dada por um superior','Uma ordem para obter dinheiro','Uma ordem para prejudicar alguém'], correta: 0 },
    { enunciado: 'O Agente pode usar informações obtidas no serviço para benefício pessoal?', alt: ['Sim','Não','Apenas fora do expediente','Apenas com autorização de amigos'], correta: 1 },
    { enunciado: 'Qual atitude pode ser considerada abuso de poder?', alt: ['Realizar uma abordagem conforme as regras','Utilizar a autoridade para perseguir sem justificativa','Solicitar reforço','Fazer patrulhamento'], correta: 1 },
    { enunciado: 'Se uma situação estiver fora da capacidade da equipe, o Agente deve:', alt: ['Solicitar apoio','Agir sozinho obrigatoriamente','Ignorar a ocorrência','Abandonar o rádio'], correta: 0 },
    { enunciado: 'Qual é a importância do rádio durante o serviço?', alt: ['Comunicação e coordenação','Conversar assuntos pessoais','Provocar outros jogadores','Evitar pedir ajuda'], correta: 0 },
    { enunciado: 'Qual comportamento pode prejudicar a carreira de um Agente?', alt: ['Disciplina e respeito','Abuso de poder, corrupção e descumprimento das regras','Trabalho em equipe','Comunicação pelo rádio'], correta: 1 }
  ],
  tatico: [
    { enunciado: 'Qual é a principal função do Tático?', alt: ['Fazer apenas patrulhamento','Atuar em ocorrências de maior risco','Aplicar multas','Fazer apenas abordagens'], correta: 1 },
    { enunciado: 'O que significa QRR?', alt: ['Questionário de Rotina de Rádio','Pedido de reforço','Qualificação de Recruta','Quadro de Ronda Rápida'], correta: 1 },
    { enunciado: 'Quando um Tático recebe um QRR, ele deve:', alt: ['Ignorar','Prestar apoio conforme o procedimento','Desligar o rádio','Continuar a patrulha normalmente'], correta: 1 },
    { enunciado: 'O uso da força deve ser:', alt: ['Sempre permitido','Proporcional à situação e conforme as regras','Usado para intimidar','Usado em qualquer discussão'], correta: 1 },
    { enunciado: 'Durante uma abordagem, o policial deve:', alt: ['Manter a calma e seguir o procedimento','Ofender o suspeito','Usar força imediatamente','Ignorar as regras'], correta: 0 },
    { enunciado: 'Qual característica é importante para um Tático?', alt: ['Agir sozinho','Trabalho em equipe','Ignorar ordens','Procurar confrontos'], correta: 1 },
    { enunciado: 'Em uma ocorrência de alto risco, o Tático deve:', alt: ['Agir sem comunicação','Coordenar a equipe e solicitar apoio','Abandonar a ocorrência','Atuar sem planejamento'], correta: 1 },
    { enunciado: 'O policial pode usar sua função para benefício próprio?', alt: ['Sim','Apenas fora do serviço','Não','Somente com amigos'], correta: 2 },
    { enunciado: 'A comunicação pelo rádio durante uma operação serve para:', alt: ['Conversar assuntos pessoais','Coordenar a equipe e solicitar apoio','Distrair os policiais','Evitar contato com outras unidades'], correta: 1 },
    { enunciado: 'Qual comportamento é esperado de um Tático?', alt: ['Disciplina, respeito às regras e trabalho em equipe','Abuso de autoridade','Desobediência a procedimentos','Agir sempre sozinho'], correta: 0 },
    { enunciado: 'O Tático deve conhecer:', alt: ['Apenas os armamentos','As regras e procedimentos da unidade','Apenas os veículos','Apenas os códigos de rádio'], correta: 1 },
    { enunciado: 'Se a ocorrência for muito grande para a equipe presente:', alt: ['Agir sozinho','Solicitar reforço','Ignorar a ocorrência','Sair do servidor'], correta: 1 },
    { enunciado: 'Um policial deve usar o armamento:', alt: ['Para intimidar jogadores','Somente quando permitido e necessário','Sempre que estiver armado','Em qualquer discussão'], correta: 1 },
    { enunciado: 'Durante uma perseguição, o policial deve:', alt: ['Ignorar os procedimentos','Priorizar a segurança e seguir as regras','Atirar sempre','Colidir propositalmente'], correta: 1 },
    { enunciado: 'O trabalho em equipe é importante porque:', alt: ['Facilita a coordenação da operação','Impede a comunicação','Permite agir sem regras','Evita pedir ajuda'], correta: 0 },
    { enunciado: 'Um Tático pode desrespeitar as regras por estar em uma unidade especial?', alt: ['Sim','Não','Apenas em perseguições','Apenas em operações'], correta: 1 },
    { enunciado: 'Ao receber uma ordem de um superior, o policial deve:', alt: ['Seguir os procedimentos e regras aplicáveis','Ignorar sempre','Fazer o contrário','Sair da ocorrência'], correta: 0 },
    { enunciado: 'Em uma ocorrência com vários suspeitos, o ideal é:', alt: ['Cada policial agir por conta própria','Coordenar a equipe e pedir apoio quando necessário','Ignorar o rádio','Entrar sem planejamento'], correta: 1 },
    { enunciado: 'Qual atitude pode prejudicar uma operação?', alt: ['Comunicação','Trabalho em equipe','Agir sem coordenação','Solicitar apoio'], correta: 2 },
    { enunciado: 'O que um candidato a Tático deve demonstrar?', alt: ['Disciplina, conhecimento das regras e trabalho em equipe','Abuso de autoridade','Desrespeito aos superiores','Busca constante por confronto'], correta: 0 }
  ],
  escrivao: [
    { enunciado: 'Durante uma operação, um superior determina pelo rádio que toda a equipe avance, mas o Delegado percebe que a ordem pode colocar agentes em risco. Qual é a conduta mais adequada?', alt: ['Cumprir imediatamente','Ignorar a ordem','Comunicar a preocupação pelo rádio e seguir o procedimento hierárquico','Encerrar a operação sem comunicar ninguém'], correta: 2 },
    { enunciado: 'Um policial informa pelo rádio "QTH" durante uma ocorrência. Qual é a finalidade?', alt: ['Informar a localização','Solicitar prioridade','Informar que a ocorrência terminou','Solicitar autorização para abandonar'], correta: 0 },
    { enunciado: 'Um agente comete infração disciplinar e pede ao Delegado que "deixe passar" por ter bons resultados. Qual princípio prevalece?', alt: ['Histórico positivo pode justificar dispensa','A amizade deve ser considerada antes da disciplina','A conduta deve ser analisada conforme as regras','O superior pode anular qualquer infração'], correta: 2 },
    { enunciado: 'Durante uma abordagem, um cidadão provoca verbalmente e o agente aplica punição que não corresponde à infração. Qual problema principal existe?', alt: ['Apenas falha de comunicação','Possível abuso de autoridade','Procedimento normal','Apenas falha no uso do rádio'], correta: 1 },
    { enunciado: 'Em operação conjunta, um Delegado recebe informações contraditórias de duas equipes. Qual atitude mais adequada?', alt: ['Presumir que todos compreenderam','Organizar a comunicação e confirmar instruções','Retirar todos os agentes','Ignorar as equipes que não confirmaram'], correta: 1 },
    { enunciado: 'Um policial presencia colega usando recursos da corporação para vantagem pessoal. O colega pede segredo. O policial deve:', alt: ['Manter segredo','Participar apenas se receber vantagem','Comunicar o fato pelos canais disciplinares apropriados','Esperar até que outro descubra'], correta: 2 },
    { enunciado: 'Durante uma ocorrência, um superior transmite ordem incompatível com regra operacional. O Delegado deve:', alt: ['Executar imediatamente','Questionar de forma profissional e verificar a regra','Desobedecer publicamente','Encerrar a comunicação'], correta: 1 },
    { enunciado: 'Um agente está sendo investigado e um superior determina remoção definitiva sem seguir procedimento. Qual princípio está sendo desrespeitado?', alt: ['Hierarquia','Disciplina','Código Q','Patrulhamento'], correta: 1 },
    { enunciado: 'Um Delegado percebe subordinado usando conduta desnecessariamente agressiva com civis sem ameaça. O Delegado deve:', alt: ['Permitir','Intervir, orientar e adotar medidas previstas','Ignorar','Autorizar uso de força maior'], correta: 1 },
    { enunciado: 'Um Delegado recebe denúncia de possível abuso de poder envolvendo agente próximo. Qual decisão demonstra melhor postura?', alt: ['Arquivar imediatamente','Punir imediatamente','Preservar evidências e apurar conforme regras','Divulgar publicamente'], correta: 2 }
  ]
};

const PRISOES_QUESTOES = [
  'Cite todos os comandos em ordem para efetuar prisões.',
  'Qual procedimento para levar o preso para comer?',
  'Como funciona o QTH PS?',
  'Como funciona o QTH HP?',
  'Cite 4 regras da PF que não podem ser quebradas.',
  'O que é abuso de poder? Cite 3 exemplos.',
  'Quais regras de carregamento?',
  'Cite abaixo todas as estrelas e abreviação. Exemplo: ASS - 1 ESTRELA (10 MINUTOS).',
  'Cite a cadeia de comando e a hierarquia.',
  'O que é insubordinação?'
];

function isMaster(u) { return !!u && u.user === 'master'; }
function findUserByRef(ref) {
  if (!ref) return null;
  return DB.users.find(u => u.user === ref) || DB.users.find(u => u.nome === ref) || null;
}

// ═══ Calcula horas reais a partir dos pontos ═══
function calcHorasServidor(userLogin){
  const pts=DB.pontos.filter(p=>p.userLogin===userLogin&&p.type==='saida'&&p.trabalhado!==undefined);
  let trab=0,extra=0,debt=0,pausa=0,turnos=0;
  pts.forEach(p=>{trab+=(p.trabalhado||0);pausa+=(p.pausaMins||0);extra+=(p.extraMins||0);debt+=(p.debtMins||0);turnos++;});
  return {trab,extra,debt,pausa,turnos};
}

// ═══ 🌟 VIP: XP do perfil (horas + medalhas + OCs + sequência) ═══
function calcXP(u){
  const h = calcHorasServidor(u.user);
  const ocs = DB.ocs.filter(o => o.delegado === u.nome).length;
  return Math.floor(h.trab / 60) * 10 + h.extra +
         (u.medalhas || []).length * 250 +
         ocs * 100 + (u.sequenciaAtiva || 0) * 50;
}

const TMP_FILE  = path.join('/tmp', 'gmpol-data.json');
const SEED_FILE = path.join(__dirname, 'data.json');

function getDefaultData() {
  const now = Date.now();
  return {
    users: [
      { user: 'master', pass: 'masterx512', cargo: 'admin', nome: 'Master',       ativo: true, criadoPor: 'sistema', criadoEm: now, cicloDias: [], folgaDia: null, girosBonus: 0, ultimoGiroRoleta: null, horasExtrasAjustadas: 0, horasDevidasAjustadas: 0, vip: true, recado: '', foto: '', medalhas: [], score: 50, sequenciaAtiva: 0, recordeHoras: 0 },
      { user: 'chefe',  pass: 'chefe123',   cargo: 'chefe', nome: 'Chefe Padrão', ativo: true, criadoPor: 'sistema', criadoEm: now, cicloDias: [], folgaDia: null, girosBonus: 0, ultimoGiroRoleta: null, horasExtrasAjustadas: 0, horasDevidasAjustadas: 0, vip: false, recado: '', foto: '', medalhas: [], score: 50, sequenciaAtiva: 0, recordeHoras: 0 },
      { user: 'gm',     pass: 'gm123',      cargo: 'gm',    nome: 'GM Padrão',    ativo: true, criadoPor: 'master',  criadoEm: now, cicloDias: [], folgaDia: null, girosBonus: 0, ultimoGiroRoleta: null, horasExtrasAjustadas: 0, horasDevidasAjustadas: 0, vip: false, recado: '', foto: '', medalhas: [], score: 50, sequenciaAtiva: 0, recordeHoras: 0 }
    ],
    ocs: [], puns: [], pontos: [], provas: [], audit: [],
    feedbacks: [], chats: [], prisoes: [], recrutamentos: [],
    roletaPremios: DEFAULT_ROLETA_PREMIOS,
    vipCombos: DEFAULT_VIP_COMBOS
  };
}

function migrate(d) {
  let m = d.users.find(u => u.user === 'master');
  if (!m) {
    const old = d.users.find(u => u.user === 'admin');
    if (old) { old.user = 'master'; old.pass = 'masterx512'; old.nome = 'Master'; }
    else d.users.push({ user: 'master', pass: 'masterx512', cargo: 'admin', nome: 'Master', ativo: true, criadoPor: 'sistema', criadoEm: Date.now(), cicloDias: [], folgaDia: null, girosBonus: 0, ultimoGiroRoleta: null, horasExtrasAjustadas: 0, horasDevidasAjustadas: 0, vip: true, recado: '', foto: '', medalhas: [], score: 50, sequenciaAtiva: 0, recordeHoras: 0 });
  } else { m.pass = 'masterx512'; m.cargo = 'admin'; }
  m.vip = true;
  m.vipExpiresAt = null;
  return d;
}

function sanitize(p) {
  const def = getDefaultData();
  const users = (Array.isArray(p.users) ? p.users : def.users).map(u => ({
    ...u,
    cicloDias:              Array.isArray(u.cicloDias) ? u.cicloDias : [],
    folgaDia:               u.folgaDia || null,
    girosBonus:             typeof u.girosBonus === 'number' ? u.girosBonus : 0,
    ultimoGiroRoleta:       u.ultimoGiroRoleta || null,
    horasExtrasAjustadas:   typeof u.horasExtrasAjustadas === 'number' ? u.horasExtrasAjustadas : 0,
    horasDevidasAjustadas:  typeof u.horasDevidasAjustadas === 'number' ? u.horasDevidasAjustadas : 0,
    vip:                    u.user === 'master' || u.vip === true,
    vipExpiresAt:           u.user === 'master' ? null : (Number.isFinite(u.vipExpiresAt) ? u.vipExpiresAt : null),
    recado:                 typeof u.recado === 'string' ? u.recado.slice(0, 200) : '',
    foto:                   typeof u.foto === 'string' ? u.foto.slice(0, 500) : '',
    medalhas:               Array.isArray(u.medalhas) ? u.medalhas : [],
    score:                  typeof u.score === 'number' ? u.score : 50,
    sequenciaAtiva:         typeof u.sequenciaAtiva === 'number' ? u.sequenciaAtiva : 0,
    recordeHoras:           typeof u.recordeHoras === 'number' ? u.recordeHoras : 0
  }));
  const roletaPremios = Array.isArray(p.roletaPremios) && p.roletaPremios.length > 0
    ? p.roletaPremios.map(pr => ({
        id: pr.id || 'p-' + Math.random().toString(36).slice(2, 8),
        valor:    typeof pr.valor === 'number' ? pr.valor : 100,
        peso:     typeof pr.peso === 'number' ? pr.peso : 1,
        cor:      typeof pr.cor === 'string' ? pr.cor : '#10b981',
        cor2:     typeof pr.cor2 === 'string' ? pr.cor2 : pr.cor,
        corBorda: typeof pr.corBorda === 'string' ? pr.corBorda : pr.cor,
        nome:     typeof pr.nome === 'string' ? pr.nome : 'Prêmio',
        icone:    typeof pr.icone === 'string' ? pr.icone : '🎁',
        raridade: typeof pr.raridade === 'string' ? pr.raridade : 'common'
      }))
    : DEFAULT_ROLETA_PREMIOS;
  const vipCombos = Array.isArray(p.vipCombos) && p.vipCombos.length === 4
    ? p.vipCombos.map((c, i) => ({
        id: DEFAULT_VIP_COMBOS[i].id,
        dias: Number.isInteger(c.dias) ? c.dias : DEFAULT_VIP_COMBOS[i].dias,
        valor: typeof c.valor === 'number' ? c.valor : DEFAULT_VIP_COMBOS[i].valor,
        icone: DEFAULT_VIP_COMBOS[i].icone,
        cor: DEFAULT_VIP_COMBOS[i].cor
      }))
    : DEFAULT_VIP_COMBOS;
  return {
    users,
    ocs:         Array.isArray(p.ocs)        ? p.ocs        : [],
    puns:        Array.isArray(p.puns)       ? p.puns       : [],
    pontos:      Array.isArray(p.pontos)     ? p.pontos     : [],
    provas:      Array.isArray(p.provas)     ? p.provas     : [],
    audit:       Array.isArray(p.audit)      ? p.audit      : [],
    feedbacks:   Array.isArray(p.feedbacks)  ? p.feedbacks  : [],
    chats:       Array.isArray(p.chats)      ? p.chats      : [],
    prisoes:     Array.isArray(p.prisoes)    ? p.prisoes    : [],
    recrutamentos: Array.isArray(p.recrutamentos) ? p.recrutamentos : [],
    roletaPremios,
    vipCombos
  };
}

function loadData() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const p = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
      if (p && Array.isArray(p.users) && p.users.length > 0) {
        console.log('[DB] Carregado de /tmp');
        return migrate(sanitize(p));
      }
    }
  } catch (e) { console.warn('[DB] /tmp ilegível:', e.message); }

  try {
    if (fs.existsSync(SEED_FILE)) {
      const p = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      if (p && Array.isArray(p.users)) {
        console.log('[DB] Carregado de seed');
        const data = migrate(sanitize(p));
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
        return data;
      }
    }
  } catch (e) { console.warn('[DB] Seed ilegível:', e.message); }

  console.log('[DB] Usando dados padrão.');
  const def = migrate(getDefaultData());
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(def, null, 2)); } catch (_) {}
  return def;
}

let _saveTimer = null;
function saveData() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(TMP_FILE, JSON.stringify(DB, null, 2)); }
    catch (e) { console.error('[DB] Erro ao salvar:', e.message); }
  }, 150);
}

function saveDataSync() {
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(DB, null, 2)); }
  catch (e) { console.error('[DB] Erro sync:', e.message); }
}

let DB = loadData();
console.log(`[DB] ${DB.users.length} usuários | ${DB.ocs.length} OCs | ${DB.chats.length} chats | ${DB.roletaPremios.length} prêmios | ${DB.prisoes.length} prisões`);
const wsClients = new Set();
function expireVips() {
  const now = Date.now();
  const expired = DB.users.filter(u => u.user !== 'master' && u.vip === true && Number.isFinite(u.vipExpiresAt) && u.vipExpiresAt <= now);
  if (!expired.length) return;
  expired.forEach(u => {
    u.vip = false;
    u.vipExpiresAt = null;
    u.recado = '';
    audit(`<b>${u.nome}</b> perdeu o VIP automaticamente após o fim do prazo`, '⏳');
    broadcast('VIP_CHANGED', { userLogin: u.user, ativo: false, vipExpiresAt: null, expirado: true, feitorNome: 'Sistema' });
  });
  saveData();
  broadcast('USERS_UPDATED', DB.users.map(pub));
}
setInterval(expireVips, 30 * 1000);

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return false; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return true;
}

function wsParseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, offset = 2;
  if (len === 126)      { if (buf.length < 4)  return null; len = buf.readUInt16BE(2);  offset = 4;  }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  if (buf.length < offset + (masked ? 4 : 0) + len) return null;

  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4); offset += 4;
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
  } else {
    payload = buf.slice(offset, offset + len);
  }
  return { opcode, payload, frameLen: offset + len };
}

function wsBuildFrame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  if      (len < 126)        { header = Buffer.alloc(2);  header[0] = 0x80 | opcode; header[1] = len; }
  else if (len < 65536)      { header = Buffer.alloc(4);  header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else                       { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

function wsSend(socket, obj) {
  try { if (socket.writable) socket.write(wsBuildFrame(JSON.stringify(obj))); } catch (_) {}
}

function broadcast(type, payload) {
  const frame = wsBuildFrame(JSON.stringify({ type, payload }));
  wsClients.forEach(s => {
    try { if (s.writable) s.write(frame); } catch (_) { wsClients.delete(s); }
  });
}

function wsSendPong(socket, payload) {
  try { if (socket.writable) socket.write(wsBuildFrame(payload || Buffer.alloc(0), 0x0a)); } catch (_) {}
}

function wsClose(socket) {
  try { if (socket.writable) socket.write(wsBuildFrame(Buffer.alloc(0), 0x08)); } catch (_) {}
  wsClients.delete(socket);
  try { socket.destroy(); } catch (_) {}
}

function pub(u) { const { pass, ...r } = u; return r; }

function audit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 300);
  saveData();
  broadcast('AUDIT_NEW', DB.audit[0]);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml'
};

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/logo.png') {
    const logoPath = path.join(__dirname, 'logo.png');
    fs.readFile(logoPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Logo não encontrado'); return; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000' });
      res.end(data);
    });
    return;
  }

  if (urlPath === '/manifest.json') {
    const filePath = path.join(__dirname, 'public', 'manifest.json');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Manifest não encontrado'); return; }
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' });
      res.end(data);
    });
    return;
  }

  if (urlPath === '/sw.js') {
    const filePath = path.join(__dirname, 'public', 'sw.js');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Service worker não encontrado'); return; }
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/'
      });
      res.end(data);
    });
    return;
  }

  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  const fullPath = path.join(__dirname, 'public', filePath);
  if (!fullPath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) reject(new Error('Payload grande')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); } });
    req.on('error', reject);
  });
}

function jsonRes(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function handleAPI(req, res) {
  expireVips();
  const method = req.method;
  const url    = req.url.split('?')[0];

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    try { body = await readBody(req); } catch (e) { return jsonRes(res, 400, { error: 'Body inválido.' }); }
  }

  if (method === 'GET' && url === '/health') {
    return jsonRes(res, 200, { ok: true, uptime: Math.floor(process.uptime()), clientes: wsClients.size });
  }

  if (method === 'GET' && url === '/api/state') {
    return jsonRes(res, 200, {
      ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos, provas: DB.provas,
      users: DB.users.map(pub), audit: DB.audit,
      feedbacks: DB.feedbacks, chats: DB.chats,
      prisoes: DB.prisoes,
      roletaPremios: DB.roletaPremios,
      vipCombos: DB.vipCombos
    });
  }

  if (method === 'GET' && url === '/api/vip-combos') return jsonRes(res, 200, DB.vipCombos);
  if (method === 'PUT' && url === '/api/vip-combos') {
    const executor = findUserByRef(body.feitorPor);
    if (!executor || !isMaster(executor)) return jsonRes(res, 403, { error: 'Apenas o Master pode alterar os combos VIP.' });
    if (!Array.isArray(body.combos) || body.combos.length !== 4)
      return jsonRes(res, 400, { error: 'Envie exatamente 4 combos VIP.' });
    const combos = body.combos.map((c, i) => ({
      id: DEFAULT_VIP_COMBOS[i].id,
      dias: Number(c.dias),
      valor: Number(c.valor),
      icone: DEFAULT_VIP_COMBOS[i].icone,
      cor: DEFAULT_VIP_COMBOS[i].cor
    }));
    if (combos.some(c => !Number.isInteger(c.dias) || c.dias < 1 || c.dias > 3650 || !Number.isFinite(c.valor) || c.valor < 0 || c.valor > 1000000000))
      return jsonRes(res, 400, { error: 'Dias devem ser inteiros entre 1 e 3650; valores entre 0 e 1.000.000.000.' });
    DB.vipCombos = combos;
    saveData();
    audit(`<b>${executor.nome}</b> atualizou os 4 combos VIP para todos os usuários`, '👑');
    broadcast('VIP_COMBOS_UPDATED', DB.vipCombos);
    return jsonRes(res, 200, { ok: true, combos: DB.vipCombos });
  }

  if (method === 'POST' && url === '/api/login') {
    const { user, pass } = body;
    if (!user || !pass) return jsonRes(res, 400, { error: 'Preencha usuário e senha.' });
    const u = DB.users.find(u => u.user === String(user).trim().toLowerCase() && u.pass === String(pass) && u.ativo);
    if (!u) return jsonRes(res, 401, { error: 'Credenciais inválidas ou conta desativada.' });
    if (u.banExpires && u.banExpires > Date.now()) {
      return jsonRes(res, 403, { banned: true, expiresAt: u.banExpires, reason: u.banReason || 'Suspensão temporária.', banBy: u.banBy || 'Sistema' });
    }
    return jsonRes(res, 200, { ok: true, user: pub(u) });
  }

  if (method === 'GET' && url === '/api/users') return jsonRes(res, 200, DB.users.map(pub));

  if (method === 'POST' && url === '/api/users') {
    const { nome, user, cargo, pass, criadoPor } = body;
    if (!nome || !user || !cargo || !pass) return jsonRes(res, 400, { error: 'Todos os campos são obrigatórios.' });
    const login = String(user).trim().toLowerCase().replace(/\s/g, '');
    if (DB.users.find(u => u.user === login)) return jsonRes(res, 400, { error: 'Login já existe.' });
    if (pass.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const criador = findUserByRef(criadoPor);
    if (!criador) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    const master = isMaster(criador);
    if (!master && (CARGO_PERM_SRV[criador.cargo] || 0) < 6)
      return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem criar usuários.' });
    if (!master && (CARGO_PERM_SRV[cargo] || 0) >= (CARGO_PERM_SRV[criador.cargo] || 0))
      return jsonRes(res, 403, { error: 'Não pode criar usuários com cargo igual ou superior ao seu.' });
    DB.users.push({
      user: login, pass, cargo, nome, ativo: true,
      criadoPor: criador.user, criadoEm: Date.now(),
      cicloDias: [], folgaDia: null, girosBonus: 0, ultimoGiroRoleta: null,
      horasExtrasAjustadas: 0, horasDevidasAjustadas: 0,
      vip: false, vipExpiresAt: null, recado: '', foto: '',
      medalhas: [], score: 50, sequenciaAtiva: 0, recordeHoras: 0
    });
    saveData();
    audit(`<b>${criador.nome}</b> criou o usuário <b>${nome}</b> (${CARGO_LABEL_SRV[cargo] || cargo})`, '👤');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // ═══ MASTER: AJUSTAR HORAS ═══
  const mHoras = url.match(/^\/api\/users\/([^/]+)\/horas$/);
  if (method === 'PUT' && mHoras) {
    const target = DB.users.find(u => u.user === mHoras[1]);
    if (!target) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { extrasMins, devidasMins, acao, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (!isMaster(executor)) return jsonRes(res, 403, { error: 'Apenas Master pode ajustar horas.' });

    if (typeof target.horasExtrasAjustadas  !== 'number') target.horasExtrasAjustadas = 0;
    if (typeof target.horasDevidasAjustadas !== 'number') target.horasDevidasAjustadas = 0;

    const calc = calcHorasServidor(target.user);

    let logMsg = '';
    if (acao === 'zerar') {
      target.horasExtrasAjustadas  = -calc.extra;
      target.horasDevidasAjustadas = -calc.debt;
      logMsg = `<b>${executor.nome}</b> ZEROU o saldo de horas de <b>${target.nome}</b> (extras e devidas)`;
    } else if (acao === 'zerar_extras') {
      target.horasExtrasAjustadas = -calc.extra;
      logMsg = `<b>${executor.nome}</b> zerou as HORAS EXTRAS de <b>${target.nome}</b>`;
    } else if (acao === 'zerar_devidas') {
      target.horasDevidasAjustadas = -calc.debt;
      logMsg = `<b>${executor.nome}</b> zerou as HORAS DEVIDAS de <b>${target.nome}</b>`;
    } else if (acao === 'ajustar') {
      const extras = parseInt(extrasMins) || 0;
      const devidas = parseInt(devidasMins) || 0;
      target.horasExtrasAjustadas  = Math.max(-100000, Math.min(100000, target.horasExtrasAjustadas + extras));
      target.horasDevidasAjustadas = Math.max(-100000, Math.min(100000, target.horasDevidasAjustadas + devidas));
      logMsg = `<b>${executor.nome}</b> ajustou horas de <b>${target.nome}</b>: extras ${extras >= 0 ? '+' : ''}${extras}min, devidas ${devidas >= 0 ? '+' : ''}${devidas}min`;
    } else if (acao === 'set') {
      const extras  = Math.max(0, parseInt(extrasMins)  || 0);
      const devidas = Math.max(0, parseInt(devidasMins) || 0);
      target.horasExtrasAjustadas  = extras  - calc.extra;
      target.horasDevidasAjustadas = devidas - calc.debt;
      logMsg = `<b>${executor.nome}</b> definiu horas de <b>${target.nome}</b>: extras ${extras}min, devidas ${devidas}min`;
    } else {
      return jsonRes(res, 400, { error: 'Ação inválida.' });
    }

    saveData();
    audit(logMsg, '⏱️');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, {
      ok: true,
      horasExtrasAjustadas: target.horasExtrasAjustadas,
      horasDevidasAjustadas: target.horasDevidasAjustadas
    });
  }

  // ═══ MASTER: TOGGLE VIP + 🌟 VIP INFO (GET) ═══
  const mVip = url.match(/^\/api\/users\/([^/]+)\/vip$/);
  if (method === 'PUT' && mVip) {
    const target = DB.users.find(u => u.user === mVip[1]);
    if (!target) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { ativo, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (!isMaster(executor)) return jsonRes(res, 403, { error: 'Apenas Master pode dar/remover VIP.' });

    let vipExpiresAt = null;
    if (Boolean(ativo) && target.user !== 'master') {
      const dias = Number(body.dias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 3650)
        return jsonRes(res, 400, { error: 'Informe uma duração válida entre 1 e 3650 dias.' });
      vipExpiresAt = Date.now() + dias * 24 * 60 * 60 * 1000;
    }
    target.vip = Boolean(ativo);
    target.vipExpiresAt = target.user === 'master' ? null : vipExpiresAt;
    if (!ativo) target.recado = '';

    saveData();
    audit(
      `<b>${executor.nome}</b> ${ativo ? '🌟 deu VIP para' : '❌ removeu VIP de'} <b>${target.nome}</b>`,
      ativo ? '🌟' : '💔'
    );
    broadcast('USERS_UPDATED', DB.users.map(pub));
    broadcast('VIP_CHANGED', {
      userLogin: target.user,
      ativo: target.vip,
      vipExpiresAt: target.vipExpiresAt,
      feitorNome: executor.nome
    });
    return jsonRes(res, 200, { ok: true, vip: target.vip, vipExpiresAt: target.vipExpiresAt });
  }

  // ═══ 🌟 VIP INFO: score 0-100 + banco de horas detalhado + sequência + medalhas ═══
  if (method === 'GET' && mVip) {
    const u = DB.users.find(x => x.user === mVip[1]);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (!Array.isArray(u.medalhas)) u.medalhas = [];

    const horas = calcHorasServidor(u.user);

    // Horas semanais (últimos 7 dias)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const horasSemana = DB.pontos
      .filter(p => p.userLogin === u.user && p.type === 'saida' && p.ts >= sevenDaysAgo)
      .reduce((s, p) => s + (p.trabalhado || 0), 0);

    // Score do perfil (0 a 100)
    let score = 50;
    score += (u.sequenciaAtiva || 0) * 2;                          // sequência de dias
    score += Math.min(20, (u.medalhas || []).length * 5);          // medalhas
    score += Math.min(20, Math.floor(horasSemana / 60));           // horas na semana
    score -= Math.min(20, Math.floor(horas.debt / 60) * 5);        // horas devidas
    score = Math.max(0, Math.min(100, score));
    u.score = score;
    saveData();

    return jsonRes(res, 200, {
      user: pub(u),
      vip: u.vip === true,
      score: score,
      sequencia: u.sequenciaAtiva || 0,
      medalhas: u.medalhas,
      xp: calcXP(u),
      horas: {
        normais:  Math.max(0, horas.trab - horas.extra),
        extras:   Math.max(0, horas.extra + (u.horasExtrasAjustadas || 0)),
        operacao: horas.trab,
        semanais: horasSemana,
        recorde:  u.recordeHoras || 0,
        pausas:   horas.pausa,
        devidas:  Math.max(0, horas.debt + (u.horasDevidasAjustadas || 0)),
        turnos:   horas.turnos
      }
    });
  }

  // ═══ 🏅 MEDALHAS: só o MASTER dá/remove (máx 5 por patente) ═══
  const mMedalha = url.match(/^\/api\/users\/([^/]+)\/medalhas$/);
  if (mMedalha) {
    const target = DB.users.find(u => u.user === mMedalha[1]);
    if (!target) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (!Array.isArray(target.medalhas)) target.medalhas = [];

    if (method === 'POST') {
      const { medalha, motivo, feitorPor } = body;
      const executor = findUserByRef(feitorPor);
      if (!executor || !isMaster(executor))
        return jsonRes(res, 403, { error: '🔒 Somente o Admin Master pode dar medalhas.' });
      if (!MEDALHAS_VALIDAS[medalha])
        return jsonRes(res, 400, { error: 'Medalha inválida. Use: bronze, prata, ouro ou diamante.' });
      if (target.medalhas.length >= MEDALHAS_MAX_POR_PATENTE)
        return jsonRes(res, 400, { error: `Limite de ${MEDALHAS_MAX_POR_PATENTE} medalhas por patente atingido.` });

      const med = {
        tipo: medalha,
        icone: MEDALHAS_VALIDAS[medalha],
        motivo: String(motivo || 'Por trabalho').slice(0, 100),
        dadoPor: executor.nome,
        ts: Date.now()
      };
      target.medalhas.push(med);
      saveData();
      audit(`<b>${executor.nome}</b> deu a medalha ${med.icone} <b>${medalha.toUpperCase()}</b> para <b>${target.nome}</b> — ${med.motivo}`, '🏅');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('NEW_MEDALHA', { userLogin: target.user, medalha: med });
      return jsonRes(res, 200, { ok: true, medalhas: target.medalhas });
    }

    if (method === 'DELETE') {
      const executor = findUserByRef(body.feitorPor);
      if (!executor || !isMaster(executor))
        return jsonRes(res, 403, { error: '🔒 Somente o Admin Master pode remover medalhas.' });
      const idx = parseInt(body.idx);
      if (isNaN(idx) || idx < 0 || idx >= target.medalhas.length)
        return jsonRes(res, 404, { error: 'Medalha não encontrada.' });
      const rem = target.medalhas.splice(idx, 1)[0];
      saveData();
      audit(`<b>${executor.nome}</b> removeu a medalha ${rem.icone} de <b>${target.nome}</b>`, '🏅');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      return jsonRes(res, 200, { ok: true, medalhas: target.medalhas });
    }
  }

  // ═══ USUÁRIO: ATUALIZAR RECADO (só VIP) ═══
  const mRecado = url.match(/^\/api\/users\/me\/recado$/);
  if (method === 'PUT' && mRecado) {
    const { texto } = body;
    const executor = findUserByRef(body.feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (!executor.vip) return jsonRes(res, 403, { error: 'Apenas usuários VIP podem adicionar recado.' });

    executor.recado = String(texto || '').trim().slice(0, 200);
    saveData();
    audit(`<b>${executor.nome}</b> atualizou seu recado`, '💬');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true, recado: executor.recado });
  }

  // ═══ USUÁRIO: SALVAR FOTO DE PERFIL (URL do imgbb) ═══
  const mFoto = url.match(/^\/api\/users\/me\/foto$/);
  if (method === 'PUT' && mFoto) {
    const { url: fotoUrl, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (typeof fotoUrl !== 'string' || fotoUrl.length > 500) return jsonRes(res, 400, { error: 'URL inválida.' });
    if (fotoUrl && !/^https?:\/\//.test(fotoUrl)) return jsonRes(res, 400, { error: 'URL deve começar com http(s)://' });
    executor.foto = fotoUrl;
    saveData();
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true, foto: fotoUrl });
  }

  const mBanCheck = url.match(/^\/api\/users\/([^/]+)\/bancheck$/);
  if (method === 'GET' && mBanCheck) {
    const u = DB.users.find(u => u.user === mBanCheck[1]);
    if (!u) return jsonRes(res, 200, { banned: false });
    if (u.banExpires && u.banExpires > Date.now())
      return jsonRes(res, 200, { banned: true, expiresAt: u.banExpires, reason: u.banReason, banBy: u.banBy });
    return jsonRes(res, 200, { banned: false });
  }

  const mSenha = url.match(/^\/api\/users\/([^/]+)\/senha$/);
  if (method === 'PUT' && mSenha) {
    const i = DB.users.findIndex(u => u.user === mSenha[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { novaSenha, feitorPor } = body;
    if (!novaSenha || novaSenha.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const executor = findUserByRef(feitorPor);
    const master = isMaster(executor);
    const self = executor && executor.user === DB.users[i].user;
    if (!master && !self) {
      if (!executor || (CARGO_PERM_SRV[executor.cargo] || 0) <= (CARGO_PERM_SRV[DB.users[i].cargo] || 0))
        return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    }
    DB.users[i].pass = novaSenha;
    saveData();
    audit(`<b>${executor ? executor.nome : feitorPor}</b> redefiniu a senha de <b>${DB.users[i].nome}</b>`, '🔑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mStatus = url.match(/^\/api\/users\/([^/]+)\/status$/);
  if (method === 'PUT' && mStatus) {
    const i = DB.users.findIndex(u => u.user === mStatus[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { ativo, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (executor.user === mStatus[1]) return jsonRes(res, 403, { error: 'Você não pode ativar/desativar a si mesmo.' });
    const master = isMaster(executor);
    if (!master && (CARGO_PERM_SRV[executor.cargo] || 0) <= (CARGO_PERM_SRV[DB.users[i].cargo] || 0))
      return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    DB.users[i].ativo = Boolean(ativo);
    saveData();
    audit(`<b>${executor.nome}</b> ${ativo ? 'ativou' : 'desativou'} <b>${DB.users[i].nome}</b>`, ativo ? '✅' : '🚫');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mCargo = url.match(/^\/api\/users\/([^/]+)\/cargo$/);
  if (method === 'PUT' && mCargo) {
    const i = DB.users.findIndex(u => u.user === mCargo[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { cargo, feitorPor, motivo } = body;
    const targetUser = DB.users[i];
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    const master = isMaster(executor);
    if (targetUser.user === executor.user) return jsonRes(res, 403, { error: 'Você não pode alterar o próprio cargo.' });
    if (!master && (CARGO_PERM_SRV[executor.cargo] || 0) < 6)
      return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem alterar cargos.' });
    if (!master && (CARGO_PERM_SRV[cargo] || 0) >= (CARGO_PERM_SRV[executor.cargo] || 0))
      return jsonRes(res, 403, { error: 'Não pode atribuir cargo igual ou superior ao seu.' });
    if (!master && targetUser.cargo === 'admin')
      return jsonRes(res, 403, { error: 'O Admin Master não pode ser rebaixado.' });
    const oldPerm = CARGO_PERM_SRV[targetUser.cargo] || 0, newPerm = CARGO_PERM_SRV[cargo] || 0;
    const isRebaixamento = newPerm < oldPerm;
    if (isRebaixamento && !motivo) return jsonRes(res, 400, { error: 'Motivo obrigatório para rebaixamento.' });
    const oldCargo = targetUser.cargo;
    DB.users[i].cargo = cargo;
    saveData();
    const logMsg = isRebaixamento
      ? `<b>${executor.nome}</b> rebaixou <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo] || oldCargo} para ${CARGO_LABEL_SRV[cargo] || cargo} — motivo: ${motivo}`
      : `<b>${executor.nome}</b> promoveu <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo] || oldCargo} para ${CARGO_LABEL_SRV[cargo] || cargo}`;
    audit(logMsg, isRebaixamento ? '📉' : '📈');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    broadcast('CARGO_CHANGED', {
      userLogin: DB.users[i].user, oldCargo, newCargo: cargo,
      tipo: isRebaixamento ? 'rebaixado' : 'promovido',
      motivo: motivo || null, feitorPorNome: executor.nome
    });
    return jsonRes(res, 200, { ok: true });
  }

  const mGiros = url.match(/^\/api\/users\/([^/]+)\/giros$/);
  if (method === 'POST' && mGiros) {
    const target = DB.users.find(u => u.user === mGiros[1]);
    if (!target) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { quantidade, feitorPor } = body;
    const q = parseInt(quantidade);
    if (isNaN(q) || q < 1) return jsonRes(res, 400, { error: 'Quantidade inválida.' });
    if (q > 100) return jsonRes(res, 400, { error: 'Máximo 100 giros por vez.' });
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (!isMaster(executor)) return jsonRes(res, 403, { error: 'Apenas Master pode liberar giros.' });
    if (typeof target.girosBonus !== 'number') target.girosBonus = 0;
    target.girosBonus += q;
    saveData();
    audit(`<b>${executor.nome}</b> liberou <b>${q} giro(s) bônus</b> para <b>${target.nome}</b>`, '🎁');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    broadcast('GIROS_GAINED', {
      userLogin: target.user, giros: q, total: target.girosBonus,
      motivo: `${q} giro(s) liberado(s) pelo Master`
    });
    return jsonRes(res, 200, { ok: true, girosBonus: target.girosBonus });
  }

  const mBan = url.match(/^\/api\/users\/([^/]+)\/ban$/);
  if (mBan) {
    if (method === 'POST') {
      const i = DB.users.findIndex(u => u.user === mBan[1]);
      if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
      const { duracao, motivo, feitorPor } = body;
      const mins = parseInt(duracao) || 0;
      if (mins <= 0) return jsonRes(res, 400, { error: 'Duração inválida.' });
      if (!motivo)   return jsonRes(res, 400, { error: 'Motivo obrigatório.' });
      const executor = findUserByRef(feitorPor);
      if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
      if (DB.users[i].user === executor.user) return jsonRes(res, 403, { error: 'Você não pode suspender a si mesmo.' });
      const master = isMaster(executor);
      const execPerm = CARGO_PERM_SRV[executor.cargo] || 0;
      const tgtPerm  = CARGO_PERM_SRV[DB.users[i].cargo] || 0;
      if (!master && (execPerm <= tgtPerm || execPerm < 3))
        return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
      const expiresAt = Date.now() + mins * 60 * 1000;
      DB.users[i].banExpires = expiresAt; DB.users[i].banReason = motivo; DB.users[i].banBy = executor.nome;
      saveData();
      audit(`<b>${executor.nome}</b> suspendeu <b>${DB.users[i].nome}</b> por ${mins} min(s) — motivo: ${motivo}`, '⛔');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('USER_BANNED', { userLogin: DB.users[i].user, expiresAt, reason: motivo, banBy: executor.nome, duracao: mins });
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.users.findIndex(u => u.user === mBan[1]);
      if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
      const { feitorPor } = body;
      const executor = findUserByRef(feitorPor);
      const nome = DB.users[i].nome;
      DB.users[i].banExpires = null; DB.users[i].banReason = null; DB.users[i].banBy = null;
      saveData();
      audit(`<b>${executor ? executor.nome : feitorPor}</b> removeu a suspensão de <b>${nome}</b>`, '✅');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('USER_UNBANNED', { userLogin: DB.users[i].user });
      return jsonRes(res, 200, { ok: true });
    }
  }

  const mDelUser = url.match(/^\/api\/users\/([^/]+)$/);
  if (method === 'DELETE' && mDelUser) {
    const i = DB.users.findIndex(u => u.user === mDelUser[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (mDelUser[1] === executor.user) return jsonRes(res, 403, { error: 'Você não pode excluir a si mesmo.' });
    const master = isMaster(executor);
    if (!master && (CARGO_PERM_SRV[executor.cargo] || 0) <= (CARGO_PERM_SRV[DB.users[i].cargo] || 0))
      return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    const nome = DB.users[i].nome;
    DB.users.splice(i, 1);
    saveData();
    audit(`<b>${executor.nome}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET' && url === '/api/ocs') return jsonRes(res, 200, DB.ocs);
  if (method === 'POST' && url === '/api/ocs') {
    const oc = body;
    if (!oc || !oc.id) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    if (!DB.ocs.find(o => o.id === oc.id)) {
      DB.ocs.push(oc); saveData();
      audit(`<b>${oc.delegado}</b> registrou ${oc.tipo || 'ocorrência'} sobre <b>${oc.nome}</b>`, '📝');
      broadcast('NEW_OC', oc);
    }
    return jsonRes(res, 200, { ok: true });
  }
  const mOc = url.match(/^\/api\/ocs\/([^/]+)$/);
  if (mOc) {
    const id = mOc[1];
    if (method === 'PUT') {
      const i = DB.ocs.findIndex(o => o.id === id);
      if (i === -1) return jsonRes(res, 404, { error: 'Ocorrência não encontrada.' });
      Object.assign(DB.ocs[i], body); saveData();
      broadcast('OC_UPDATED', DB.ocs[i]);
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.ocs.findIndex(o => o.id === id);
      if (i === -1) return jsonRes(res, 404, { error: 'Ocorrência não encontrada.' });
      DB.ocs.splice(i, 1); saveData();
      broadcast('OC_DELETED', { id });
      return jsonRes(res, 200, { ok: true });
    }
  }

  if (method === 'GET' && url === '/api/puns') return jsonRes(res, 200, DB.puns);
  if (method === 'POST' && url === '/api/puns') {
    const pun = body;
    if (!pun || !pun.nome) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    pun.id = `PUN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    pun.ts = pun.ts || Date.now();
    DB.puns.push(pun); saveData();
    audit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b> — ${pun.motivo}`, '⚠️');
    broadcast('NEW_PUN', pun);
    return jsonRes(res, 200, { ok: true, pun });
  }
  const mPunId = url.match(/^\/api\/puns\/id\/([^/]+)$/);
  if (method === 'DELETE' && mPunId) {
    const i = DB.puns.findIndex(p => p.id === mPunId[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Punição não encontrada.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1); saveData();
    audit(`<b>${body.feitorPor}</b> removeu a punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }
  const mPunIdx = url.match(/^\/api\/puns\/(\d+)$/);
  if (method === 'DELETE' && mPunIdx) {
    const i = parseInt(mPunIdx[1]);
    if (isNaN(i) || i < 0 || i >= DB.puns.length) return jsonRes(res, 404, { error: 'Índice inválido.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1); saveData();
    audit(`<b>${body.feitorPor}</b> removeu a punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET' && url === '/api/pontos') return jsonRes(res, 200, DB.pontos);
  if (method === 'POST' && url === '/api/pontos') {
    const ponto = body;
    if (!ponto || !ponto.userLogin || !ponto.type) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    const u = DB.users.find(x => x.user === ponto.userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (!Array.isArray(u.cicloDias)) u.cicloDias = [];
    if (!u.folgaDia) u.folgaDia = null;
    if (typeof u.girosBonus !== 'number') u.girosBonus = 0;
    if (typeof u.horasExtrasAjustadas !== 'number') u.horasExtrasAjustadas = 0;
    if (typeof u.horasDevidasAjustadas !== 'number') u.horasDevidasAjustadas = 0;
    if (!Array.isArray(u.medalhas)) u.medalhas = [];
    if (typeof u.sequenciaAtiva !== 'number') u.sequenciaAtiva = 0;
    if (typeof u.recordeHoras !== 'number') u.recordeHoras = 0;
    ponto.ts = ponto.ts || Date.now();
    const dBr = brDateStr(ponto.ts);
    if ((ponto.type === 'entrada' || ponto.type === 'pausa_retomar') && u.folgaDia === dBr) {
      return jsonRes(res, 403, { error: '🌴 Hoje (' + dBr + ') é seu dia de FOLGA! Descanse.' });
    }
    const last = [...DB.pontos].reverse().find(p => p.userLogin === ponto.userLogin);
    if (last && last.type === ponto.type && (ponto.ts - last.ts) < 3000) {
      return jsonRes(res, 200, { ok: true, ponto: last, dup: true });
    }
    const podePausarOuEncerrar = last && (last.type === 'entrada' || last.type === 'pausa_retomar' || last.type === 'pausa_fim');
    if (ponto.type === 'pausa_inicio' && !podePausarOuEncerrar)
      return jsonRes(res, 403, { error: 'Você só pode pausar se estiver em turno ativo.' });
    if (ponto.type === 'pausa_fim' && (!last || last.type !== 'pausa_inicio'))
      return jsonRes(res, 403, { error: 'Você só pode retomar se estiver em pausa.' });
    if (ponto.type === 'saida' && !podePausarOuEncerrar)
      return jsonRes(res, 403, { error: 'Você só pode encerrar se estiver em turno ativo (não em pausa).' });
    ponto.id   = 'PON-' + ponto.ts + '-' + Math.random().toString(36).slice(2, 7);
    ponto.hora = brTimeStrSec(ponto.ts);
    ponto.data = dBr;
    DB.pontos.push(ponto);

    let girosGanhos = 0;

    if (ponto.type === 'saida') {
      const entradas = DB.pontos.filter(p => p.userLogin === ponto.userLogin && p.type === 'entrada').sort((a, b) => b.ts - a.ts);
      if (entradas.length > 0) {
        const entrada = entradas[0];
        const pausasInicio = DB.pontos.filter(p => p.userLogin === ponto.userLogin && p.type === 'pausa_inicio' && p.ts > entrada.ts && p.ts < ponto.ts);
        const pausasFim    = DB.pontos.filter(p => p.userLogin === ponto.userLogin && p.type === 'pausa_fim'    && p.ts > entrada.ts && p.ts < ponto.ts);
        pausasInicio.sort((a, b) => a.ts - b.ts);
        pausasFim.sort((a, b) => a.ts - b.ts);
        let totalPausaMs = 0;
        const numPausasCompletas = Math.min(pausasInicio.length, pausasFim.length);
        for (let i = 0; i < numPausasCompletas; i++) {
          totalPausaMs += (pausasFim[i].ts - pausasInicio[i].ts);
        }
        const diffMins  = Math.round((ponto.ts - entrada.ts - totalPausaMs) / 60000);
        const baseMins  = CARGO_BASE_MINUTES[ponto.cargo] || 0;
        const extraMins = Math.max(0, diffMins - baseMins);
        const debtMins  = Math.max(0, baseMins - diffMins);
        ponto.trabalhado   = diffMins;
        ponto.extraMins    = extraMins;
        ponto.debtMins     = debtMins;
        ponto.pausaMins    = Math.round(totalPausaMs / 60000);
        ponto.extraMinsTotal = extraMins + (u.horasExtrasAjustadas || 0);
        ponto.debtMinsTotal  = debtMins  + (u.horasDevidasAjustadas || 0);
        ponto.extraReais     = Math.floor(ponto.extraMinsTotal / 30) * 20;

        girosGanhos = Math.floor(ponto.extraMinsTotal / 60);
        if (girosGanhos > 0) {
          u.girosBonus = (u.girosBonus || 0) + girosGanhos;
        }
      }
      if (!u.cicloDias.includes(dBr)) u.cicloDias.push(dBr);
      if (u.cicloDias.length >= 6) {
        const fd = nextBrDateStr(dBr);
        u.folgaDia = fd; u.cicloDias = [];
        const folgaRec = {
          id: 'FOL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          userLogin: u.user, nome: u.nome, cargo: u.cargo,
          type: 'folga', hora: 'FOLGA', data: fd, ts: ponto.ts + 86400000
        };
        DB.pontos.push(folgaRec);
        audit(`<b>${u.nome}</b> completou 6 dias — 🌴 FOLGA concedida para ${fd}`, '🌴');
        broadcast('NEW_PONTO', folgaRec);
        broadcast('FOLGA_GRANTED', { userLogin: u.user, folgaDia: fd });
      }
      ponto.ciclo = u.cicloDias.length; ponto.folgaDia = u.folgaDia;

      // ═══ 🌟 VIP: SEQUÊNCIA DE DIAS/TURNOS ATIVOS + RECORDE PESSOAL ═══
      const prevSaida = DB.pontos
        .filter(p => p.userLogin === u.user && p.type === 'saida' && p.ts < ponto.ts)
        .sort((a, b) => b.ts - a.ts)[0];
      if (!prevSaida) {
        u.sequenciaAtiva = 1;
      } else {
        const lastDay = brDateStr(prevSaida.ts);
        if (lastDay === dBr) {
          // mesmo dia: sequência não muda
        } else if (nextBrDateStr(lastDay) === dBr) {
          u.sequenciaAtiva = (u.sequenciaAtiva || 0) + 1;   // dia seguido! 🔥
        } else {
          u.sequenciaAtiva = 1;                             // quebrou a sequência
        }
      }
      if ((ponto.trabalhado || 0) > (u.recordeHoras || 0)) {
        u.recordeHoras = ponto.trabalhado;                  // novo recorde pessoal! 🏆
      }
    }
    saveData();
    const hora = brTimeStr(ponto.ts);
    let auditMsg = `<b>${ponto.nome}</b> `;
    if (ponto.type === 'entrada')         auditMsg += `bateu ponto às ${hora}`;
    else if (ponto.type === 'pausa_inicio') auditMsg += `⏸️ iniciou pausa às ${hora}`;
    else if (ponto.type === 'pausa_fim')    auditMsg += `▶️ retomou o turno às ${hora}`;
    else if (ponto.type === 'saida')        auditMsg += `encerrou o turno às ${hora}`;
    if (ponto.type === 'saida' && ponto.trabalhado !== undefined) {
      const h = Math.floor(ponto.trabalhado / 60), m = ponto.trabalhado % 60;
      auditMsg += ` — ${h}h${m > 0 ? m + 'min' : ''} trabalhadas.`;
      if (ponto.pausaMins > 0) auditMsg += ` <b style="color:var(--warn);">(⏸️ ${ponto.pausaMins}min de pausa)</b>`;
      if (u.horasExtrasAjustadas > 0)  auditMsg += ` <b style="color:#a78bfa;">(+${u.horasExtrasAjustadas}min ajuste Master)</b>`;
      if (u.horasDevidasAjustadas > 0) auditMsg += ` <b style="color:#f87171;">(+${u.horasDevidasAjustadas}min devidas Master)</b>`;
      if (ponto.extraReais > 0) auditMsg += ` <b style="color:#4ade80;">(Extras R$ ${ponto.extraReais})</b>`;
      if (girosGanhos > 0)      auditMsg += ` <b style="color:#a78bfa;">(+${girosGanhos} 🎰 giro${girosGanhos>1?'s':''})</b>`;
      if (ponto.debtMinsTotal > 0) auditMsg += ` <b style="color:#f87171;">(Deve ${Math.floor(ponto.debtMinsTotal / 60)}h${(ponto.debtMinsTotal % 60).toString().padStart(2, '0')})</b>`;
      auditMsg += ` <b style="color:#fbbf24;">(🔥 sequência: ${u.sequenciaAtiva} dia(s))</b>`;
    }
    audit(auditMsg, '⏱️');
    broadcast('NEW_PONTO', ponto);
    broadcast('USERS_UPDATED', DB.users.map(pub));
    if (girosGanhos > 0) {
      broadcast('GIROS_GAINED', {
        userLogin: u.user, giros: girosGanhos, total: u.girosBonus,
        motivo: `+${girosGanhos} giro(s) por horas extras`
      });
    }
    return jsonRes(res, 200, { ok: true, ponto, girosGanhos });
  }

  if (method === 'POST' && url === '/api/roleta/girar') {
    const { userLogin } = body;
    const u = DB.users.find(x => x.user === userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (typeof u.girosBonus !== 'number') u.girosBonus = 0;
    if (isMaster(u)) {
      u.ultimoGiroRoleta = Date.now();
      saveData();
      return jsonRes(res, 200, { ok: true, master: true, girosBonus: u.girosBonus, ultimoGiro: u.ultimoGiroRoleta });
    }
    const ultimoGiro = u.ultimoGiroRoleta;
    const agora = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const cooldownOk = !ultimoGiro || (agora - ultimoGiro) >= cooldown;
    if (!cooldownOk && u.girosBonus <= 0) {
      return jsonRes(res, 403, { error: 'Cooldown ativo e sem giros bônus.' });
    }
    if (!cooldownOk && u.girosBonus > 0) {
      u.girosBonus -= 1;
    } else {
      u.ultimoGiroRoleta = agora;
    }
    saveData();
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true, master: false, girosBonus: u.girosBonus, ultimoGiro: u.ultimoGiroRoleta });
  }

  if (method === 'GET' && url === '/api/roleta/premios') {
    return jsonRes(res, 200, DB.roletaPremios);
  }
  if (method === 'PUT' && url === '/api/roleta/premios') {
    const { premios, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (!isMaster(executor)) return jsonRes(res, 403, { error: 'Apenas Master pode editar prêmios da roleta.' });
    if (!Array.isArray(premios) || premios.length === 0)
      return jsonRes(res, 400, { error: 'Lista de prêmios vazia.' });
    if (premios.length > 20)
      return jsonRes(res, 400, { error: 'Máximo de 20 prêmios.' });
    const validRaridades = ['common', 'uncommon', 'rare', 'epic', 'epic2', 'legendary'];
    const novos = premios.map((p, i) => ({
      id: p.id || 'p-' + Date.now() + '-' + i,
      valor:    typeof p.valor === 'number' && p.valor >= 0 ? Math.floor(p.valor) : 100,
      peso:     typeof p.peso === 'number' && p.peso >= 0 ? p.peso : 1,
      cor:      typeof p.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.cor) ? p.cor : '#10b981',
      cor2:     typeof p.cor2 === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.cor2) ? p.cor2 : p.cor,
      corBorda: typeof p.corBorda === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.corBorda) ? p.corBorda : p.cor,
      nome:     typeof p.nome === 'string' && p.nome.trim() ? p.nome.trim().slice(0, 30) : 'Prêmio',
      icone:    typeof p.icone === 'string' && p.icone.trim() ? p.icone.trim().slice(0, 4) : '🎁',
      raridade: validRaridades.includes(p.raridade) ? p.raridade : 'common'
    }));
    DB.roletaPremios = novos;
    saveData();
    audit(`<b>${executor.nome}</b> atualizou <b>${novos.length} prêmios da roleta</b>`, '🎰');
    broadcast('ROLETA_PREMIOS_UPDATED', DB.roletaPremios);
    return jsonRes(res, 200, { ok: true, premios: DB.roletaPremios });
  }

  if (method === 'GET' && url === '/api/recrutamento/questoes') {
    return jsonRes(res, 200, RECRUTAMENTO_QUESTOES.map(({ correta, ...q }) => q));
  }
  if (method === 'GET' && url === '/api/recrutamento') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const executor = findUserByRef(params.get('user'));
    if (!executor) return jsonRes(res, 403, { error: 'Usuário não encontrado.' });
    const podeAnalisar = isMaster(executor) || (CARGO_PERM_SRV[executor.cargo] || 0) >= 5;
    if (podeAnalisar) {
      return jsonRes(res, 200, { recrutamentos: DB.recrutamentos, questoes: RECRUTAMENTO_QUESTOES });
    }
    return jsonRes(res, 200, { recrutamentos: DB.recrutamentos.filter(r => r.userLogin === executor.user).map(r => ({ ...r, respostas: r.respostas })) });
  }
  if (method === 'POST' && url === '/api/recrutamento') {
    const { userLogin, respostas } = body;
    const u = DB.users.find(x => x.user === userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (!Array.isArray(respostas) || respostas.length !== RECRUTAMENTO_QUESTOES.length)
      return jsonRes(res, 400, { error: 'Responda todas as questões do recrutamento.' });
    if (DB.recrutamentos.some(r => r.userLogin === u.user && r.status === 'pendente'))
      return jsonRes(res, 409, { error: 'Você já possui um recrutamento aguardando análise.' });
    const mapa = new Map(respostas.map(r => [Number(r.questaoId), r]));
    const respostasNormalizadas = RECRUTAMENTO_QUESTOES.map(q => {
      const r = mapa.get(q.id) || {};
      if (q.tipo === 'texto') return { questaoId: q.id, texto: String(r.texto || '').trim().slice(0, 2000) };
      return { questaoId: q.id, escolha: Number.isInteger(Number(r.escolha)) ? Number(r.escolha) : -1 };
    });
    if (respostasNormalizadas.some((r, i) => RECRUTAMENTO_QUESTOES[i].tipo === 'texto' ? r.texto.length < 3 : r.escolha < 0 || r.escolha >= RECRUTAMENTO_QUESTOES[i].opcoes.length))
      return jsonRes(res, 400, { error: 'Preencha todas as respostas corretamente.' });
    const objetivas = RECRUTAMENTO_QUESTOES.filter(q => q.tipo === 'escolha');
    const acertos = objetivas.filter(q => respostasNormalizadas.find(r => r.questaoId === q.id)?.escolha === q.correta).length;
    const recrutamento = { id: 'REC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), userLogin: u.user, nome: u.nome, cargoAtual: u.cargo, respostas: respostasNormalizadas, acertos, totalObjetivas: objetivas.length, status: 'pendente', motivoDecisao: '', enviadoEm: Date.now(), decididoPor: null, decididoEm: null };
    DB.recrutamentos.push(recrutamento); saveData();
    audit(`<b>${u.nome}</b> enviou um recrutamento para análise`, '📋');
    broadcast('NEW_RECRUTAMENTO', { id: recrutamento.id, userLogin: u.user, nome: u.nome });
    return jsonRes(res, 201, { ok: true, recrutamento: { ...recrutamento, respostas: undefined } });
  }
  const mRecrutamento = url.match(/^\/api\/recrutamento\/([^/]+)\/decisao$/);
  if (method === 'PUT' && mRecrutamento) {
    const recrutamento = DB.recrutamentos.find(r => r.id === mRecrutamento[1]);
    if (!recrutamento) return jsonRes(res, 404, { error: 'Recrutamento não encontrado.' });
    const executor = findUserByRef(body.feitorPor);
    if (!executor || (!isMaster(executor) && (CARGO_PERM_SRV[executor.cargo] || 0) < 5)) return jsonRes(res, 403, { error: 'Somente Delegado, Chefe de Polícia ou Master podem analisar recrutamentos.' });
    if (!['aprovado', 'recusado'].includes(body.status)) return jsonRes(res, 400, { error: 'Decisão inválida.' });
    recrutamento.status = body.status;
    recrutamento.motivoDecisao = String(body.motivo || '').trim().slice(0, 500);
    recrutamento.decididoPor = executor.user;
    recrutamento.decididoPorNome = executor.nome;
    recrutamento.decididoEm = Date.now();
    saveData();
    audit(`<b>${executor.nome}</b> ${body.status} o recrutamento de <b>${recrutamento.nome}</b>`, body.status === 'aprovado' ? '✅' : '❌');
    broadcast('RECRUTAMENTO_DECIDIDO', { id: recrutamento.id, userLogin: recrutamento.userLogin, status: recrutamento.status });
    return jsonRes(res, 200, { ok: true, recrutamento });
  }

  if (method === 'GET' && url === '/api/provas') return jsonRes(res, 200, DB.provas);
  if (method === 'GET' && url === '/api/prova/questionario') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    if (params.get('tipo') === 'prisoes') {
      return jsonRes(res, 200, PRISOES_QUESTOES.map((t, i) => ({ q: i, enunciado: t })));
    }
    const cargo = params.get('cargo');
    const set = PROVAS_CARGO[cargo];
    if (!set) return jsonRes(res, 404, { error: 'Este cargo não possui prova.' });
    return jsonRes(res, 200, set.map((q, i) => ({ q: i, enunciado: q.enunciado, alt: q.alt })));
  }

  if (method === 'POST' && url === '/api/provas') {
    const { userLogin, cargoAlvo, respostas, perdidaPorTempo, tipo } = body;
    const u = DB.users.find(x => x.user === userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });

    if (tipo === 'prisoes') {
      const rs = PRISOES_QUESTOES.map((t, i) => ({
        q: i, texto: String((respostas && respostas[i] && respostas[i].texto) || '').trim()
      }));
      if (rs.some(r => r.texto.length < 3)) return jsonRes(res, 400, { error: 'Responda todas as questões.' });
      const prova = {
        id: 'PRV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        userLogin: u.user, nome: u.nome, cargoAtual: u.cargo, cargoAlvo: null,
        tipo: 'prisoes', respostas: rs, nota: null, status: 'concluida',
        ts: Date.now(), decisao: null, decididoPor: null, decididoEm: null
      };
      DB.provas.push(prova); saveData();
      audit(`<b>${u.nome}</b> enviou a AVALIAÇÃO PESSOAL (prisões)`, '🧠');
      broadcast('NEW_PROVA', prova);
      return jsonRes(res, 200, { ok: true, prova });
    }

    const set = PROVAS_CARGO[u.cargo];
    if (!set) return jsonRes(res, 400, { error: 'Seu cargo atual não possui prova.' });
    const myPerm = CARGO_PERM_SRV[u.cargo] || 0;
    const alvoPerm = CARGO_PERM_SRV[cargoAlvo] || 0;
    if (alvoPerm <= myPerm) return jsonRes(res, 400, { error: 'Escolha um cargo ACIMA do seu.' });
    if (alvoPerm >= 6) return jsonRes(res, 400, { error: 'Chefe de polícia e Admin master são escolhidos manualmente.' });

    const respMap = {};
    (respostas || []).forEach(r => { respMap[r.q] = r; });
    const corrigidas = set.map((q, i) => {
      const r = respMap[i];
      const escolha = (r && r.escolha !== undefined && r.escolha !== null) ? r.escolha : null;
      return {
        q: i, escolha,
        justificativa: (r && r.justificativa) ? String(r.justificativa) : '',
        correta: escolha === q.correta,
        corretaIdx: q.correta,
        semResposta: escolha === null
      };
    });
    const nota = Math.round((corrigidas.filter(r => r.correta).length / set.length) * 100);

    const prova = {
      id: 'PRV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      userLogin: u.user, nome: u.nome, cargoAtual: u.cargo, cargoAlvo,
      tipo: 'cargo', respostas: corrigidas, nota,
      status: perdidaPorTempo ? 'tempo_esgotado' : 'concluida',
      ts: Date.now(), decisao: null, decididoPor: null, decididoEm: null
    };
    DB.provas.push(prova); saveData();
    audit(`<b>${u.nome}</b> concluiu a prova para <b>${CARGO_LABEL_SRV[cargoAlvo] || cargoAlvo}</b> — nota ${nota}${perdidaPorTempo ? ' (tempo esgotado)' : ''}`, '📝');
    broadcast('NEW_PROVA', prova);
    return jsonRes(res, 200, { ok: true, prova });
  }

  const mProvaDec = url.match(/^\/api\/provas\/([^/]+)\/decisao$/);
  if (method === 'PUT' && mProvaDec) {
    const i = DB.provas.findIndex(p => p.id === mProvaDec[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Prova não encontrada.' });
    const { decisao, feitorPor } = body;
    if (!['promovido', 'reprovado', 'aprovado'].includes(decisao))
      return jsonRes(res, 400, { error: 'Decisão inválida.' });
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if ((CARGO_PERM_SRV[executor.cargo] || 0) < 5)
      return jsonRes(res, 403, { error: 'Apenas Master, Chefe e Delegado podem avaliar provas.' });
    if (executor.user === DB.provas[i].userLogin)
      return jsonRes(res, 403, { error: 'Você não pode avaliar a própria prova.' });
    const prova = DB.provas[i];
    prova.decisao = decisao;
    prova.decididoPor = executor.nome;
    prova.decididoEm = Date.now();

    if (decisao === 'promovido') {
      const alvo = DB.users.find(x => x.user === prova.userLogin);
      if (!alvo) return jsonRes(res, 404, { error: 'Usuário da prova não encontrado.' });
      const oldCargo = alvo.cargo;
      alvo.cargo = prova.cargoAlvo;
      saveData();
      audit(`<b>${executor.nome}</b> APROVOU e PROMOVEU <b>${prova.nome}</b> para <b>${CARGO_LABEL_SRV[prova.cargoAlvo] || prova.cargoAlvo}</b>`, '🎓');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('CARGO_CHANGED', {
        userLogin: alvo.user, oldCargo, newCargo: alvo.cargo,
        tipo: 'promovido', motivo: 'Aprovado na prova por ' + executor.nome,
        feitorPorNome: executor.nome
      });
    } else if (decisao === 'aprovado') {
      saveData();
      audit(`<b>${executor.nome}</b> APROVOU a avaliação pessoal (prisões) de <b>${prova.nome}</b>`, '✅');
    } else {
      saveData();
      audit(`<b>${executor.nome}</b> REPROVOU a prova de <b>${prova.nome}</b>`, '❌');
    }
    broadcast('PROVA_DECIDIDA', {
      id: prova.id, userLogin: prova.userLogin, decisao,
      cargoAlvo: prova.cargoAlvo, feitorNome: executor.nome, nota: prova.nota
    });
    broadcast('PROVAS_UPDATED', DB.provas);
    return jsonRes(res, 200, { ok: true, prova });
  }

  if (method === 'GET' && url === '/api/feedbacks') return jsonRes(res, 200, DB.feedbacks);
  if (method === 'POST' && url === '/api/feedbacks') {
    const { userLogin, nome, nota, texto } = body;
    if (!userLogin || !nome || typeof nota !== 'number' || nota < 1 || nota > 5)
      return jsonRes(res, 400, { error: 'Dados inválidos. Nota deve ser 1–5.' });
    const textoLimpo = String(texto || '').trim().slice(0, 800);
    if (textoLimpo.length < 3) return jsonRes(res, 400, { error: 'Escreva pelo menos 3 caracteres nas sugestões.' });
    const fb = {
      id: 'FB-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      userLogin, nome,
      cargo: (DB.users.find(u => u.user === userLogin) || {}).cargo || 'gm',
      nota, texto: textoLimpo, ts: Date.now()
    };
    DB.feedbacks.unshift(fb);
    DB.feedbacks = DB.feedbacks.slice(0, 500);
    saveData();
    audit(`<b>${nome}</b> avaliou o sistema com <b>${nota}★</b>`, '⭐');
    broadcast('NEW_FEEDBACK', fb);
    return jsonRes(res, 200, { ok: true, feedback: fb });
  }
  const mDelFb = url.match(/^\/api\/feedbacks\/([^/]+)$/);
  if (method === 'DELETE' && mDelFb) {
    const executor = findUserByRef(body.feitorPor);
    if (!executor || (CARGO_PERM_SRV[executor.cargo] || 0) < 6)
      return jsonRes(res, 403, { error: 'Apenas Chefe e Admin podem excluir feedbacks.' });
    const i = DB.feedbacks.findIndex(f => f.id === mDelFb[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Feedback não encontrado.' });
    DB.feedbacks.splice(i, 1);
    saveData();
    broadcast('FEEDBACKS_UPDATED', DB.feedbacks);
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET' && url === '/api/chats') {
    const userLogin = body.userLogin || (req.url.split('?')[1] ? new URLSearchParams(req.url.split('?')[1]).get('user') : null);
    if (!userLogin) return jsonRes(res, 200, []);
    return jsonRes(res, 200, DB.chats.filter(c => c.from === userLogin || c.to === userLogin));
  }
  if (method === 'POST' && url === '/api/chats') {
    const { from, to, texto } = body;
    if (!from || !to || !texto || texto.trim().length === 0)
      return jsonRes(res, 400, { error: 'Dados inválidos.' });
    if (from === to) return jsonRes(res, 400, { error: 'Você não pode enviar mensagem para si mesmo.' });
    const uFrom = DB.users.find(u => u.user === from);
    const uTo   = DB.users.find(u => u.user === to);
    if (!uFrom || !uTo) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const msg = {
      id: 'MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      from, to, fromNome: uFrom.nome, toNome: uTo.nome,
      texto: String(texto).trim().slice(0, 2000), ts: Date.now()
    };
    DB.chats.push(msg);
    DB.chats = DB.chats.slice(-5000);
    saveData();
    broadcast('NEW_CHAT_MSG', msg);
    return jsonRes(res, 200, { ok: true, msg });
  }
  const mDelChat = url.match(/^\/api\/chats\/([^/]+)$/);
  if (method === 'DELETE' && mDelChat) {
    const msgId = mDelChat[1];
    const executor = findUserByRef(body.feitorPor);
    if (!executor || (CARGO_PERM_SRV[executor.cargo] || 0) < 6)
      return jsonRes(res, 403, { error: 'Apenas Chefes e Admin podem excluir mensagens.' });
    const i = DB.chats.findIndex(m => m.id === msgId);
    if (i === -1) return jsonRes(res, 404, { error: 'Mensagem não encontrada.' });
    DB.chats.splice(i, 1);
    saveData();
    broadcast('CHAT_MSG_DELETED', { id: msgId });
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET' && url === '/api/audit') return jsonRes(res, 200, DB.audit);
  if (method === 'DELETE' && url === '/api/audit') {
    DB.audit = []; saveData();
    broadcast('AUDIT_CLEARED', {});
    return jsonRes(res, 200, { ok: true });
  }

  // ══════════════════════════════════════════════════════════
  // 🏆 HALL DA FAMA / FUNCIONÁRIO DO MÊS
  // ══════════════════════════════════════════════════════════
  if (method === 'GET' && url === '/api/hall-da-fama') {
    const ocsDe = (nome) => DB.ocs.filter(o => o.delegado === nome).length;
    const opsDe = (nome) => DB.ocs.filter(o => o.delegado === nome && String(o.tipo || '').toLowerCase().includes('oper')).length;
    const top5  = (arr) => arr.slice(0, 5);
    const hall = {
      maisHoras:        top5([...DB.users].sort((a, b) => calcHorasServidor(b.user).trab - calcHorasServidor(a.user).trab))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: calcHorasServidor(u.user).trab })),
      maisOcorrencias:  top5([...DB.users].sort((a, b) => ocsDe(b.nome) - ocsDe(a.nome)))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: ocsDe(u.nome) })),
      maisOperacoes:    top5([...DB.users].sort((a, b) => opsDe(b.nome) - opsDe(a.nome)))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: opsDe(u.nome) })),
      maiorSequencia:   top5([...DB.users].sort((a, b) => (b.sequenciaAtiva || 0) - (a.sequenciaAtiva || 0)))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: u.sequenciaAtiva || 0 })),
      maiorXp:          top5([...DB.users].sort((a, b) => calcXP(b) - calcXP(a)))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: calcXP(u) })),
      maisMedalhas:     top5([...DB.users].sort((a, b) => (b.medalhas || []).length - (a.medalhas || []).length))
                          .map(u => ({ nome: u.nome, cargo: u.cargo, valor: (u.medalhas || []).length }))
    };
    hall.funcionarioDoMes = hall.maisHoras[0] || null;
    return jsonRes(res, 200, hall);
  }

  // ══════════════════════════════════════════════════════════
  // 🚓 SISTEMA PRISIONAL
  // ══════════════════════════════════════════════════════════
  if (method === 'GET' && url === '/api/prisoes') return jsonRes(res, 200, DB.prisoes);

  if (method === 'POST' && url === '/api/prisoes') {
    const { nomePF, nomeEnvolvido, motivo } = body;
    if (!nomePF || !nomeEnvolvido || !motivo)
      return jsonRes(res, 400, { error: 'Preencha: Nome do PF, Nome do envolvido e Motivo da prisão.' });
    const prisao = {
      id: 'PRI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      nomePF:        String(nomePF).slice(0, 60),
      nomeEnvolvido: String(nomeEnvolvido).slice(0, 60),
      motivo:        String(motivo).slice(0, 200),
      hora: brTimeStrSec(Date.now()),
      data: brDateStr(Date.now()),
      ts:   Date.now()
    };
    DB.prisoes.unshift(prisao);
    DB.prisoes = DB.prisoes.slice(0, 500);
    saveData();
    audit(`<b>${prisao.nomePF}</b> efetuou prisão de <b>${prisao.nomeEnvolvido}</b> às ${prisao.hora} — motivo: ${prisao.motivo}`, '🚓');
    broadcast('NEW_PRISAO', prisao);
    broadcast('PRISOES_UPDATED', DB.prisoes);
    return jsonRes(res, 200, { ok: true, prisao });
  }

  const mPrisao = url.match(/^\/api\/prisoes\/([^/]+)$/);
  if (method === 'DELETE' && mPrisao) {
    const i = DB.prisoes.findIndex(p => p.id === mPrisao[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Prisão não encontrada.' });
    const executor = findUserByRef(body.feitorPor);
    if (!executor || (CARGO_PERM_SRV[executor.cargo] || 0) < 5)
      return jsonRes(res, 403, { error: 'Apenas Delegado, Chefe ou Master podem excluir prisões.' });
    const rem = DB.prisoes.splice(i, 1)[0];
    saveData();
    audit(`<b>${executor.nome}</b> removeu a prisão de <b>${rem.nomeEnvolvido}</b>`, '🔓');
    broadcast('PRISOES_UPDATED', DB.prisoes);
    return jsonRes(res, 200, { ok: true });
  }

  return jsonRes(res, 404, { error: 'Rota não encontrada.' });
}

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/api') || req.url === '/health') return handleAPI(req, res);
  serveStatic(req, res);
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  if (!wsHandshake(req, socket)) return;
  socket.isAlive = true;
  socket._buffer = Buffer.alloc(0);
  wsClients.add(socket);
  wsSend(socket, {
    type: 'INIT',
    payload: {
      ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos, provas: DB.provas,
      users: DB.users.map(pub), audit: DB.audit,
      feedbacks: DB.feedbacks, chats: DB.chats,
      prisoes: DB.prisoes,
      roletaPremios: DB.roletaPremios
    }
  });

  socket.on('data', (chunk) => {
    socket._buffer = Buffer.concat([socket._buffer, chunk]);
    while (socket._buffer.length >= 2) {
      const frame = wsParseFrame(socket._buffer);
      if (!frame) break;
      socket._buffer = socket._buffer.slice(frame.frameLen);
      if (frame.opcode === 0x08) { wsClose(socket); return; }
      if (frame.opcode === 0x09) { wsSendPong(socket, frame.payload); continue; }
      if (frame.opcode === 0x0a) { socket.isAlive = true; continue; }
      if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        try {
          const msg = JSON.parse(frame.payload.toString('utf8'));
          if (msg.type === 'PING') wsSend(socket, { type: 'PONG', ts: Date.now() });
        } catch (_) {}
      }
    }
  });

  socket.on('close', () => { wsClients.delete(socket); });
  socket.on('error', () => { wsClients.delete(socket); });
});

setInterval(() => {
  wsClients.forEach(s => {
    if (!s.isAlive) { wsClose(s); return; }
    s.isAlive = false;
    try { s.write(wsBuildFrame(Buffer.alloc(0), 0x09)); } catch (e) { wsClose(s); }
  });
}, 25000);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   🚔  GMPOL Sistema Central v5.16        ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   Porta: ${PORT.toString().padEnd(35)}║`);
  console.log('║   master    / masterx512  (ACESSO TOTAL) ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║   🌟 MASTER VIP: score 0-100 + sequência ║');
  console.log('║   🏅 Medalhas (só Master dá, máx 5)      ║');
  console.log('║   ⏱️ Banco de horas VIP detalhado        ║');
  console.log('║   🏆 Hall da Fama / Funcionário do Mês   ║');
  console.log('║   🚓 Sistema Prisional completo          ║');
  console.log('╚═══════════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('uncaughtException', (e) => { console.error('[FATAL]', e); saveDataSync(); });

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
if (RENDER_URL) {
  const keepAliveUrl = RENDER_URL.replace(/\/$/, '') + '/health';
  setInterval(() => {
    const proto = keepAliveUrl.startsWith('https') ? require('https') : require('http');
    const req = proto.get(keepAliveUrl, (res) => { res.resume(); });
    req.on('error', (e) => console.warn('[KeepAlive] Ping falhou:', e.message));
    req.end();
  }, 14 * 60 * 1000);
  }
