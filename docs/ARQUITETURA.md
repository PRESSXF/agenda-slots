# Arquitetura e decisões

Este documento explica como a agenda-slots está organizada e por que cada escolha foi feita.

## Camadas

```
playground (React)         site/src/   importa a biblioteca pelo nome 'agenda-slots'
        │
API pública                src/agenda.ts, src/helpers.ts, src/index.ts
        │
motor                      src/engine.ts   compile → planDay → candidateStarts → evaluate
        │
primitivas                 src/interval.ts   src/timezone.ts   src/holidays.ts   src/time.ts
```

As primitivas não sabem o que é uma agenda. O motor não sabe que existe interface. O site usa exatamente a API publicada, então o código mostrado no painel "A chamada equivalente" é o mesmo que roda na página.

## Decisões

### 1. Intervalos semiabertos em milissegundos UTC

**Problema.** Comparar "08:00" com "08:00" parece simples até o dia ter 23 horas, ou até um atendimento terminar exatamente quando o próximo começa.

**Decisão.** Todo cálculo usa números: instantes em milissegundos desde a época, em intervalos `[início, fim)`. O fim não pertence ao intervalo, então 08:00-09:00 e 09:00-10:00 se tocam mas não se sobrepõem. Datas e horas de parede (`'AAAA-MM-DD'`, `'HH:MM'`) só existem na entrada e na saída.

**Consequência.** Sobreposição vira `a.start < b.end && b.start < a.end`, sem caso especial para bordas. Duração é subtração. A mesma aritmética serve para minutos do dia (expediente) e para instantes (agendamentos).

### 2. Fuso horário só com `Intl`, convertido nas bordas

**Problema.** Horário de verão cria horas que não existem (o relógio pula de 00:00 para 01:00 em São Paulo em 04/11/2018) e horas que acontecem duas vezes (23:00 de 16/02/2019). Bibliotecas de data resolvem isso, mas trazem 20 a 70 kB e uma dependência para manter.

**Decisão.** O motor faz uma pergunta ao fuso: "qual é o deslocamento neste instante?". A resposta vem de `Intl.DateTimeFormat#formatToParts`. A conversão de hora de parede para instante (`zonedTimeToEpoch`) testa os deslocamentos de um dia antes e um dia depois e segue a regra `compatible` do Temporal: hora repetida usa a primeira ocorrência; hora inexistente avança pelo tamanho do salto.

**Consequência.** O expediente "00:00-04:00" num dia de início de horário de verão tem 3 horas reais e gera 3 horários de 1 hora; no dia do fim, tem 5. Antecedência mínima conta horas reais. Os testes conferem isso com datas históricas de São Paulo e de Nova York, e com Lord Howe, cuja troca é de meia hora.

### 3. Cache de deslocamento por hora

**Problema.** `formatToParts` custa microssegundos, e o modo explicação chama o fuso milhares de vezes por semana. A primeira versão levava cerca de 17 ms para uma semana explicada.

**Decisão.** O deslocamento é guardado por hora UTC cheia. Se ele é igual no começo e no fim da hora, vale para a hora inteira, porque não existem duas trocas na mesma hora. Horas com troca no meio ficam marcadas e são calculadas instante a instante. Com o deslocamento em mãos, data e hora local saem de `Date#getUTC*`, sem `Intl`.

**Consequência.** A mesma semana passou para cerca de 4 ms em Node, sem mudar nenhum resultado (os testes de horário de verão continuam passando, inclusive o de meia hora). O cache tem limite de 20 mil entradas por fuso.

### 4. Zero dependências de execução

**Problema.** Uma biblioteca de agenda entra em back-ends, funções serverless e navegadores. Cada dependência é peso, superfície de ataque e uma atualização a mais.

**Decisão.** Nada em `dependencies`. Fuso com `Intl`, Páscoa por fórmula, intervalos e índice escritos aqui. React, Vite e Tailwind são só do playground e ficam em `devDependencies`.

**Consequência.** O pacote tem menos de 40 kB compactado, com ESM, CommonJS e tipos. `scripts/check-package.mjs` confere no CI que o `npm pack` só leva `dist/`, `README.md` e `LICENSE`, e que os dois formatos importam e calculam igual.

### 5. Indisponibilidade é resultado, não exceção

**Problema.** "Por que não tem horário às 10h?" é a pergunta mais comum de quem usa uma agenda, e a resposta normalmente se perde dentro de um filtro.

**Decisão.** `evaluate` devolve a lista completa de motivos de um horário, cada um com código estável (`booking_conflict`), rótulo em português ("conflito com agendamento") e frase do caso concreto. Slots livres são simplesmente os candidatos com lista vazia. O modo explicação devolve a grade inteira com os motivos. Só configuração inválida lança `AgendaError`.

