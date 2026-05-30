/* ============================================================
   SUPER TRUNFO EGÍPCIO — CONTROLE + TELA (Fase 3b)
   ============================================================
   MOTOR (regras) -> motor.js | REDE (Firebase) -> rede.js
   Aqui: jogo local contra bots, renderização, lobby local,
   sala online (3a) e a PARTIDA ONLINE sincronizada (3b).

   Modelo online: o HOST roda o motor e é a fonte da verdade.
   Ele publica o estado; os clientes leem e renderizam, e enviam
   apenas sua jogada na própria vez.
   ============================================================ */

// ====== Estado da partida (serve para local E online) ======
let estado = null;
let travado = false;

// ====== Controle do modo online ======
let modoOnline = false;       // partida online em andamento?
let souHostJogo = false;      // sou eu quem roda o motor?
let meuIdMotor = null;        // meu índice de jogador dentro do motor
let ultimaListaAssentos = null;

const ESPERA_BOT = 1100;
const ESPERA_RANK = 900;

function mostrarTela(idTela) {
  document.querySelectorAll(".tela").forEach(t => t.classList.remove("ativa"));
  document.getElementById(idTela).classList.add("ativa");
}


/* ============================================================
   RENDERIZAÇÃO (parametrizada por perspectiva)
   ============================================================
   "perspectiva" = índice do jogador que é VOCÊ nesta tela. A sua
   carta aparece; as dos outros ficam viradas até a revelação.
   ============================================================ */

function htmlCartaCompleta(carta) {
  return `
    <img src="${carta.imagem}" alt="${carta.nome}" />
    <div class="carta-nome">
      ${carta.nome}
      ${carta.superTrunfo ? '<span class="super-trunfo-tag">★ SUPER TRUNFO ★</span>' : ""}
    </div>`;
}

function htmlCartaVerso() {
  return `<div class="carta-verso">𓂀</div>`;
}

