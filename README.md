# Super Trunfo Egípcio

**🎮 Jogar / Play:** [kfgc-web.github.io/super-trunfo-egipcio-online-multiplayer](https://kfgc-web.github.io/super-trunfo-egipcio-online-multiplayer/)

🇧🇷 **[Português](#português)** • 🇬🇧 **[English](#english)**

---

## Português

Jogo de Super Trunfo com tema de mitologia egípcia. Baralho de **32 cartas** — deuses, deusas, faraós e criaturas míticas — cada uma com quatro atributos avaliados de 0 a 10: **Poder**, **Inteligência**, **Força** e **Agressividade**.

Dá para jogar **sozinho contra bots** (sem internet) ou **online com amigos** (até 4 jogadores na mesma sala). É também um **PWA**: pode ser instalado no celular ou no computador e funciona offline.

### Modos de jogo

- **Offline (contra bots).** Abre e joga na hora, sem internet e sem login. Os adversários são controlados pela IA do jogo.
- **Online (com amigos).** Um jogador cria uma sala e recebe um **código de 5 letras**; os outros entram com esse código. Cada sala comporta até **4 assentos**, que o anfitrião pode definir como humano, bot ou vazio.

### Como jogar

1. As 32 cartas são embaralhadas e distribuídas igualmente entre os participantes (2 jogadores → 16 cada; 3 → 11/11/10; 4 → 8 cada).
2. Na sua vez, você escolhe um atributo. Todos comparam a carta do topo da mão; quem tiver o maior valor naquele atributo **vence a rodada e leva todas as cartas da mesa**.
3. Quem vence a rodada escolhe o atributo da rodada seguinte.
4. Ficou **sem cartas** → você é eliminado. **Vence quem terminar com todas as 32 cartas.**

### Regras especiais

- **Amon-Rá (Super Trunfo).** Carta com **10 em todos os atributos**. Só empata; nunca perde.
- **Pilha de disputa.** Em caso de empate no atributo, as cartas empatadas vão para uma pilha à parte. O próximo vencedor leva tudo o que estiver acumulado nela.
- **Desempate por rank.** Se o empate acontecer quando os jogadores envolvidos já estão sem cartas para virar (tornando a pilha de disputa impossível), o vencedor é decidido pelo identificador da carta:
  - **Naipe** (letra) tem prioridade: A > B > C > D.
  - Dentro do mesmo naipe, vale o **número**: 1 > 2 > 3 > … > 8.

### Como funciona o online

O multiplayer roda sobre o **Firebase Realtime Database**, com algumas decisões de projeto que valem nota:

- **Host autoritativo.** As regras vivem em `motor.js` e rodam na máquina do **anfitrião**. A rede apenas transporta o estado que ele produz — ninguém adultera a partida pelo cliente.
- **Login anônimo.** Cada aparelho recebe um identificador invisível; não há cadastro nem senha.
- **Presença em tempo real.** A sala mostra ao vivo quem está conectado em cada assento.
- **Reconexão sem quebrar o jogo.** No lobby, quem sai libera a vaga. Já **em partida**, se alguém cai o assento é apenas marcado como offline (preservando quem era), e o anfitrião pode substituí-lo por um bot sem perder a amarração da mesa.
- **Firebase sob demanda.** O SDK só é baixado quando você escolhe jogar online. O modo offline nunca toca a rede — por isso o jogo abre e funciona mesmo sem internet.

### Tecnologia

- **HTML, CSS e JavaScript puro** — sem framework, sem etapa de build.
- **Firebase Realtime Database** para o multiplayer (carregado sob demanda).
- **PWA**: instalável e jogável offline graças ao service worker, que faz cache de todos os arquivos do jogo.
- Trilha de fundo opcional em `.mp3` / `.ogg`.

### Estrutura de arquivos

```
super-trunfo-egipcio-online-multiplayer/
├── index.html           # estrutura da página
├── style.css            # visual
├── script.js            # interface e fluxo de telas
├── motor.js             # regras puras do jogo (rodam no host)
├── rede.js              # camada de rede: Firebase, salas e presença
├── cards.js             # dados das 32 cartas
├── manifest.json        # manifesto do PWA
├── service-worker.js    # cache para funcionar offline
├── musica-fundo.mp3     # trilha de fundo
├── musica-fundo.ogg     #   (formato alternativo)
├── icon-192.png         # ícones do app
├── icon-512.png
├── icon-maskable-512.png
├── apple-touch-icon.png
└── assets/              # imagens das cartas (32 arquivos .jpeg)
```

---

## English

A Top Trumps–style card game themed around Egyptian mythology. The deck has **32 cards** — gods, goddesses, pharaohs and mythical creatures — each rated from 0 to 10 on four attributes: **Power**, **Intelligence**, **Strength** and **Aggression**.

You can play **solo against bots** (no internet required) or **online with friends** (up to 4 players in one room). It's also a **PWA**: installable on phone or desktop, and it works offline.

### Game modes

- **Offline (vs. bots).** Open and play instantly — no internet, no login. Opponents are driven by the game's AI.
- **Online (with friends).** One player creates a room and gets a **5-letter code**; others join with it. Each room has up to **4 seats**, which the host can set as human, bot, or empty.

### How to play

1. The 32 cards are shuffled and dealt evenly among players (2 players → 16 each; 3 → 11/11/10; 4 → 8 each).
2. On your turn, pick an attribute. Everyone compares the top card of their hand; the highest value on that attribute **wins the round and takes all cards on the table**.
3. The round's winner picks the attribute for the next round.
4. Run **out of cards** → you're eliminated. **The player who ends up holding all 32 cards wins.**

### Special rules

- **Amon-Ra (the Super Trunfo card).** Rated **10 on every attribute**. It can only tie; it never loses.
- **Dispute pile.** If an attribute ties, the tied cards go to a separate pile. The next round's winner sweeps everything stacked there.
- **Rank tie-break.** If a tie happens when the players involved have no cards left to flip (making a dispute pile impossible), the winner is decided by the card's identifier:
  - **Suit** (letter) takes priority: A > B > C > D.
  - Within the same suit, the **number** decides: 1 > 2 > 3 > … > 8.

### How the online mode works

Multiplayer runs on the **Firebase Realtime Database**, with a few design choices worth noting:

- **Authoritative host.** The rules live in `motor.js` and run on the **host's** machine. The network only carries the state it produces — no client can tamper with the match.
- **Anonymous login.** Each device gets an invisible identifier; there are no accounts or passwords.
- **Real-time presence.** The room shows live who is connected in each seat.
- **Reconnection without breaking the game.** In the lobby, leaving frees your seat. **Mid-match**, if someone drops, their seat is just flagged offline (keeping their identity), and the host can swap them for a bot without losing the table's wiring.
- **Firebase on demand.** The SDK is only downloaded when you choose to play online. Offline mode never touches the network — which is why the game loads and runs with no internet at all.

### Tech

- **Plain HTML, CSS and JavaScript** — no framework, no build step.
- **Firebase Realtime Database** for multiplayer (loaded on demand).
- **PWA**: installable and playable offline thanks to a service worker that caches every game file.
- Optional background track in `.mp3` / `.ogg`.

### File structure

```
super-trunfo-egipcio-online-multiplayer/
├── index.html           # page structure
├── style.css            # styling
├── script.js            # UI and screen flow
├── motor.js             # pure game rules (run on the host)
├── rede.js              # network layer: Firebase, rooms, presence
├── cards.js             # data for the 32 cards
├── manifest.json        # PWA manifest
├── service-worker.js    # cache for offline play
├── musica-fundo.mp3     # background track
├── musica-fundo.ogg     #   (alternative format)
├── icon-192.png         # app icons
├── icon-512.png
├── icon-maskable-512.png
├── apple-touch-icon.png
└── assets/              # card images (32 .jpeg files)
```
