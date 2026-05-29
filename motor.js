/* ============================================================
   SUPER TRUNFO EGÍPCIO — MOTOR (regras puras)
   ============================================================
   Este é o "cérebro" do jogo: funções PURAS, sem tela e sem
   internet. É exatamente este motor que o HOST roda na partida
   online — a rede apenas transporta o estado que ele produz.
   Não altere a lógica aqui sem reexecutar os testes.
   ============================================================ */

const ATRIBUTOS = ["poder", "inteligencia", "forca", "agressividade"];

const LABELS = {
  poder:         "Poder",
  inteligencia:  "Inteligência",
  forca:         "Força",
  agressividade: "Agressividade"
};

// Cores de cada assento (combina com o tema e com o visual de lobby)
const CORES = ["#d4af37", "#4a90d9", "#5cb85c", "#d9534f"];

function embaralhar(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Lista os índices dos jogadores ainda vivos (não eliminados)
function ativos(estado) {
  return estado.jogadores.filter(j => !j.eliminado).map(j => j.id);
}

// Compara o RANK de dois ids de carta. Letra: A>B>C>D | Número: 1>2>...>8.
function rankMaisAlto(idCartaA, idCartaB) {
  const letraA = idCartaA.slice(-1);
  const letraB = idCartaB.slice(-1);
  if (letraA !== letraB) {
    return letraA < letraB ? idCartaA : idCartaB; // 'A' < 'B' => A vence
  }
  const numA = parseInt(idCartaA.slice(0, -1), 10);
  const numB = parseInt(idCartaB.slice(0, -1), 10);
  return numA < numB ? idCartaA : idCartaB;
}

// Dado um mapa { idJogador: carta }, devolve o idJogador da carta de rank mais alto.
function vencedorPorRank(cartasPorJogador) {
  const entradas = Object.entries(cartasPorJogador);
  let melhor = entradas[0];
  for (let k = 1; k < entradas.length; k++) {
    const atual = entradas[k];
    if (rankMaisAlto(atual[1].id, melhor[1].id) === atual[1].id) {
      melhor = atual;
    }
  }
  return Number(melhor[0]);
}

// Cria uma partida nova. configJogadores: [{ nome, tipo }] com 2 a 4 itens.
function criarPartida(configJogadores) {
  const baralho = embaralhar(window.CARTAS);
  const n = configJogadores.length;

  const jogadores = configJogadores.map((c, i) => ({
    id: i,
    nome: c.nome,
    tipo: c.tipo,         // "humano" | "bot"
    mao: [],
    eliminado: false,
    cor: CORES[i]
  }));

  // Distribuição "round-robin": 4 -> 8/8/8/8 | 3 -> 11/11/10 | 2 -> 16/16
  baralho.forEach((carta, idx) => {
    jogadores[idx % n].mao.push(carta);
  });

  return {
    jogadores,
    pilhaDisputa: [],
    escolhedor: 0,
    desempate: null,        // null OU { participantes:[ids], escolhedor, cartasEmpatadas:{id:carta} }
    mesa: {},
    ultimoEvento: null,
    fimDeJogo: false,
    vencedor: null
  };
}

function escolhedorVigente(estado) {
  return estado.desempate ? estado.desempate.escolhedor : estado.escolhedor;
}

function participantesAtuais(estado) {
  return estado.desempate ? estado.desempate.participantes : ativos(estado);
}

// Marca como eliminado quem ficou sem cartas — exceto quem ainda disputa uma pilha.
function marcarEliminados(estado) {
  const emDesempate = estado.desempate ? new Set(estado.desempate.participantes) : new Set();
  for (const j of estado.jogadores) {
    if (!j.eliminado && j.mao.length === 0 && !emDesempate.has(j.id)) {
      j.eliminado = true;
    }
  }
}

function checarFim(estado) {
  const vivos = ativos(estado);
  if (vivos.length <= 1) {
    estado.fimDeJogo = true;
    estado.vencedor = vivos.length === 1 ? vivos[0] : null;
  }
}

// Quem escolhe na subdisputa: se quem escolhia está entre os empatados, segue ele;
// senão, o de menor índice (ordem dos assentos).
function decidirEscolhedorDesempate(estado, empatados) {
  const vigente = escolhedorVigente(estado);
  if (empatados.includes(vigente)) return vigente;
  return Math.min(...empatados);
}

// NÚCLEO: resolve a comparação atual a partir do atributo escolhido.
function resolverComparacao(estado, atributo) {
  const participantes = participantesAtuais(estado);

  estado.mesa = {};
  for (const id of participantes) {
    estado.mesa[id] = estado.jogadores[id].mao.shift();
  }
  const cartasDaMesa = participantes.map(id => estado.mesa[id]);

  const valores = {};
  for (const id of participantes) valores[id] = estado.mesa[id][atributo];
  const maxValor = Math.max(...participantes.map(id => valores[id]));
  const empatados = participantes.filter(id => valores[id] === maxValor);

  if (empatados.length === 1) {
    const vId = empatados[0];
    const ganho = cartasDaMesa.length + estado.pilhaDisputa.length;
    estado.jogadores[vId].mao.push(...cartasDaMesa, ...estado.pilhaDisputa);
    estado.pilhaDisputa = [];
    estado.desempate = null;
    estado.escolhedor = vId;
    estado.ultimoEvento = { tipo: "vitoria", atributo, valores, vencedor: vId, empatados: [], ganho, participantes };
  } else {
    estado.pilhaDisputa.push(...cartasDaMesa);
    const novoEscolhedor = decidirEscolhedorDesempate(estado, empatados);
    const cartasEmpatadas = {};
    for (const id of empatados) cartasEmpatadas[id] = estado.mesa[id];
    estado.desempate = { participantes: empatados, escolhedor: novoEscolhedor, cartasEmpatadas };
    estado.ultimoEvento = { tipo: "empate", atributo, valores, vencedor: null, empatados, ganho: 0, participantes };
  }

  marcarEliminados(estado);
  checarFim(estado);
  return estado;
}

// Resolve a subdisputa por RANK (quando algum empatado ficou sem cartas).
function resolverPorRank(estado) {
  const cartas = estado.desempate.cartasEmpatadas;
  const vId = vencedorPorRank(cartas);
  const ganho = estado.pilhaDisputa.length;

  estado.jogadores[vId].mao.push(...estado.pilhaDisputa);
  estado.pilhaDisputa = [];
  estado.mesa = {};
  estado.ultimoEvento = { tipo: "rank", atributo: null, valores: {}, vencedor: vId, empatados: Object.keys(cartas).map(Number), ganho, cartasEmpatadas: cartas };
  estado.desempate = null;
  estado.escolhedor = vId;

  marcarEliminados(estado);
  checarFim(estado);
  return estado;
}

// A subdisputa precisa ser decidida por rank? (algum empatado sem carta para virar)
function precisaResolverPorRank(estado) {
  if (!estado.desempate) return false;
  return estado.desempate.participantes.some(id => estado.jogadores[id].mao.length === 0);
}

// BOT: escolhe o maior atributo da própria carta do topo.
function botEscolheAtributo(estado, idBot) {
  const carta = estado.jogadores[idBot].mao[0];
  let melhor = ATRIBUTOS[0];
  for (const a of ATRIBUTOS) {
    if (carta[a] > carta[melhor]) melhor = a;
  }
  return melhor;
}
