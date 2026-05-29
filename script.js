/* ============================================================
   SUPER TRUNFO EGÍPCIO — Lógica do jogo (multiplayer 2 a 4)
   ============================================================

   ESTE ARQUIVO ESTÁ DIVIDIDO EM CAMADAS DE PROPÓSITO:

   [1] MOTOR  — funções PURAS de regra (sem tela, sem internet).
                É o "cérebro" do jogo. Na fase online, é exatamente
                este motor que o HOST vai rodar; a rede só leva o
                estado pronto para os outros jogadores.
   [2] BOT    — a "inteligência" dos jogadores controlados pela máquina.
   [3] CONTROLE LOCAL — por enquanto roda tudo neste aparelho (você + bots).
                Na fase online, esta camada é trocada pela camada de rede.
   [4] TELA   — desenha o estado e captura os cliques.
   [5] LOBBY  — a tela onde você monta a partida (humano/bot/vazia).
   [6] MÚSICA — igual ao original.

   ============================================================ */


/* ============================================================
   [1] MOTOR — regras puras (não toca na tela nem na internet)
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
// Retorna o id de carta de rank MAIS ALTO.
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

// Dado um mapa { idJogador: carta }, devolve o idJogador dono da carta de rank mais alto.
function vencedorPorRank(cartasPorJogador) {
  const entradas = Object.entries(cartasPorJogador); // [ [idJogador, carta], ... ]
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
// tipo é "humano" ou "bot".
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

  // Distribuição "round-robin": lida com divisão não exata.
  // 4 jogadores -> 8/8/8/8 | 3 -> 11/11/10 | 2 -> 16/16
  baralho.forEach((carta, idx) => {
    jogadores[idx % n].mao.push(carta);
  });

  return {
    jogadores,
    pilhaDisputa: [],       // cartas acumuladas em empates
    escolhedor: 0,          // quem escolhe o atributo na rodada normal (começa no J1/host)
    desempate: null,        // null OU { participantes:[ids], escolhedor, cartasEmpatadas:{id:carta} }
    mesa: {},               // { idJogador: carta } cartas viradas na comparação atual
    ultimoEvento: null,     // resultado da última comparação (para a tela)
    fimDeJogo: false,
    vencedor: null
  };
}

// Quem está com o "direito de escolha" no momento (normal ou dentro do desempate)?
function escolhedorVigente(estado) {
  return estado.desempate ? estado.desempate.escolhedor : estado.escolhedor;
}

// Quem participa da comparação ATUAL? Em desempate, só os empatados; senão, todos os vivos.
function participantesAtuais(estado) {
  return estado.desempate ? estado.desempate.participantes : ativos(estado);
}

// Marca como eliminado quem ficou sem cartas — EXCETO quem ainda está
// disputando uma pilha de empate (esses ainda podem vencer pelo rank).
function marcarEliminados(estado) {
  const emDesempate = estado.desempate ? new Set(estado.desempate.participantes) : new Set();
  for (const j of estado.jogadores) {
    if (!j.eliminado && j.mao.length === 0 && !emDesempate.has(j.id)) {
      j.eliminado = true;
    }
  }
}

// Verifica e registra o fim de jogo (sobrou 1 ou 0 vivos).
function checarFim(estado) {
  const vivos = ativos(estado);
  if (vivos.length <= 1) {
    estado.fimDeJogo = true;
    estado.vencedor = vivos.length === 1 ? vivos[0] : null;
  }
}

// Decide quem escolhe o atributo na subdisputa, conforme a regra:
// se quem estava escolhendo está entre os empatados, ele continua;
// senão, escolhe o de menor índice (ordem dos assentos J1>J2>J3>J4).
function decidirEscolhedorDesempate(estado, empatados) {
  const vigente = escolhedorVigente(estado);
  if (empatados.includes(vigente)) return vigente;
  return Math.min(...empatados);
}

// NÚCLEO: resolve a comparação atual a partir do atributo escolhido.
// Vira a carta de cada participante, compara, e atualiza o estado:
// - vencedor único -> leva mesa + pilha, vira o escolhedor;
// - empate no topo -> cartas vão para a pilha e abre/continua subdisputa.
function resolverComparacao(estado, atributo) {
  const participantes = participantesAtuais(estado);

  // 1) Cada participante vira a carta do topo da mão para a mesa.
  estado.mesa = {};
  for (const id of participantes) {
    estado.mesa[id] = estado.jogadores[id].mao.shift();
  }
  const cartasDaMesa = participantes.map(id => estado.mesa[id]);

  // 2) Mede o atributo de cada um.
  const valores = {};
  for (const id of participantes) valores[id] = estado.mesa[id][atributo];
  const maxValor = Math.max(...participantes.map(id => valores[id]));
  const empatados = participantes.filter(id => valores[id] === maxValor);

  if (empatados.length === 1) {
    // ---- VENCEDOR ÚNICO ----
    const vId = empatados[0];
    const ganho = cartasDaMesa.length + estado.pilhaDisputa.length;
    estado.jogadores[vId].mao.push(...cartasDaMesa, ...estado.pilhaDisputa);
    estado.pilhaDisputa = [];
    estado.desempate = null;
    estado.escolhedor = vId;

    estado.ultimoEvento = {
      tipo: "vitoria",
      atributo, valores,
      vencedor: vId,
      empatados: [],
      ganho,
      participantes
    };
  } else {
    // ---- EMPATE NO TOPO: vai para a pilha e abre subdisputa ----
    estado.pilhaDisputa.push(...cartasDaMesa);
    const novoEscolhedor = decidirEscolhedorDesempate(estado, empatados);

    const cartasEmpatadas = {};
    for (const id of empatados) cartasEmpatadas[id] = estado.mesa[id];

    estado.desempate = {
      participantes: empatados,
      escolhedor: novoEscolhedor,
      cartasEmpatadas
    };

    estado.ultimoEvento = {
      tipo: "empate",
      atributo, valores,
      vencedor: null,
      empatados,
      ganho: 0,
      participantes
    };
  }

  marcarEliminados(estado);
  checarFim(estado);
  return estado;
}

// Resolve uma subdisputa por RANK (acionada quando algum participante
// do desempate ficou sem cartas para virar). O dono da carta de rank
// mais alto leva toda a pilha de disputa.
function resolverPorRank(estado) {
  const cartas = estado.desempate.cartasEmpatadas;
  const vId = vencedorPorRank(cartas);
  const ganho = estado.pilhaDisputa.length;

  estado.jogadores[vId].mao.push(...estado.pilhaDisputa);
  estado.pilhaDisputa = [];
  estado.mesa = {};

  estado.ultimoEvento = {
    tipo: "rank",
    atributo: null,
    valores: {},
    vencedor: vId,
    empatados: Object.keys(cartas).map(Number),
    ganho,
    cartasEmpatadas: cartas
  };

  estado.desempate = null;
  estado.escolhedor = vId;

  marcarEliminados(estado);
  checarFim(estado);
  return estado;
}

// A subdisputa precisa ser decidida por rank? (algum empatado sem carta para virar)
function precisaResolverPorRank(estado) {
  if (!estado.desempate) return false;
  return estado.desempate.participantes.some(
    id => estado.jogadores[id].mao.length === 0
  );
}


/* ============================================================
   [2] BOT — escolhe o maior atributo da própria carta do topo
   ============================================================ */