function renderPlacar() {
  const escolhe = escolhedorVigente(estado);
  const emDesempate = estado.desempate ? new Set(estado.desempate.participantes) : new Set();

  const blocosJog = estado.jogadores.map(j => {
    const selos = [];
    if (!estado.fimDeJogo && j.id === escolhe && !j.eliminado) selos.push("👑");
    if (estado.desempate && emDesempate.has(j.id)) selos.push("⚔️");
    if (j.tipo === "bot") selos.push("🤖");
    if (j.eliminado) selos.push("💀");
    const ehMeu = modoOnline && j.id === meuIdMotor;
    return `
      <div class="bloco-placar ${j.eliminado ? "eliminado" : ""} ${ehMeu ? "meu-placar" : ""}" style="--cor:${j.cor}">
        <span class="rotulo">${j.nome}${ehMeu ? " (você)" : ""} ${selos.join("")}</span>
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

// Local: 1º humano vivo entre os participantes (para o caso de bot escolhendo).
function humanoDeReferencia(estado) {
  const part = participantesAtuais(estado);
  const humanos = part.filter(id => estado.jogadores[id].tipo === "humano" && !estado.jogadores[id].eliminado);
  return humanos.length ? Math.min(...humanos) : null;
}

// Fase de escolha. perspectiva = quem vê a própria carta; podeEscolher = mostra botões.
function renderFaseEscolha(perspectiva, podeEscolher) {
  const escolhe = escolhedorVigente(estado);
  const part = participantesAtuais(estado);

  const cartasHTML = part.map(id => {
    const j = estado.jogadores[id];
    const ehLocal = id === perspectiva;
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

  if (podeEscolher) {
    const carta = estado.jogadores[escolhe].mao[0];
    document.querySelectorAll(".btn-attr").forEach(btn => {
      const a = btn.dataset.attr;
      btn.querySelector(".valor-attr").textContent = carta[a];
      btn.disabled = false;
    });
    mostrarAtributos(true);
    msg.textContent = estado.desempate
      ? `Empate! Sua vez: escolha o atributo do desempate.`
      : `Sua vez, ${estado.jogadores[escolhe].nome}: escolha um atributo.`;
  } else {
    mostrarAtributos(false);
    const nome = estado.jogadores[escolhe].nome;
    msg.textContent = estado.desempate
      ? `${nome} está escolhendo o desempate…`
      : `${nome} está escolhendo…`;
  }

  document.getElementById("btn-proxima").style.display = "none";
}

function renderEsperaRank() {
  mostrarAtributos(false);
  document.getElementById("mesa").innerHTML =
    `<div class="mesa-grid"><p class="aviso-rank">Alguém ficou sem cartas — desempate pelo rank da carta…</p></div>`;
  const msg = document.getElementById("mensagem");
  msg.className = "empate";
  msg.textContent = "Resolvendo o desempate…";
  document.getElementById("btn-proxima").style.display = "none";
}

function renderRevelacao() {
  renderPlacar();
  mostrarAtributos(false);

  const ev = estado.ultimoEvento;
  const cartasPorJog = ev.tipo === "rank" ? ev.cartasEmpatadas : estado.mesa;
  const idsMostrar = ev.tipo === "rank" ? Object.keys(cartasPorJog).map(Number) : ev.participantes;

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

  const btn = document.getElementById("btn-proxima");
  btn.textContent = estado.fimDeJogo ? "Ver resultado" : "Próxima rodada";
  btn.style.display = "inline-block";
}

function mostrarAtributos(mostrar) {
  document.getElementById("botoes-atributos").style.display = mostrar ? "grid" : "none";
}

function esconderProxima() {
  document.getElementById("btn-proxima").style.display = "none";
}

function mostrarFim() {
  const venc = estado.vencedor;
  let titulo, resumo;
  const souEuVencedor = modoOnline && venc !== null && estado.jogadores[venc].assento === REDE.meuAssento;

  if (venc === null) {
    titulo = "Empate técnico";
    resumo = "Ninguém sobrou com cartas. Resultado raríssimo.";
  } else if (souEuVencedor) {
    titulo = "🏆 Você venceu!";
    resumo = "Você dominou o baralho. Os deuses escolheram seu campeão.";
  } else if (estado.jogadores[venc].tipo === "humano") {
    titulo = "🏆 " + estado.jogadores[venc].nome + " venceu!";
    resumo = `${estado.jogadores[venc].nome} dominou o baralho.`;
  } else {
    titulo = "💀 " + estado.jogadores[venc].nome + " venceu";
    resumo = `${estado.jogadores[venc].nome} ficou com todas as cartas. Tente de novo.`;
  }
  document.getElementById("resultado-final").textContent = titulo;
  document.getElementById("resumo-final").textContent = resumo;
  mostrarTela("tela-fim");
}


/* ============================================================
   JOGO LOCAL (contra bots)
   ============================================================ */

function iniciarPartida(configJogadores) {
  modoOnline = false; souHostJogo = false; meuIdMotor = null;
  estado = criarPartida(configJogadores);
  mostrarTela("tela-jogo");
  proximaFase();
}

function proximaFase() {
  travado = false;
  estado.mesa = {};
  renderPlacar();

  if (estado.fimDeJogo) return mostrarFim();

  if (precisaResolverPorRank(estado)) {
    renderEsperaRank();
    setTimeout(() => { resolverPorRank(estado); renderRevelacao(); }, ESPERA_RANK);
    return;
  }

  const quem = escolhedorVigente(estado);
  const jog = estado.jogadores[quem];

  if (jog.tipo === "bot") {
    renderFaseEscolha(humanoDeReferencia(estado), false);
    setTimeout(() => {
      if (!estado) return;
      aplicarEscolha(botEscolheAtributo(estado, quem));
    }, ESPERA_BOT);
  } else {
    renderFaseEscolha(quem, true);
  }
}

function aplicarEscolha(atributo) {
  if (travado) return;
  travado = true;
  resolverComparacao(estado, atributo);
  renderRevelacao();
}


/* ============================================================
   LOBBY LOCAL (contra bots)
   ============================================================ */

let configAssentos = ["humano", "bot", "vazia", "vazia"];

function renderLobby() {
  const cont = document.getElementById("assentos");
  const html = configAssentos.map((tipo, i) => {
    const fixo = i === 0;
    const nomeBase = i === 0 ? "Você" : `Assento ${i + 1}`;
    const opcoes = fixo
      ? `<div class="assento-fixo">VOCÊ</div>`
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

  cont.querySelectorAll(".op-assento").forEach(btn => {
    btn.addEventListener("click", () => {
      configAssentos[Number(btn.dataset.assento)] = btn.dataset.op;
      renderLobby();
    });
  });
  atualizarBotaoComecar();
}

function atualizarBotaoComecar() {
  const btn = document.getElementById("btn-comecar");
  const n = configAssentos.filter(t => t !== "vazia").length;
  const aviso = document.getElementById("aviso-lobby");
  if (n < 2) {
    btn.disabled = true;
    aviso.textContent = "Selecione pelo menos 2 participantes (você + 1).";
  } else {
    btn.disabled = false;
    aviso.textContent = `${n} participantes nesta partida.`;
  }
}

function comecarDoLobby() {
  const config = [];
  configAssentos.forEach((tipo, i) => {
    if (tipo === "vazia") return;
    if (i === 0) config.push({ nome: "Você", tipo: "humano" });
    else if (tipo === "humano") config.push({ nome: `Jogador ${i + 1}`, tipo: "humano" });
    else config.push({ nome: `Bot ${i + 1}`, tipo: "bot" });
  });
  iniciarPartida(config);
}


/* ============================================================
   SALA ONLINE (Fase 3a): criar, entrar, presença
   ============================================================ */

let modoEntrar = "host";
let codigoEntrar = null;

function abrirCriarSala() {
  modoEntrar = "host";
  document.getElementById("entrar-titulo").textContent = "Criar sala";
  document.getElementById("entrar-sub").textContent = "Escolha como quer ser chamado.";
  document.getElementById("entrar-erro").textContent = "";
  document.getElementById("input-nome").value = "";
  mostrarTela("tela-entrar");
}

function abrirEntrarSala(codigo) {
  modoEntrar = "guest";
  codigoEntrar = codigo;
  document.getElementById("entrar-titulo").textContent = "Entrar na sala " + codigo;
  document.getElementById("entrar-sub").textContent = "Escolha um nome para a partida.";
  document.getElementById("entrar-erro").textContent = "";
  document.getElementById("input-nome").value = "";
  mostrarTela("tela-entrar");
}

async function confirmarEntrar() {
  const nome = (document.getElementById("input-nome").value || "").trim();
  const erro = document.getElementById("entrar-erro");
  const btn = document.getElementById("btn-entrar-confirmar");

  if (nome.length < 1) { erro.textContent = "Digite um nome."; return; }

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Conectando…";
  erro.textContent = "";

  try {
    if (modoEntrar === "host") await REDE.criarSala(nome);
    else await REDE.entrarSala(codigoEntrar, nome);
    abrirSala();
  } catch (e) {
    const offline = /carregar|network|fetch|offline/i.test(e.message || "");
    erro.textContent = offline
      ? "Sem internet para o modo online. Você ainda pode jogar contra bots."
      : (e.message || "Não foi possível conectar.");
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function abrirSala() {
  mostrarTela("tela-sala");
  const codigo = REDE.salaAtual;
  document.getElementById("convite-link").value = REDE.linkConvite(codigo);
  document.getElementById("convite-codigo").textContent = codigo;
  document.getElementById("convite").style.display = REDE.souHost ? "block" : "none";

  REDE.escutarAssentos(renderSalaAssentos);
  REDE.escutarStatus(onStatusSala);
}

function renderSalaAssentos(lista) {
  ultimaListaAssentos = lista;
  const cont = document.getElementById("sala-assentos");
  const souHost = REDE.souHost;
  const meu = REDE.meuAssento;

  const html = lista.map((a, i) => {
    const ehMeu = i === meu;
    let conteudo;

    if (souHost && i !== 0) {
      if (a.tipo === "humano" && a.uid) {
        const status = a.online ? "🟢 online" : "🔴 caiu";
        conteudo = `<div class="assento-ocupado">👤 ${a.nome || "Jogador"}<br><span class="mini">${status}</span></div>`;
      } else {
        conteudo = ["humano", "bot", "vazia"].map(op => {
          const rotulo = { humano: "👤 Humano", bot: "🤖 Bot", vazia: "🚫 Vazia" }[op];
          const sel = a.tipo === op ? "sel" : "";
          return `<button class="op-assento ${sel}" data-assento="${i}" data-op="${op}">${rotulo}</button>`;
        }).join("");
      }
    } else {
      let txt;
      if (i === 0) txt = `👑 ${a.nome || "Anfitrião"}`;
      else if (a.tipo === "bot") txt = "🤖 Bot";
      else if (a.tipo === "humano" && a.uid) txt = `👤 ${a.nome || "Jogador"}${a.online ? "" : " (caiu)"}`;
      else if (a.tipo === "humano") txt = "👤 vaga aberta";
      else txt = "🚫 vazia";
      conteudo = `<div class="assento-ocupado">${txt}${ehMeu ? '<br><span class="mini">você</span>' : ""}</div>`;
    }

    const nomeBase = i === 0 ? "Anfitrião" : `Assento ${i + 1}`;
    return `
      <div class="assento ${ehMeu ? "meu" : ""}" style="--cor:${CORES[i]}">
        <div class="assento-titulo">${nomeBase}</div>
        <div class="assento-ops">${conteudo}</div>
      </div>`;
  }).join("");

  cont.innerHTML = html;

  cont.querySelectorAll(".op-assento").forEach(btn => {
    btn.addEventListener("click", () => {
      REDE.configurarAssento(Number(btn.dataset.assento), btn.dataset.op);
    });
  });

  const status = document.getElementById("sala-status");
  const btnComecar = document.getElementById("btn-sala-comecar");
  if (souHost) {
    const ativos = lista.filter(a => a.tipo !== "vazia").length;
    btnComecar.style.display = "inline-block";
    btnComecar.disabled = ativos < 2;
    status.textContent = ativos < 2
      ? "Configure ao menos 2 participantes para começar."
      : `${ativos} participantes. Vagas humanas não ocupadas viram bots ao começar.`;
  } else {
    btnComecar.style.display = "none";
    status.textContent = "Você entrou! Aguardando o anfitrião iniciar a partida.";
  }
}

function onStatusSala(status) {
  if (status === "encerrada") {
    if (!REDE.souHost) {
      REDE.sair();
      alert("A sala foi encerrada pelo anfitrião.");
      mostrarTela("tela-inicial");
    }
    return;
  }
  if (status === "jogando" && !REDE.souHost && !modoOnline) {
    entrarModoJogoCliente();
  }
}

function sairDaSala() {
  if (REDE.souHost) REDE.encerrar();
  else REDE.sair();
  modoOnline = false; souHostJogo = false; estado = null; meuIdMotor = null;
  mostrarTela("tela-inicial");
}

function copiarLink() {
  const campo = document.getElementById("convite-link");
  const btn = document.getElementById("btn-copiar");
  const feedback = () => { btn.textContent = "Copiado!"; setTimeout(() => btn.textContent = "Copiar", 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(campo.value).then(feedback).catch(() => { campo.select(); document.execCommand("copy"); feedback(); });
  } else {
    campo.select(); document.execCommand("copy"); feedback();
  }
}


/* ============================================================
   PARTIDA ONLINE (Fase 3b)
   ============================================================ */

// --- HOST: monta os jogadores a partir dos assentos e inicia ---
function comecarPartidaOnline() {
  const lista = ultimaListaAssentos;
  if (!lista) return;

  const config = [];
  lista.forEach((a, i) => {
    if (i === 0) config.push({ nome: a.nome || "Anfitrião", tipo: "humano", _assento: 0 });
    else if (a.tipo === "bot") config.push({ nome: "Bot " + (i + 1), tipo: "bot", _assento: i });
    else if (a.tipo === "humano" && a.uid) config.push({ nome: a.nome || ("Jogador " + (i + 1)), tipo: "humano", _assento: i });
    else if (a.tipo === "humano") config.push({ nome: "Bot " + (i + 1), tipo: "bot", _assento: i }); // vaga não ocupada vira bot
    // "vazia": ignorado
  });
  if (config.length < 2) { alert("Configure pelo menos 2 participantes."); return; }

  estado = criarPartida(config.map(c => ({ nome: c.nome, tipo: c.tipo })));
  estado.jogadores.forEach((j, idx) => {
    j.assento = config[idx]._assento;   // amarra o id do motor ao assento da sala
    j.cor = CORES[j.assento];
  });
  estado.fase = "escolha";

  modoOnline = true;
  souHostJogo = true;
  meuIdMotor = estado.jogadores.findIndex(j => j.assento === 0);

  mostrarTela("tela-jogo");
  REDE.escutarAcoes(onAcoesRecebidas);
  REDE.iniciarJogo();
  avancarHost();
}

// --- HOST: motor da partida; decide o próximo passo e publica o estado ---
function avancarHost() {
  if (!souHostJogo || !estado) return;

  renderPlacar();
  REDE.publicarEstado(estado);   // entrega o estado aos clientes

  if (estado.fimDeJogo) { mostrarFim(); return; }

  if (estado.fase === "revelacao") {
    renderRevelacao();           // host vê "Próxima rodada"; clientes aguardam
    return;
  }

  // fase de escolha
  if (precisaResolverPorRank(estado)) {
    renderEsperaRank();
    setTimeout(() => {
      if (!souHostJogo) return;
      resolverPorRank(estado);
      estado.fase = "revelacao";
      avancarHost();
    }, ESPERA_RANK);
    return;
  }

  const escolhe = escolhedorVigente(estado);
  const jog = estado.jogadores[escolhe];
  const souEu = jog.tipo === "humano" && escolhe === meuIdMotor;
  renderFaseEscolha(meuIdMotor, souEu);

  if (jog.tipo === "bot") {
    setTimeout(() => {
      if (!souHostJogo) return;
      resolverComparacao(estado, botEscolheAtributo(estado, escolhe));
      estado.fase = "revelacao";
      avancarHost();
    }, ESPERA_BOT);
  }
  // humano (host): espera o clique local. humano (cliente): espera a ação remota.
}

// --- HOST: aplica uma escolha (própria ou recebida de um cliente) ---
function aplicarEscolhaOnline(atributo) {
  if (!souHostJogo || !estado || estado.fase !== "escolha") return;
  if (precisaResolverPorRank(estado)) return;
  resolverComparacao(estado, atributo);
  estado.fase = "revelacao";
  avancarHost();
}

// --- HOST: avança da revelação para a próxima rodada (todos avançam juntos) ---
function proximaOnline() {
  if (!souHostJogo || !estado) return;
  estado.mesa = {};
  estado.fase = "escolha";
  avancarHost();
}

// --- HOST: processa as ações recebidas dos clientes ---
function onAcoesRecebidas(acoes) {
  if (!souHostJogo || !estado || estado.fase !== "escolha") { REDE.limparAcoes(); return; }
  const escolhe = escolhedorVigente(estado);
  const jog = estado.jogadores[escolhe];
  const ac = acoes[jog.assento];   // só interessa a ação de quem é a vez
  REDE.limparAcoes();
  if (jog.tipo === "humano" && jog.assento !== 0 && ac && ATRIBUTOS.includes(ac.atributo)) {
    aplicarEscolhaOnline(ac.atributo);
  }
}

// --- CLIENTE: entra no modo jogo e passa a escutar o estado ---
function entrarModoJogoCliente() {
  modoOnline = true;
  souHostJogo = false;
  meuIdMotor = null;
  mostrarTela("tela-jogo");
  REDE.escutarEstado(onEstadoRecebido);
}

// --- CLIENTE: recebe um novo estado e renderiza pela sua perspectiva ---
function onEstadoRecebido(estadoObj) {
  estado = estadoObj;
  if (meuIdMotor === null) {
    const meu = estado.jogadores.find(j => j.assento === REDE.meuAssento);
    meuIdMotor = meu ? meu.id : null;
  }
  renderPlacar();

  if (estado.fimDeJogo) { mostrarFim(); return; }

  if (estado.fase === "revelacao") {
    renderRevelacao();
    esconderProxima();   // só o host controla o avanço
    const msg = document.getElementById("mensagem");
    msg.innerHTML += ' <span class="mini-espera">— aguardando o anfitrião…</span>';
    return;
  }

  // fase de escolha
  const escolhe = escolhedorVigente(estado);
  const souEscolhedor = escolhe === meuIdMotor &&
                        meuIdMotor !== null &&
                        estado.jogadores[meuIdMotor].tipo === "humano";
  renderFaseEscolha(meuIdMotor, souEscolhedor);
}


/* ============================================================
   MÚSICA DE FUNDO (começa DESLIGADA)
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
   LIGAÇÕES DE TELA E ROTEAMENTO DOS BOTÕES
   ============================================================ */

// Tela inicial
document.getElementById("btn-criar-sala").addEventListener("click", abrirCriarSala);
document.getElementById("btn-jogar-bots").addEventListener("click", () => {
  mostrarTela("tela-lobby");
  renderLobby();
});

// Tela de nome
document.getElementById("btn-entrar-confirmar").addEventListener("click", confirmarEntrar);
document.getElementById("btn-entrar-voltar").addEventListener("click", () => mostrarTela("tela-inicial"));
document.getElementById("input-nome").addEventListener("keydown", e => { if (e.key === "Enter") confirmarEntrar(); });

// Tela de sala online
document.getElementById("btn-sala-sair").addEventListener("click", sairDaSala);
document.getElementById("btn-sala-comecar").addEventListener("click", comecarPartidaOnline);
document.getElementById("btn-copiar").addEventListener("click", copiarLink);

// Lobby local
document.getElementById("btn-comecar").addEventListener("click", comecarDoLobby);
document.getElementById("btn-voltar-lobby").addEventListener("click", () => mostrarTela("tela-inicial"));

// Botão "Próxima rodada": local avança sozinho; online só o host avança para todos
document.getElementById("btn-proxima").addEventListener("click", () => {
  if (!modoOnline) proximaFase();
  else if (souHostJogo) proximaOnline();
});

// Fim de jogo
document.getElementById("btn-recomecar").addEventListener("click", () => {
  if (modoOnline) {
    if (REDE.souHost) REDE.encerrar(); else REDE.sair();
    modoOnline = false; souHostJogo = false; estado = null; meuIdMotor = null;
  }
  mostrarTela("tela-inicial");
});

// Botões de atributo: roteia conforme o modo (local / host / cliente)
document.querySelectorAll(".btn-attr").forEach(btn => {
  btn.addEventListener("click", () => {
    const attr = btn.dataset.attr;
    if (!estado) return;
    const escolhe = escolhedorVigente(estado);

    if (!modoOnline) {
      if (estado.jogadores[escolhe] && estado.jogadores[escolhe].tipo === "humano") aplicarEscolha(attr);
    } else if (souHostJogo) {
      if (escolhe === meuIdMotor && estado.fase === "escolha") aplicarEscolhaOnline(attr);
    } else {
      if (escolhe === meuIdMotor && estado.fase === "escolha") REDE.enviarAcao(REDE.meuAssento, attr);
    }
  });
});

// ?sala=CÓDIGO na URL -> entrar direto
(function detectarConvite() {
  const codigo = REDE.codigoNaURL();
  if (codigo) abrirEntrarSala(codigo);
})();
