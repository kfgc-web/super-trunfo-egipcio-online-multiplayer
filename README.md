# Super Trunfo Egípcio

Jogo de Super Trunfo com tema de mitologia egípcia. Baralho de 32 cartas: deuses, deusas, faraós e criaturas míticas, cada um com quatro atributos avaliados de 0 a 10 (**Poder**, **Inteligência**, **Força** e **Agressividade**).

## Como jogar

1. Você recebe 16 cartas; a CPU recebe as outras 16.
2. Quem vence a rodada escolhe o atributo da rodada seguinte.
3. Em caso de empate, as duas cartas vão para a **pilha de disputa** e o próximo vencedor leva tudo.
4. Vence quem ficar com todas as 32 cartas.

### Carta especial

**Amon-Rá (Super Trunfo)** — 10 em todos os atributos. Só empata; nunca perde.

### Desempate por rank

Se um empate ocorrer na última carta de ambos os jogadores (impossibilitando a pilha de disputa), o vencedor é decidido pelo rank da carta:
- **Letras**: A > B > C > D
- **Números**: 1 > 2 > 3 > ... > 8 (letra tem prioridade sobre número)

## Tecnologia

HTML, CSS e JavaScript puro. Sem dependências externas, sem backend. Hospedado em GitHub Pages.

## Estrutura de arquivos

```
super-trunfo-egipcio/
├── index.html      # estrutura da página
├── style.css       # visual
├── script.js       # lógica do jogo
├── cards.js        # dados das 32 cartas
└── assets/         # imagens das cartas (32 arquivos .jpeg)
```