function botEscolheAtributo(estado, idBot) {
  const carta = estado.jogadores[idBot].mao[0];
  let melhor = ATRIBUTOS[0];
  for (const a of ATRIBUTOS) {
    if (carta[a] > carta[melhor]) melhor = a;
  }
  return melhor;
}


/* ============================================================
   [3] CONTROLE LOCAL — orquestra o turno neste aparelho
   (Na fase online, esta seção é substituída pela camada de rede.)
   ============================================================ */

let estado = null;            // estado atual da partida
let travado = false;          // impede cliques duplicados

const ESPERA_BOT = 1100;      // ms que o bot "pensa" antes de jogar
const ESPERA_RANK = 900;      // ms antes de resolver um desempate por rank

function iniciarPartida(configJogadores) {
  estado = criarPartida(configJogadores);
  mostrarTela("tela-jogo");
  proximaFase();
}

// Decide o que acontece agora: fim, desempate por rank automático, ou pedir escolha.
function proximaFase() {
  travado = false;
  estado.mesa = {};
  renderPlacar();

  if (estado.fimDeJogo) {
    return mostrarFim();
  }

  // Subdisputa em que alguém zerou: resolve por rank, sem pedir atributo.
  if (precisaResolverPorRank(estado)) {
    renderEsperaRank();
    setTimeout(() => {
      resolverPorRank(estado);
      renderRevelacao();
    }, ESPERA_RANK);
    return;
  }

  const quem = escolhedorVigente(estado);
  const jog = estado.jogadores[quem];

  renderFaseEscolha();                   // mostra a carta do jogador local + (se humano) os atributos
  if (jog.tipo === "bot") {
    setTimeout(() => {
      if (!estado) return;               // partida pode ter sido encerrada
      const attr = botEscolheAtributo(estado, quem);
      aplicarEscolha(attr);
    }, ESPERA_BOT);
  }
}

