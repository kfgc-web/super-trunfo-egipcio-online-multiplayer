/* ============================================================
   SUPER TRUNFO EGÍPCIO — CAMADA DE REDE (Fase 3a)
   ============================================================
   Responsável por: carregar o Firebase sob demanda, autenticar
   o jogador de forma anônima (crachá invisível), criar/entrar
   em salas e acompanhar quem está presente.

   PRINCÍPIO: o Firebase só é baixado quando o jogador escolhe
   jogar ONLINE. O modo offline (contra bots) nunca toca aqui,
   então o jogo continua abrindo e funcionando sem internet.

   Tudo é exposto no objeto global window.REDE (ver final).
   ============================================================ */

(function () {
  // ---- Configuração do projeto Firebase (a apiKey NÃO é secreta) ----
  const firebaseConfig = {
    apiKey: "AIzaSyDhUA00Hcts4aAu4EkYk67fteA6OnFSK_0",
    authDomain: "trunfo-egipcio-online.firebaseapp.com",
    databaseURL: "https://trunfo-egipcio-online-default-rtdb.firebaseio.com",
    projectId: "trunfo-egipcio-online",
    storageBucket: "trunfo-egipcio-online.firebasestorage.app",
    messagingSenderId: "232616609167",
    appId: "1:232616609167:web:acac541453abbbc1b977fa"
  };

  const FB_VERSAO = "12.11.0";
  const FB_BASE = "https://www.gstatic.com/firebasejs/" + FB_VERSAO + "/";

  // Estado interno da camada de rede
  let pronto = false;       // Firebase carregado e inicializado?
  let uid = null;           // id anônimo deste aparelho
  let db = null;            // referência ao banco
  let salaAtual = null;     // código da sala em que estou
  let souHost = false;
  let meuAssento = null;    // índice do assento que ocupo (0 = host)
  const listeners = [];     // refs que estou escutando (para desligar ao sair)

  // ---- Carrega um <script> externo, resolvendo quando pronto ----
  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  // ---- Carrega o SDK do Firebase sob demanda (app + auth + database) ----
  async function carregarFirebase() {
    if (typeof firebase !== "undefined" && firebase.apps) return true;
    await carregarScript(FB_BASE + "firebase-app-compat.js");
    await carregarScript(FB_BASE + "firebase-auth-compat.js");
    await carregarScript(FB_BASE + "firebase-database-compat.js");
    return true;
  }

  // ---- Inicializa o Firebase e faz login anônimo. Retorna o uid. ----
  async function init() {
    if (pronto) return uid;
    await carregarFirebase();                 // pode lançar se estiver offline
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    const cred = await firebase.auth().signInAnonymously();
    uid = cred.user.uid;
    pronto = true;
    return uid;
  }

  // ---- Gera um código de sala curto e sem caracteres ambíguos ----
  function gerarCodigo() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I,O,0,1
    let c = "";
    for (let i = 0; i < 5; i++) c += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    return c;
  }

  // ---- HOST cria uma sala nova. Retorna o código. ----
  async function criarSala(nomeHost) {
    await init();
    // Tenta um código livre (raríssimo colidir, mas confirmamos)
    let codigo;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      codigo = gerarCodigo();
      const snap = await db.ref("salas/" + codigo + "/meta").get();
      if (!snap.exists()) break;
    }

    const agora = firebase.database.ServerValue.TIMESTAMP;
    const dados = {
      meta: { host: uid, status: "lobby", criadaEm: agora },
      assentos: {
        0: { tipo: "humano", uid: uid, nome: nomeHost || "Anfitrião", online: true },
        1: { tipo: "vazia", uid: null, nome: null, online: false },
        2: { tipo: "vazia", uid: null, nome: null, online: false },
        3: { tipo: "vazia", uid: null, nome: null, online: false }
      }
    };
    await db.ref("salas/" + codigo).set(dados);

    salaAtual = codigo;
    souHost = true;
    meuAssento = 0;

    // Se o host cair, a sala é encerrada e a presença dele cai.
    db.ref("salas/" + codigo + "/meta/status").onDisconnect().set("encerrada");
    db.ref("salas/" + codigo + "/assentos/0/online").onDisconnect().set(false);

    return codigo;
  }

  // ---- HOST define o tipo de um assento (humano / bot / vazia) ----
  async function configurarAssento(i, tipo) {
    if (!souHost || !salaAtual || i === 0) return;
    const ref = db.ref("salas/" + salaAtual + "/assentos/" + i);
    // Ao trocar o tipo, limpa ocupante (a menos que continue humano já ocupado)
    if (tipo === "humano") {
      const snap = await ref.get();
      const atual = snap.val() || {};
      if (atual.tipo === "humano" && atual.uid) return; // já ocupado, não mexe
      await ref.set({ tipo: "humano", uid: null, nome: null, online: false });
    } else if (tipo === "bot") {
      await ref.set({ tipo: "bot", uid: null, nome: "Bot " + (i + 1), online: true });
    } else {
      await ref.set({ tipo: "vazia", uid: null, nome: null, online: false });
    }
  }

  // ---- CLIENTE entra numa sala pelo código. Ocupa o 1º assento humano livre. ----
  // Retorna { assento } ou lança Error com mensagem amigável.
  async function entrarSala(codigo, nome) {
    await init();
    codigo = (codigo || "").toUpperCase().trim();

    const metaSnap = await db.ref("salas/" + codigo + "/meta").get();
    if (!metaSnap.exists()) throw new Error("Sala não encontrada. Confira o link.");
    const meta = metaSnap.val();
    if (meta.status === "encerrada") throw new Error("Esta sala foi encerrada pelo anfitrião.");
    if (meta.status === "jogando") throw new Error("A partida já começou; não dá para entrar agora.");

    // Procura assentos humanos livres
    const assSnap = await db.ref("salas/" + codigo + "/assentos").get();
    const assentos = assSnap.val() || {};
    const livres = [];
    for (let i = 1; i <= 3; i++) {
      const a = assentos[i];
      if (a && a.tipo === "humano" && !a.uid) livres.push(i);
    }
    if (!livres.length) throw new Error("Não há vagas livres nesta sala.");

    // Ocupa o primeiro livre de forma atômica (evita dois entrarem no mesmo)
    let ocupado = null;
    for (const i of livres) {
      const ref = db.ref("salas/" + codigo + "/assentos/" + i);
      const res = await ref.transaction(atual => {
        if (atual && atual.tipo === "humano" && !atual.uid) {
          return { tipo: "humano", uid: uid, nome: nome || ("Jogador " + (i + 1)), online: true };
        }
        return; // aborta: alguém pegou primeiro
      });
      if (res.committed && res.snapshot.val() && res.snapshot.val().uid === uid) {
        ocupado = i;
        break;
      }
    }
    if (ocupado === null) throw new Error("As vagas acabaram de ser preenchidas. Tente outra sala.");

    salaAtual = codigo;
    souHost = false;
    meuAssento = ocupado;

    // Se eu cair, meu assento volta a ficar livre para outro entrar.
    db.ref("salas/" + codigo + "/assentos/" + ocupado).onDisconnect()
      .set({ tipo: "humano", uid: null, nome: null, online: false });

    return { assento: ocupado };
  }

  // ---- Escuta a lista de assentos (presença) em tempo real ----
  function escutarAssentos(cb) {
    if (!salaAtual) return;
    const ref = db.ref("salas/" + salaAtual + "/assentos");
    const fn = ref.on("value", snap => {
      const v = snap.val() || {};
      const lista = [];
      for (let i = 0; i <= 3; i++) lista.push(v[i] || { tipo: "vazia", uid: null, nome: null, online: false });
      cb(lista);
    });
    listeners.push({ ref, evento: "value", fn });
  }

  // ---- Escuta o status da sala (lobby / jogando / encerrada) ----
  function escutarStatus(cb) {
    if (!salaAtual) return;
    const ref = db.ref("salas/" + salaAtual + "/meta/status");
    const fn = ref.on("value", snap => cb(snap.val()));
    listeners.push({ ref, evento: "value", fn });
  }

  // ---- HOST encerra a sala manualmente ----
  async function encerrar() {
    if (!salaAtual) return;
    if (souHost) await db.ref("salas/" + salaAtual + "/meta/status").set("encerrada");
    sair();
  }

  // ---- Desliga listeners e limpa o estado local (sem apagar a sala) ----
  function sair() {
    listeners.forEach(l => l.ref.off(l.evento, l.fn));
    listeners.length = 0;
    salaAtual = null;
    souHost = false;
    meuAssento = null;
  }

  // ---- Monta o link de convite a partir do código ----
  function linkConvite(codigo) {
    const base = location.origin + location.pathname;
    return base + "?sala=" + codigo;
  }

  // ---- Lê o parâmetro ?sala= da URL (entrada por convite) ----
  function codigoNaURL() {
    const p = new URLSearchParams(location.search);
    const c = p.get("sala");
    return c ? c.toUpperCase().trim() : null;
  }

  window.REDE = {
    init,
    criarSala,
    configurarAssento,
    entrarSala,
    escutarAssentos,
    escutarStatus,
    encerrar,
    sair,
    linkConvite,
    codigoNaURL,
    get souHost() { return souHost; },
    get meuAssento() { return meuAssento; },
    get salaAtual() { return salaAtual; },
    get uid() { return uid; }
  };
})();
