/*
  Service Worker — Super Trunfo Egípcio
  =====================================
  Este arquivo faz o jogo funcionar OFFLINE. Depois que o jogador abre o
  jogo uma vez (com internet), o navegador guarda todos os arquivos e o
  jogo passa a abrir sem conexão.

  ┌─────────────────────────────────────────────────────────────────────┐
  │  >>> IMPORTANTE: COMO ATUALIZAR O JOGO DEPOIS <<<                      │
  │                                                                       │
  │  Toda vez que você editar QUALQUER arquivo do jogo (uma carta, uma    │
  │  imagem, o visual, etc.) e subir a alteração pro GitHub, você PRECISA  │
  │  trocar o número da versão na linha abaixo:                           │
  │                                                                       │
  │      "trunfo-egipcio-v2"  ->  "trunfo-egipcio-v3"  ->  "...-v4" ...    │
  │                                                                       │
  │  Se você esquecer de trocar, os jogadores continuarão vendo a versão  │
  │  ANTIGA mesmo depois de você atualizar. Trocar o número força todo    │
  │  mundo a baixar a versão nova.                                        │
  └─────────────────────────────────────────────────────────────────────┘
*/

const CACHE_VERSION = "trunfo-egipcio-v4";

// Lista de tudo que precisa ser guardado para o jogo rodar offline.
const ARQUIVOS = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "cards.js",
  "musica-fundo.mp3",
  "musica-fundo.ogg",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
  // As 32 cartas
  "assets/1a-ra.jpeg",
  "assets/2a-serpopardo.jpeg",
  "assets/3a-ramses-ii.jpeg",
  "assets/4a-akhenaton.jpeg",
  "assets/5a-queops.jpeg",
  "assets/6a-tutancamon.jpeg",
  "assets/7a-neftis.jpeg",
  "assets/8a-aton.jpeg",
  "assets/1b-apep.jpeg",
  "assets/2b-atum.jpeg",
  "assets/3b-sekhmet.jpeg",
  "assets/4b-nun.jpeg",
  "assets/5b-horus.jpeg",
  "assets/6b-isis.jpeg",
  "assets/7b-anubis.jpeg",
  "assets/8b-maat.jpeg",
  "assets/1c-set.jpeg",
  "assets/2c-hathor.jpeg",
  "assets/3c-amon-ra.jpeg",
  "assets/4c-thoth.jpeg",
  "assets/5c-ptah.jpeg",
  "assets/6c-osiris.jpeg",
  "assets/7c-bastet.jpeg",
  "assets/8c-esfinge.jpeg",
  "assets/1d-ammit.jpeg",
  "assets/2d-khonsu.jpeg",
  "assets/3d-mut.jpeg",
  "assets/4d-heka.jpeg",
  "assets/5d-medjed.jpeg",
  "assets/6d-hapi.jpeg",
  "assets/7d-imhotep.jpeg",
  "assets/8d-cleopatra-vii.jpeg"
];

// 1) Instalação: baixa e guarda todos os arquivos no cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

// 2) Ativação: apaga caches de versões antigas, deixando só a versão atual.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_VERSION)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// 3) Interceptação: responde do cache; se não achar, busca na internet.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((resposta) => resposta || fetch(event.request))
  );
});