// Chamado quando o escolhedor (humano ou bot) define o atributo.
function aplicarEscolha(atributo) {
  if (travado) return;
  travado = true;
  resolverComparacao(estado, atributo);
  renderRevelacao();
}


/* ============================================================
   [4] TELA — desenha o estado e captura cliques
   ============================================================ */

function mostrarTela(idTela) {
  document.querySelectorAll(".tela").forEach(t => t.classList.remove("ativa"));
  document.getElementById(idTela).classList.add("ativa");
}

function htmlCartaCompleta(carta) {
  return `
    <img src="${carta.imagem}" alt="${carta.nome}" />
    <div class="carta-nome">
      ${carta.nome}
      ${carta.superTrunfo ? '<span class="super-trunfo-tag">★ SUPER TRUNFO ★</span>' : ""}
    </div>
  `;
}

function htmlCartaVerso() {
  return `<div class="carta-verso">𓂀</div>`;
}

// Placar: um bloco por jogador (nome, nº de cartas, selos) + a pilha de disputa.
function renderPlacar() {
  const escolhe = escolhedorVigente(estado);
  const emDesempate = estado.desempate ? new Set(estado.desempate.participantes) : new Set();

  const blocosJog = estado.jogadores.map(j => {
    const selos = [];
    if (!estado.fimDeJogo && j.id === escolhe && !j.eliminado) selos.push("👑");
    if (estado.desempate && emDesempate.has(j.id)) selos.push("⚔️");
    if (j.tipo === "bot") selos.push("🤖");
    if (j.eliminado) selos.push("💀");

    return `
      <div class="bloco-placar ${j.eliminado ? "eliminado" : ""}" style="--cor:${j.cor}">
        <span class="rotulo">${j.nome} ${selos.join("")}</span>
        <span class="numero">${j.mao.length}</span>
      </div>`;
  }).join("");

  const blocoPilha = `
    <div class="bloco-placar pilha">
      <span class="rotulo">Disputa</span>
      <span class="numero">${estado.pilhaDisputa.length}</span>
    </div>`;

  document.getElementById("placar").innerHTML = blocosJog + blocoPilha;
}