**Consequência.** A mesma função alimenta `getAvailableSlots`, o modo explicação e `checkBooking`, então não há duas regras que possam divergir. Um teste de propriedade confere que "livre" no modo explicação é exatamente a lista de slots.

### 6. Intervalos de preparo e limpeza somam

**Problema.** Se a sessão nova precisa de 10 min de limpeza e a anterior também, qual é o espaço mínimo entre elas?

**Decisão.** O agendamento existente ocupa `[início - preparo, fim + limpeza)` do serviço dele, e o candidato precisa de `[início - preparo, fim + limpeza)` do serviço novo livre. Os dois se somam. Preparo antes da abertura e limpeza depois do fechamento são permitidos: só o atendimento precisa caber no expediente. Os mesmos intervalos valem para salas e aparelhos.

**Consequência.** Regra simples de explicar ao cliente ("a sala precisa de 10 minutos entre os pacientes"). Quem quiser outra política pode zerar os intervalos e modelar a limpeza como agendamento sem serviço.

### 7. Recursos com capacidade e turmas

**Problema.** Duas fisioterapeutas dividem um aparelho de laser; o pilates aceita 4 pessoas no mesmo horário com a mesma instrutora.

**Decisão.** Recursos têm `capacity`. O uso de um recurso é contado pela maior simultaneidade dentro da janela do candidato (varredura de eventos, com fim antes de início no mesmo instante). Agendamentos da mesma turma no mesmo horário formam uma sessão: ocupam o recurso uma vez e não contam como conflito para aquele horário, só como vagas. Uma turma em outro horário que se sobrepõe é conflito comum.

**Consequência.** `remaining` aparece nos slots de turma. O motivo `full` aparece quando lota, e `resource_busy` diz qual recurso e quem está usando.

### 8. Índice de intervalos sem árvore

**Problema.** A pergunta "o que se sobrepõe a [a, b)?" é feita para cada candidato.

**Decisão.** `IntervalIndex` ordena os intervalos pelo início e guarda o maior fim acumulado. Uma busca binária acha o último item que começa antes de `b`; a partir dele, voltamos enquanto o maior fim acumulado ainda passa de `a`. Sem árvore de intervalos, sem rebalanceamento: o índice é montado uma vez por `createAgenda`.

**Consequência.** Consulta em O(log n + k), onde k são os itens visitados. Um teste compara o índice com a busca ingênua em 500 consultas aleatórias.

### 9. Alinhamento da grade

**Decisão.** Por padrão (`alignment: 'hours'`), os inícios vêm a cada `stepMinutes` a partir do começo de cada faixa: expediente às 08:10 gera 08:10, 08:40. Com `'clock'`, os inícios são múltiplos do passo a partir da meia-noite local. Os passos são somados em tempo real, não em hora de parede, o que mantém a duração dos atendimentos correta na troca de horário.

### 10. Testes de propriedade com gerador determinístico

**Problema.** Casos escritos à mão cobrem o que a gente lembrou de pensar.

**Decisão.** `tests/property.test.ts` gera 60 clínicas com `mulberry32` (semente fixa): expediente aleatório que começa perto da meia-noite, agendamentos sobrepostos, passos de 5 a 30 min, quatro fusos e um período que cruza duas trocas de horário. Para todas, valem as invariantes: nenhum slot sobrepõe agendamento com intervalos, todos passam em `checkBooking`, respeitam antecedência e limite, a explicação concorda com a lista, e acrescentar restrições nunca cria horário.

**Consequência.** Uma falha mostra a semente e é reproduzível. Foi esse teste que encontrou a primeira divergência entre o modo explicação e a lista de slots, que virou o motivo `off_step`.

## Complexidade

Para D dias, P profissionais, C candidatos por dia (expediente ÷ passo), B agendamentos e R recursos do serviço:

| Etapa | Custo |
|---|---|
| `compile` | O(B log B) para ordenar e indexar |
| Plano do dia | O(faixas) conversões de fuso, quase todas no cache |
| Avaliar um candidato | O(log B + k) no índice do profissional e O(R · (log B + k log k)) nos recursos |
| `slots` | O(D · P · C · (log B + k)) |
| `nextAvailable` | Para no primeiro dia com vaga |

Uma semana de uma profissional com explicação leva poucos milissegundos no navegador; o playground mostra o tempo de cada cálculo.

## Limites conhecidos

- Faixas que atravessam a meia-noite precisam ser divididas em duas datas.
- Recursos não têm expediente próprio; um período fechado vira `blocked`.
- Um único fuso por agenda. Profissionais em fusos diferentes exigem uma agenda por fuso.
- Feriados estaduais e municipais entram manualmente pela opção `holidays`.
- O cache de deslocamento supõe no máximo uma troca de fuso por hora, o que vale para todo o banco IANA atual.
