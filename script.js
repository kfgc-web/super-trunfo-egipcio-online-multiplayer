/* ============================================================
   SUPER TRUNFO EGÍPCIO — CONTROLE + TELA (Fase 3a)
   ============================================================
   O MOTOR (regras) está em motor.js. A REDE (Firebase) está em
   rede.js. Aqui ficam: o jogo local contra bots, a renderização
   da partida, o lobby local e o fluxo de sala ONLINE (criar sala,
   entrar por link, presença). A partida online sincronizada entra
   na Fase 3b.
   ============================================================ */

// ====== Estado da partida local ======
let estado = null;
let travado = false;

const ESPERA_BOT = 1100;
const ESPERA_RANK = 900;

function mostrarTela(idTela) {
  document.querySelectorAll(".tela").forEach(t => t.classList.remove("ativa"));
  document.getElementById(idTela).classList.add("ativa");
}


/* ============================================================
   JOGO LOCAL (contra bots) — usa o motor de motor.js
   ============================================================ */

function iniciarPartida(configJogadores) {
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

  renderFaseEscolha();
  if (jog.tipo === "bot") {
    setTimeout(() => {
      if (!estado) return;
      const attr = botEscolheAtributo(estado, quem);
      aplicarEscolha(attr);
    }, ESPERA_BOT);
  }
}

function aplicarEscolha(atributo) {
  if (travado) return;
  travado = true;
  resolverComparacao(estado, atributo);
  renderRevelacao();
}


/* ============================================================
   RENDERIZAÇÃO DA PARTIDA
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
// (Na fase online, isto vira simplesmente "o dono deste aparelho".)
function humanoDeReferencia(estado) {
  const part = participantesAtuais(estado);
  const humanos = part.filter(id => estado.jogadores[id].tipo === "humano" && !estado.jogadores[id].eliminado);
  return humanos.length ? Math.min(...humanos) : null;
}

// Fase de escolha (humano OU bot). Cada jogador SEMPRE vê a própria carta;
// as dos outros ficam viradas até a revelação.
function renderFaseEscolha() {
  const escolhe = escolhedorVigente(estado);
  const ehBot = estado.jogadores[escolhe].tipo === "bot";
  const local = ehBot ? humanoDeReferencia(estado) : escolhe;
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
   LOBBY LOCAL (contra bots) — assento 1 é você
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
   FLUXO ONLINE (Fase 3a): criar sala, entrar por link, presença
   ============================================================ */

let modoEntrar = "host";     // "host" | "guest"
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
    if (modoEntrar === "host") {
      await REDE.criarSala(nome);
    } else {
      await REDE.entrarSala(codigoEntrar, nome);
    }
    abrirSala();
  } catch (e) {
    // Provável: offline (Firebase não baixou) ou erro de sala
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

  // O bloco de convite faz mais sentido para o host (quem divulga)
  document.getElementById("convite").style.display = REDE.souHost ? "block" : "none";

  REDE.escutarAssentos(renderSalaAssentos);
  REDE.escutarStatus(onStatusSala);
}

function renderSalaAssentos(lista) {
  const cont = document.getElementById("sala-assentos");
  const souHost = REDE.souHost;
  const meu = REDE.meuAssento;

  const html = lista.map((a, i) => {
    const ehMeu = i === meu;
    let conteudo;

    if (souHost && i !== 0) {
      // Host configura assentos 1-3 (humano/bot/vazia). Se humano ocupado, mostra quem.
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
      // Visão de leitura (host no assento 0, ou convidado em qualquer assento)
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

  // Liga os botões de configuração (somente host)
  cont.querySelectorAll(".op-assento").forEach(btn => {
    btn.addEventListener("click", () => {
      REDE.configurarAssento(Number(btn.dataset.assento), btn.dataset.op);
    });
  });

  // Mensagem de status do lobby
  const status = document.getElementById("sala-status");
  if (souHost) {
    const humanosAbertos = lista.filter((a, i) => i !== 0 && a.tipo === "humano" && !a.uid).length;
    const humanosDentro = lista.filter((a, i) => i !== 0 && a.tipo === "humano" && a.uid).length;
    status.textContent = `Compartilhe o link. ${humanosDentro} jogador(es) na sala, ${humanosAbertos} vaga(s) aberta(s). ` +
      `(O início da partida em rede entra na próxima etapa.)`;
  } else {
    status.textContent = "Você entrou! Aguardando o anfitrião iniciar a partida.";
  }
}

function onStatusSala(status) {
  if (status === "encerrada") {
    REDE.sair();
    alert("A sala foi encerrada pelo anfitrião.");
    mostrarTela("tela-inicial");
  }
  // status === "jogando" será tratado na Fase 3b (início da partida sincronizada)
}

function sairDaSala() {
  if (REDE.souHost) {
    REDE.encerrar();
  } else {
    REDE.sair();
  }
  mostrarTela("tela-inicial");
}

function copiarLink() {
  const campo = document.getElementById("convite-link");
  const btn = document.getElementById("btn-copiar");
  const texto = campo.value;
  const feedback = () => { btn.textContent = "Copiado!"; setTimeout(() => btn.textContent = "Copiar", 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(feedback).catch(() => { campo.select(); document.execCommand("copy"); feedback(); });
  } else {
    campo.select(); document.execCommand("copy"); feedback();
  }
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
   LIGAÇÕES DE TELA E INÍCIO
   ============================================================ */

// Tela inicial
document.getElementById("btn-criar-sala").addEventListener("click", abrirCriarSala);
document.getElementById("btn-jogar-bots").addEventListener("click", () => {
  mostrarTela("tela-lobby");
  renderLobby();
});

// Tela de nome (criar/entrar)
document.getElementById("btn-entrar-confirmar").addEventListener("click", confirmarEntrar);
document.getElementById("btn-entrar-voltar").addEventListener("click", () => mostrarTela("tela-inicial"));
document.getElementById("input-nome").addEventListener("keydown", e => { if (e.key === "Enter") confirmarEntrar(); });

// Tela de sala online
document.getElementById("btn-sala-sair").addEventListener("click", sairDaSala);
document.getElementById("btn-copiar").addEventListener("click", copiarLink);

// Lobby local (contra bots)
document.getElementById("btn-comecar").addEventListener("click", comecarDoLobby);
document.getElementById("btn-voltar-lobby").addEventListener("click", () => mostrarTela("tela-inicial"));

// Partida
document.getElementById("btn-proxima").addEventListener("click", proximaFase);
document.getElementById("btn-recomecar").addEventListener("click", () => mostrarTela("tela-inicial"));

document.querySelectorAll(".btn-attr").forEach(btn => {
  btn.addEventListener("click", () => {
    const quem = estado && escolhedorVigente(estado);
    if (estado && estado.jogadores[quem] && estado.jogadores[quem].tipo === "humano") {
      aplicarEscolha(btn.dataset.attr);
    }
  });
});

// Se a URL trouxe um ?sala=CÓDIGO, vai direto para entrar na sala.
(function detectarConvite() {
  const codigo = REDE.codigoNaURL();
  if (codigo) abrirEntrarSala(codigo);
})();