// Entre os participantes da comparação atual, o primeiro humano vivo (menor índice).
// É a "perspectiva" da tela quando quem escolhe é um bot. null se não houver humano em jogo.
// (Na fase online, isto vira simplesmente "o dono deste aparelho".)
function humanoDeReferencia(estado) {
  const part = participantesAtuais(estado);
  const humanos = part.filter(id => estado.jogadores[id].tipo === "humano" && !estado.jogadores[id].eliminado);
  return humanos.length ? Math.min(...humanos) : null;
}

// Fase de escolha (humano OU bot).
// Princípio do Super Trunfo: cada jogador SEMPRE vê a própria carta; as dos
// outros ficam viradas até a revelação. Aqui:
//  - se quem escolhe é HUMANO, a perspectiva é dele (vê a própria carta + botões);
//  - se quem escolhe é um BOT, a perspectiva é do humano de referência
//    (a carta dele continua à mostra, mas sem botões — ele só assiste).
function renderFaseEscolha() {
  const escolhe = escolhedorVigente(estado);
  const ehBot = estado.jogadores[escolhe].tipo === "bot";
  const local = ehBot ? humanoDeReferencia(estado) : escolhe; // de quem é a carta visível
  const part = participantesAtuais(estado);

  const cartasHTML = part.map(id => {
    const j = estado.jogadores[id];
    const ehLocal = id === local;
    const corpo = ehLocal ? htmlCartaCompleta(j.mao[0]) : htmlCartaVerso();
    const selo = ehLocal
      ? `<span class="badge-valor">Sua carta</span>`
      : `<span class="badge-valor oculto">oculta</span>`;
    return `
      <div class="slot-mesa ${ehLocal ? "local" : ""}">
        <span class="slot-nome" style="--cor:${j.cor}">${j.nome}</span>
        <div class="carta carta-media">${corpo}</div>
        ${selo}
      </div>`;
  }).join("");

  document.getElementById("mesa").innerHTML = `<div class="mesa-grid">${cartasHTML}</div>`;

  const msg = document.getElementById("mensagem");
  msg.className = estado.desempate ? "empate" : "";

  if (ehBot) {
    mostrarAtributos(false);
    msg.textContent = estado.desempate
      ? `${estado.jogadores[escolhe].nome} está escolhendo o desempate…`
      : `${estado.jogadores[escolhe].nome} está escolhendo…`;
  } else {
    const carta = estado.jogadores[escolhe].mao[0];
    document.querySelectorAll(".btn-attr").forEach(btn => {
      const a = btn.dataset.attr;
      btn.querySelector(".valor-attr").textContent = carta[a];
      btn.disabled = false;
    });
    mostrarAtributos(true);
    msg.textContent = estado.desempate
      ? `Empate! ${estado.jogadores[escolhe].nome}, escolha o atributo do desempate.`
      : `${estado.jogadores[escolhe].nome}, escolha um atributo.`;
  }

  document.getElementById("btn-proxima").style.display = "none";
}

// Aviso de desempate por rank prestes a ser resolvido.
function renderEsperaRank() {
  mostrarAtributos(false);
  document.getElementById("mesa").innerHTML =
    `<div class="mesa-grid"><p class="aviso-rank">Alguém ficou sem cartas — desempate pelo rank da carta…</p></div>`;
  const msg = document.getElementById("mensagem");
  msg.className = "empate";
  msg.textContent = "Resolvendo o desempate…";
  document.getElementById("btn-proxima").style.display = "none";
}

// Revelação: mostra as cartas dos participantes com o valor disputado e o resultado.
function renderRevelacao() {
  renderPlacar();
  mostrarAtributos(false);

  const ev = estado.ultimoEvento;
  const cartasPorJog = ev.tipo === "rank" ? ev.cartasEmpatadas : estado.mesa;
  const idsMostrar = ev.tipo === "rank"
    ? Object.keys(cartasPorJog).map(Number)
    : ev.participantes;

  const cartasHTML = idsMostrar.map(id => {
    const j = estado.jogadores[id];
    const carta = cartasPorJog[id];
    const ganhou = id === ev.vencedor;
    const empatou = ev.empatados.includes(id);
    const classe = ganhou ? "vencedora" : (empatou ? "empatada" : "perdedora");

    const badge = ev.tipo === "rank"
      ? `<span class="badge-valor">rank ${carta.id}</span>`
      : `<span class="badge-valor">${LABELS[ev.atributo]}: ${ev.valores[id]}</span>`;

    return `
      <div class="slot-mesa ${classe}">
        <span class="slot-nome" style="--cor:${j.cor}">${j.nome}</span>
        <div class="carta carta-media">${htmlCartaCompleta(carta)}</div>
        ${badge}
      </div>`;
  }).join("");

  document.getElementById("mesa").innerHTML = `<div class="mesa-grid">${cartasHTML}</div>`;

  // Texto do resultado
  const msg = document.getElementById("mensagem");
  let texto = "";
  if (ev.tipo === "vitoria") {
    texto = `${estado.jogadores[ev.vencedor].nome} venceu em ${LABELS[ev.atributo]} (+${ev.ganho} cartas).`;
    msg.className = "vitoria";
  } else if (ev.tipo === "empate") {
    const nomes = ev.empatados.map(id => estado.jogadores[id].nome).join(" e ");
    texto = `Empate entre ${nomes}! As cartas vão para a pilha (${estado.pilhaDisputa.length} acumuladas). Só eles disputam.`;
    msg.className = "empate";
  } else if (ev.tipo === "rank") {
    texto = `${estado.jogadores[ev.vencedor].nome} venceu o desempate pelo rank e leva ${ev.ganho} cartas.`;
    msg.className = "vitoria";
  }
  msg.innerHTML = texto;

  // Botão de avançar (ou ir para o fim)
  const btn = document.getElementById("btn-proxima");
  btn.textContent = estado.fimDeJogo ? "Ver resultado" : "Próxima rodada";
  btn.style.display = "inline-block";
}

function mostrarAtributos(mostrar) {
  document.getElementById("botoes-atributos").style.display = mostrar ? "grid" : "none";
}

function mostrarFim() {
  const venc = estado.vencedor;
  let titulo, resumo;
  if (venc === null) {
    titulo = "Empate técnico";
    resumo = "Ninguém sobrou com cartas. Resultado raríssimo.";
  } else if (estado.jogadores[venc].tipo === "humano") {
    titulo = "🏆 " + estado.jogadores[venc].nome + " venceu!";
    resumo = `${estado.jogadores[venc].nome} dominou o baralho. Os deuses escolheram seu campeão.`;
  } else {
    titulo = "💀 " + estado.jogadores[venc].nome + " venceu";
    resumo = `${estado.jogadores[venc].nome} ficou com todas as cartas. Tente de novo.`;
  }
  document.getElementById("resultado-final").textContent = titulo;
  document.getElementById("resumo-final").textContent = resumo;
  mostrarTela("tela-fim");
}


/* ============================================================
   [5] LOBBY LOCAL — monta a partida (humano / bot / vazia)
   O assento 1 é sempre você. Esta tela é a base do lobby online.
   ============================================================ */

// Estado de cada assento na tela de montagem. Assento 0 = você (fixo).
let configAssentos = ["humano", "bot", "vazia", "vazia"];

function renderLobby() {
  const cont = document.getElementById("assentos");
  cont.innerHTML = estado === null
    ? estado // (no-op; placeholder para clareza)
    : "";

  const html = configAssentos.map((tipo, i) => {
    const fixo = i === 0;
    const nomeBase = i === 0 ? "Você" : `Assento ${i + 1}`;
    const opcoes = fixo
      ? `<div class="assento-fixo">VOCÊ (anfitrião)</div>`
      : ["humano", "bot", "vazia"].map(op => {
          const rotulo = { humano: "👤 Humano", bot: "🤖 Bot", vazia: "🚫 Vazia" }[op];
          const sel = tipo === op ? "sel" : "";
          return `<button class="op-assento ${sel}" data-assento="${i}" data-op="${op}">${rotulo}</button>`;
        }).join("");

    return `
      <div class="assento" style="--cor:${CORES[i]}">
        <div class="assento-titulo">${nomeBase}</div>
        <div class="assento-ops">${opcoes}</div>
      </div>`;
  }).join("");

  cont.innerHTML = html;

  // Liga os botões de opção
  cont.querySelectorAll(".op-assento").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.assento);
      configAssentos[i] = btn.dataset.op;
      renderLobby();
      atualizarBotaoComecar();
    });
  });

  atualizarBotaoComecar();
}

// Quantos assentos ativos (não vazios) existem?
function assentosAtivos() {
  return configAssentos.filter(t => t !== "vazia").length;
}

function atualizarBotaoComecar() {
  const btn = document.getElementById("btn-comecar");
  const n = assentosAtivos();
  const aviso = document.getElementById("aviso-lobby");
  if (n < 2) {
    btn.disabled = true;
    aviso.textContent = "Selecione pelo menos 2 participantes (você + 1).";
  } else {
    btn.disabled = false;
    aviso.textContent = `${n} participantes nesta partida.`;
  }
}

// Converte os assentos em configuração de jogadores e começa.
function comecarDoLobby() {
  const config = [];
  let contHumano = 1, contBot = 1;
  configAssentos.forEach((tipo, i) => {
    if (tipo === "vazia") return;
    if (i === 0) {
      config.push({ nome: "Você", tipo: "humano" });
    } else if (tipo === "humano") {
      contHumano++;
      config.push({ nome: `Jogador ${i + 1}`, tipo: "humano" });
    } else {
      config.push({ nome: `Bot ${i + 1}`, tipo: "bot" });
    }
  });
  iniciarPartida(config);
}


/* ============================================================
   [6] MÚSICA DE FUNDO (começa DESLIGADA) — igual ao original
   ============================================================ */

const musicaFundo = document.getElementById("musica-fundo");
const btnSom = document.getElementById("btn-som");

btnSom.addEventListener("click", () => {
  if (musicaFundo.paused) {
    musicaFundo.play().catch(() => {});
    btnSom.textContent = "🔊";
    btnSom.setAttribute("aria-label", "Desligar a música");
    btnSom.setAttribute("title", "Música: ligada");
  } else {
    musicaFundo.pause();
    btnSom.textContent = "🔇";
    btnSom.setAttribute("aria-label", "Ligar a música");
    btnSom.setAttribute("title", "Música: desligada");
  }
});


/* ============================================================
   [7] LIGAÇÕES DE TELA E INÍCIO
   ============================================================ */

// Tela inicial -> lobby
document.getElementById("btn-iniciar").addEventListener("click", () => {
  mostrarTela("tela-lobby");
  renderLobby();
});

// Lobby -> partida
document.getElementById("btn-comecar").addEventListener("click", comecarDoLobby);

// Voltar do lobby para a tela inicial
document.getElementById("btn-voltar-lobby").addEventListener("click", () => {
  mostrarTela("tela-inicial");
});

// Avançar rodada
document.getElementById("btn-proxima").addEventListener("click", proximaFase);

// Recomeçar (volta ao lobby para reconfigurar)
document.getElementById("btn-recomecar").addEventListener("click", () => {
  estado = null;
  mostrarTela("tela-lobby");
  renderLobby();
});

// Botões de atributo (só funcionam quando um humano está escolhendo)
document.querySelectorAll(".btn-attr").forEach(btn => {
  btn.addEventListener("click", () => {
    const quem = estado && escolhedorVigente(estado);
    if (estado && estado.jogadores[quem] && estado.jogadores[quem].tipo === "humano") {
      aplicarEscolha(btn.dataset.attr);
    }
  });
});
