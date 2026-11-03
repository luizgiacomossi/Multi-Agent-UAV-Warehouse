# MIPRO 2027 paper: plano e checklist

Paper sobre alocação de tarefas e planejamento de caminhos para um enxame de drones fazendo inventário em armazém, baseado neste repositório.

## 1. Dados da conferência

| Item | Valor |
|---|---|
| Evento | MIPRO 2027, 50th Jubilee Convention, Opatija, Croácia, 31/5 a 4/6/2027 |
| Track | **DC-CPS** (Distributed Computing and Cyber-Physical Systems). Tópicos: "Drones and Drone-related Information Systems", "Autonomous Systems", "Dependability, Adaptability, and Scalability" |
| Alternativas | AIS (Soft Computing & Optimization) ou SIDE (Cyber Physical Systems, Digital Twins) |
| Abstract | 2/11/2026 |
| Paper completo | **30/11/2026** |
| Notificação | 1/2/2027 |
| Tamanho | **Máximo 6 páginas, incluindo figuras e referências** |
| Formato | Template MIPRO (Word ou LaTeX), A4, sem número de página, PDF |
| Idioma | Inglês (para ir ao IEEE Xplore) |
| Revisão | Checagem de plágio antes da revisão. O paper precisa ser original |
| Após aceite | Versão camera-ready com nomes e afiliações, formulário de copyright IEEE (eCF) e apresentação oral por um dos autores |
| Inscrição | 333 € (membro IEEE/MIPRO, early bird até 17/5/2027) ou 370 € (outros). Uma por paper. O desconto de estudante não vale para doutorando |

Fontes: mipro.hr, páginas "Instructions for Authors MIPRO", "Call for papers" e da track DC-CPS (consultadas em 2/11/2026). Baixar o template LaTeX na página de instruções e conferir se ele traz outras regras (por exemplo, limite do abstract).

## 2. Abstract submetido (2/11/2026)

> **Energy-Aware Task Allocation and Conflict-Free Path Planning for Drone Swarms in Warehouse Inventory Inspection**
>
> Indoor drone swarms can automate inventory checks in warehouses, but the drones must avoid each other and moving forklifts in narrow aisles on limited battery power. We present a centralized planning framework for multi-drone pallet inspection in a 3D voxel warehouse model, where each pallet is an inspection task with a priority and a required sensor. Tasks are assigned with the Hungarian algorithm over a priority-weighted cost combining normalized distance and an exponential battery penalty. A safety-margin energy estimate admits a task only if the drone can still reach a charger afterwards. Alternatively, nearby pallets are grouped into small clusters that each drone flies as one ordered tour. Space-time paths are computed with prioritized cooperative A* or windowed Conflict-Based Search, both avoiding other drones and forklifts. Charging stations have a finite charge rate and are booked in time to avoid queueing in the air. Seeded benchmarks on three warehouse sizes (up to 200 pallets) with swarms of up to 24 drones show collision-free missions without battery depletion. Cluster allocation roughly halves makespan and energy use compared with one-to-one assignment, and charging stations shorten long missions further. We also compare joint conflict resolution against prioritized planning as swarm density grows.

199 palavras (limite do portal: 200). Autores, na ordem: Luiz Giacomossi, Afshin Ameri, Ivan Tomasic, Baran Çürüklü, Håkan Forsberg (todos da Mälardalen University). Keywords: drone swarm, multi-robot task allocation, multi-agent path finding, energy-aware planning, warehouse inventory. O abstract do paper final pode mudar. Atualizar a versão no portal se os números mudarem depois de rodar os experimentos de novo.

Afirmações do abstract que o paper precisa sustentar:
- [ ] "swarms of up to 24 drones": hoje só existe no S-12 (50 paletes, 3 repetições). Rodar 24 drones no M-16 e no L-24 ou deixar claro no texto em qual escala isso foi testado.
- [ ] "windowed Conflict-Based Search": descrever a janela de cerca de 10 ticks, o planejamento por trecho e o fallback para Cooperative A*.
- [ ] "booked in time to avoid queueing in the air": é a intenção da política, não uma garantia. Se o caminho até a estação falha, o drone paira no lugar e tenta de novo (até 5 vezes, 3 ticks cada) antes de voltar à base. Medir quantas vezes isso acontece ou descrever como objetivo de projeto.
- [ ] "safety-margin energy estimate": a estimativa usa distância Euclidiana × γ, e o voo real segue o grid. Mortes de bateria são detectadas e contadas, não impossíveis por construção.

## 3. Mensagem do paper

**Pergunta central:** como a forma de alocar tarefas (1-para-1 vs clusters), a infraestrutura de recarga e o planejador de caminhos afetam o tempo de missão, a energia e a segurança de um enxame de drones fazendo inventário?

**Contribuições (rascunho, rever):**
- [ ] C1. Modelo de alocação com restrição de energia: custo distância/bateria/prioridade e viabilidade com margem de segurança até o carregador mais próximo.
- [ ] C2. Alocação por clusters de paletes com ordem de visita otimizada, comparada a 1-para-1.
- [ ] C3. Política de recarga com estações de um drone, reservadas no tempo.
- [ ] C4. Comparação entre planejamento priorizado (Cooperative A*) e CBS em densidade crescente de drones.
- [ ] C5 (opcional). Simulador e benchmark com sementes fixas, liberados como código aberto.

**Decidir:** C4 vira resultado principal ou só discussão? Depende do experimento E4 (seção 5).

## 4. Orçamento de páginas (6 no total)

| Seção | Páginas | Conteúdo |
|---|---|---|
| Title, abstract, keywords | 0,4 | |
| I. Introduction | 0,6 | Motivação, lacuna, contribuições em lista |
| II. Related work | 0,6 | MRTA, MAPF (CBS, prioritized), drones em armazém, recarga |
| III. Problem formulation | 0,8 | Grid 3D, tarefas, energia, restrições de conflito, objetivo |
| IV. Method | 1,2 | Custo e viabilidade, clusters e tour, planejadores, recarga. 1 figura de arquitetura |
| V. Experimental setup | 0,4 | Cenários, parâmetros, métricas, hardware |
| VI. Results | 1,3 | 2 a 3 figuras, 1 tabela |
| VII. Discussion and limitations | 0,3 | |
| VIII. Conclusion | 0,2 | |
| References | 0,6 | Cerca de 15 a 20 referências |

Limite prático: **3 figuras e 2 tabelas**. Um screenshot do visualizador só entra se couber.

Situação em 2/11: Introdução e Related Work juntos têm cerca de 900 palavras, perto de 1,4 página contra 1,2 do orçamento. Fig. 1 (252 × 128 pt) e Fig. 2 (252 × 300 pt) somam cerca de 0,4 página. Cortar quando o resto estiver escrito, começando pelos exemplos mais longos da Introdução.

## 5. Trabalho no código e experimentos

### 5.1 Correções e ajustes antes de rodar

- [ ] Rodar de novo todos os benchmarks no commit atual. Os resultados em `bench-results/` são de antes da mudança nas faixas dos empilhadeiras (1/10, 18:33) e não podem ir para o paper.
- [x] Registrar o hash do commit e a versão do Node usados em cada experimento. O `summary.json` agora tem `environment` (commit, se havia mudanças não commitadas, versão do Node).
- [x] Inconsistência de distância: a alocação usava Euclidiana × γ = 1,3, e o planejador anda em passos no grid. Medido: o voo real era 1,48× a linha reta (mediana), e 87% dos trechos 1-para-1 passavam de γ. Corrigido (decisão de 2/11): a estimativa usa distância Manhattan com γ = 1,1. Agora a razão média é 1,005 (1-para-1) e 1,059 (Cluster), com 1,9% e 11,7% dos trechos acima de γ. Efeito colateral: no preset `charging`, L-24 só com a base cobre 98% dos paletes (a estimativa ficou mais conservadora com bateria 30). Muda os números.
- [x] `D_MAX` não é usado. O código usa `world.size * 2`. Alinhar código e texto. Agora é `dMaxFor(N) = 2N` no `SimulationConfig.ts`, igual ao paper. Os números não mudam.
- [x] Prioridade em modo `mixed` vai só de 0,10 a 0,59. Decidir se fica assim e descrever. Ampliada para 0,10 a 1,00 (decisão de 2/11). Muda os números.
- [x] `t_hover = 5` só entra na estimativa de energia, e o scan não ocupa ticks no caminho. Corrigir ou declarar no texto. Corrigido: o drone paira `SCAN_TICKS` = 3 passos no palete, reservados na tabela, e o CBS segura o objetivo durante a leitura (decisão de 2/11). Muda os números.
- [x] Decidir sobre Naive e Energy Saver: entram nos experimentos ou saem do paper? Decisão de 2/11: Naive entra como baseline sem coordenação (mostra que sem o método os drones colidem). Energy Saver entra no E4. Ele só muda o custo do A* (energia, esperar custa metade de voar) e hoje gasta o mesmo que o Cooperative (diferença média de 0,03%, idêntico em 59 de 108 missões), porque quase não há conflitos. O E4 mostra se isso muda com densidade alta. Na discussão: a economia de energia vem da alocação e dos clusters (cerca de 52% menos energia), não do caminho. Ressalva: β_hover = β_fly/2 é suposição do modelo, e em multirotores reais pairar gasta perto de voar devagar. Precisa de referência (o Luiz busca: "multirotor hover power consumption model", "quadrotor energy model forward flight vs hover").
- [ ] Não usar os experimentos "Exp 2 Monte Carlo" e "Exp 3 fault" da UI. O de falha é um stub.

### 5.2 Funcionalidades novas

- [x] **Baselines de alocação** (essencial, revisor vai pedir): greedy por custo, tarefa mais próxima, aleatório. Opcional: leilão simples (sequential single-item auction). Feito: `--alloc Greedy,Nearest,Random`, todos com a mesma checagem de energia. A seed não depende mais do modo de alocação, então todos os métodos (e 1-para-1 vs Cluster) rodam no mesmo armazém, pareados.
- [x] **Opção `--altitude` no benchmark** (hoje `runScenario` usa o tamanho do grid como teto). Necessária para o E4. Feito: `--altitude 8,16` roda os tetos na mesma rodada, pareados. Os paletes vão até y = 6 (S, M) e y = 7 (L), então teto 8 alcança todos.
- [ ] Opcional: corredores de 1 célula ou outro jeito de aumentar a densidade de conflitos.
- [x] **Achado de 2/11 sobre a altura dos racks:** o gerador sorteia cada pilha com 1 a `min(N − 2, DEFAULT_MAX_ALTITUDE = 8)` paletes, então os racks param em 8 níveis (y de 0 a 7) em qualquer grid. No L-24 sobram 16 camadas vazias. Em S-12 e M-16 o máximo saiu y = 6 porque o gerador só mantém 50 ou 90 paletes depois do sorteio. No paper, descrever o armazém como área N × N com racks de até 8 níveis, e não como N³. Opção `--rack-levels` adicionada (padrão 8, agora `WAREHOUSE.RACK_LEVELS`, separado do teto de voo da interface). Sensibilidade (2/11, 5 runs, 8 drones, todos os paletes, Cooperative e CBS):
  - M-16 com 4, 8 e 12 níveis, L-24 com 4, 8 e 16. Com 4 níveis não cabem todos os paletes (56 em vez de 90, 154 em vez de 200), então a carga muda e o caso não é comparável.
  - De 8 para 12 ou 16 níveis (mesmos paletes, mais altos): makespan e energia sobem cerca de 10% (M-16 1-para-1: makespan 474 → 513, energia 336 → 369; L-24: 1452 → 1590, 1093 → 1191).
  - As conclusões não mudam. Cluster continua economizando cerca de 50% de energia (48% a 53%). CBS vs Cooperative fica abaixo de 0,3% em soma de custos, sem fallbacks. A estimativa de energia continua certa (razão 1,00 a 1,08). Zero colisões, baterias esgotadas e drones presos.
  - Para o paper: manter 8 níveis e dizer em uma frase que 12 e 16 níveis só aumentam os números absolutos em cerca de 10%.
- [x] **Achado de 2/11 sobre o teto:** os drones já voam em y ≤ 7 sem teto (os paletes vão até y = 6 ou 7), então teto 8 não muda nada, e teto abaixo de 7 deixa paletes de fora. O teto não serve para aumentar a densidade no E4. Usar número de drones (8 a 32) ou corredores estreitos.
- [x] **Achado de 2/11 sobre os baselines (amostra pequena, 3 runs):** com ida e volta à base, todos os métodos dão quase o mesmo resultado (diferença menor que 1%), porque todo drone está na base quando recebe tarefa. Sem ida e volta (`--no-return`), Random fica cerca de 50% pior, mas Nearest voa de 3% a 12% menos que o Hungarian. Provável causa: o Hungarian divide o custo por π_k e atende primeiro os paletes urgentes. Métricas `meanScanTime` e `priorityScanTime` adicionadas (tempo médio da primeira leitura, simples e ponderado por π_k). Amostra de 5 runs, S/M, 4 e 8 drones, Cooperative, todos os paletes:
  - Com ida e volta: makespan e energia iguais entre os métodos (diferença de até 1%, mas Nearest chega a 6% pior em S-12 com 8 drones). Hungarian e Greedy leem os paletes urgentes de 16% a 24% antes da média. Nearest e Random não dão preferência (-3% a +2%). Os urgentes saem de 12% a 20% antes que com Nearest.
  - Sem ida e volta: Nearest voa de 0% a 14% menos e termina de 0% a 8% antes que o Hungarian. Hungarian ainda adianta os urgentes de 10% a 16%, mas o ganho no tempo ponderado em relação ao Nearest é pequeno ou nulo (melhor em S-12, pior em M-16 com 4 drones). Random fica de 45% a 60% pior em tudo.
  - Greedy fica a menos de 2% do Hungarian em todas as métricas. O ganho vem da função de custo (prioridade e bateria), não do solver ótimo.
  - Por que Greedy ≈ Hungarian (medido em 3 runs, S/M, 4 e 8 drones). Os dois escolhem diferente em 25% a 60% das rodadas, mas por motivos diferentes isso não muda a missão:
    - Com ida e volta, os drones recebem tarefa na base, em pads vizinhos, então as linhas da matriz de custo são quase iguais. O Hungarian economiza só 1 a 2% do custo da rodada (no máximo 7%).
    - Sem ida e volta, o Hungarian economiza de 8% a 19% do custo da rodada (até 51%), mas a rodada seguinte reequilibra. Ótimo por rodada não é ótimo na missão.
    - Com 1 a 4 drones ociosos por rodada, a matriz é pequena.
    - Para o paper: a contribuição é a função de custo e a checagem de energia, não o solver ótimo. Planejamento que olhe várias rodadas à frente fica como trabalho futuro.
  - Para o paper: E1 com ida e volta mostra o efeito da prioridade com clareza. Dizer que o Hungarian ótimo e o greedy dão quase o mesmo resultado, e que sem ida e volta há um trade-off entre distância e prioridade.
- [x] Teste estatístico pareado no `bench/report.ts` (Wilcoxon signed-rank, já que os cenários são pareados por semente). Feito: o benchmark grava `tests.csv` com o teste de cada par de níveis de cada fator, pareado por seed. p exato até 50 pares (com empates também), conferido com o scipy. Amostra de 2/11 (S-12, 4 drones, todos os paletes, 10 runs): Hungarian vs Greedy p = 0,63 a 0,80 (empate), Hungarian vs Nearest p = 0,002 no tempo ponderado por prioridade (30 ticks a menos), Cluster vs 1-para-1 p = 0,002 em energia, CBS vs Cooperative p = 0,03 a 0,13 com diferenças de 0,1%.
  - Atenção: com n runs o menor p possível é 2/2ⁿ (0,002 com 10, 2e-6 com 20). Com muitas comparações, considerar a correção de Holm. Diferença significativa não é diferença relevante: o CBS ganha 0,2 ticks com p = 0,03.
- [ ] **Escalas 16, 28 e 40 (ideia de 3/11, em decisão).** Teste rápido (1 run, todos os paletes, densidade de 0,35 palete por célula do chão, Cooperative e CBS):
  - 16: 90 paletes, 2 empilhadeiras, cerca de 0,5 s por cenário.
  - 28: 274 paletes, 4 empilhadeiras, cerca de 3 s por cenário (4 drones: makespan 4431, 8 drones: 2136).
  - 40: 560 paletes, 6 empilhadeiras, 11 a 17 s por cenário. Com 8 drones cobre tudo (makespan 5941). Com 2 drones para em `MAX_TIMESTEPS = 10 000` com 40% de cobertura, e com 4 drones também passaria do limite (cerca de 12 000 ticks).
  - Zero colisões e zero fallbacks do CBS em todos.
  - 64 (para o E5, medido com `MAX_TIMESTEPS` temporariamente em 60 000): 1434 paletes, 10 empilhadeiras, cerca de 3 min por cenário com os dois planejadores. Makespan 24 279 (8 drones), 12 008 (16), 5947 (32). Planejamento de 60 a 66 s no Cooperative e de 106 a 112 s no CBS, quase sem depender do número de drones. Cobertura 100%, zero colisões e fallbacks, e CBS a menos de 0,2% do Cooperative.
  - Tamanho da célula não está definido em lugar nenhum. Se uma célula for uma posição de palete (cerca de 1,2 a 1,5 m), 40 dá uns 60 × 60 m e 64 uns 96 × 96 m, com racks de cerca de 12 m. Definir no Setup e procurar referência para o tamanho típico de um armazém (o usuário decide).
  - Se adotar: subir `MAX_TIMESTEPS` (cerca de 30 000), trocar `SCALES`, refazer os renders da figura dos cenários, refazer a sensibilidade dos racks e conferir o preset `charging` (bateria 30 com δ_safe 20 pode não alcançar o fundo de um armazém 40).
- [ ] Script que gera as figuras a partir de `summary.csv` (matplotlib ou similar), salvo no repositório.

### 5.3 Experimentos (mínimo 10 repetições por célula, idealmente 20)

- [ ] **E1. Alocação:** Hungarian vs greedy vs nearest vs random. S/M/L, 2/4/8 drones, cobertura total, com e sem ida e volta. Métricas: makespan, energia, soma de custos, `priorityScanTime` e `meanScanTime`.
- [ ] **E2. Clusters:** 1-para-1 vs Cluster. Variar raio (3, 5, 7) e tamanho máximo (2, 3, 4, 6).
- [ ] **E3. Recarga:** preset `charging` (1, 2, 3, 5 pontos de recarga). Métricas: makespan, energia, visitas e ticks nas estações.
- [ ] **E4. Planejadores vs densidade:** Naive vs Cooperative vs Energy Saver vs CBS, 4 a 32 drones (o teto não aumenta a densidade, ver achado acima). Métricas: soma de custos, makespan, tempo de planejamento, nós do CBS, fallbacks, falhas. Teste preliminar de 2/11 (S-12, 3 repetições, teto alto): CBS ganha até 1,5% em soma de custos e é cerca de 1,5× mais lento, com zero fallbacks.
- [ ] **E5 (opcional). Escalabilidade:** tempo de planejamento vs número de drones e de paletes.
- [ ] Confirmar zero colisões e zero baterias esgotadas em todos os cenários seguros. Se alguma aparecer, investigar antes de escrever.

### 5.4 Figuras e tabelas planejadas

Plano revisto em 2/11: uma figura do problema e um diagrama da solução, e os resultados juntos numa figura de dois painéis. Fontes e geradores em `figures/` no repo do paper (SVG e PDF vetorial, Times).

- [x] Fig. 1: problema. Vista isométrica do cenário S-12 (seed 42), com os três desafios numerados. Na Introdução, depois do primeiro parágrafo.
- [x] Fig. 2: diagrama da solução (loop por eventos: alocação, recarga, planejamento por trecho, atualização, com a tabela de reservas espaço-tempo). Na Seção IV.
- [x] Figura dos cenários (largura total, Seção V): renders do simulador dos três armazéns com todas as prateleiras cheias, mais close-ups do drone, da empilhadeira e do rack renderizados sozinhos. Captura em `figures/scenarios_capture.mjs` (repo do paper) e `paper/figure-renders/` (aqui). É a 4ª figura, então o texto precisa encolher.
- [ ] Fig. de resultados: dois painéis, (a) makespan vs número de drones (1-para-1 vs Cluster) com barras de erro, (b) makespan e energia vs número de pontos de recarga.
- [ ] CBS vs Cooperative em densidade crescente: entra na Tabela II.
- [ ] Tabela I: parâmetros do modelo (β_fly, β_hover, γ, δ_safe, λ, w1, w2, escalas S/M/L).
- [ ] Tabela II: comparação entre métodos de alocação (E1), mais CBS vs Cooperative (E4).

## 6. Escrita

- [x] Baixar o template LaTeX do MIPRO e montar o esqueleto das seções. O paper fica no repo do Overleaf, clonado em `paper/Paper_MIPRO_Planning_Warehouse/`.
- [x] Título, autores, afiliação, abstract e keywords no `paper.tex`.
- [x] I. Introdução: rascunho com citações. Rever depois dos resultados. Falta confirmar o "few" da lacuna e decidir sobre o link do código (C5).
- [x] II. Related work: rascunho em quatro parágrafos (drones em armazém, alocação, MAPF, alocação + path finding + energia). Falta checar se os trabalhos de armazém modelam conflitos.
- [x] III. Formulação: rascunho em sete parágrafos (grid, drones, tarefas, empilhadeiras, energia e recarga, conflitos, objetivo), com a notação do `SimulationConfig.ts`. Falta resolver o tempo de leitura (ver abaixo).
- [x] IV. Método: rascunho com abertura que percorre a Fig. 2 e as quatro subseções (custo e viabilidade com as equações de energia, viabilidade e custo, clusters, planejadores, recarga). Tem cerca de 920 palavras, uns 0,5 página acima do orçamento. Cortar depois.
- [ ] IV. Pseudocódigo do loop por eventos (`SimulationManager.runPathfinding`): ficou de fora por espaço. Decidir se entra.
- [ ] V. Setup: semente, repetições, hardware, versão do código.
- [ ] VI. Resultados: só números do commit atual, com média ± IC95 e resultado dos testes estatísticos.
- [ ] VII. Limitações, ditas abertamente: modelo em grid sem dinâmica nem unidades físicas, empilhadeiras com rotas conhecidas, planejamento offline sem replanejamento durante a execução, CBS por janela de trechos (não ótimo para a missão inteira), escala até 24³ células.
- [ ] Conclusão por último.
- [x] Referências: 21 no `.bib`, sem arXiv, incluindo 4 self-citations. Falta página e DOI do Bavaro e Amigoni (ECMR 2025).
- [ ] Referências novas: o Luiz define as citações. Preparar palavras-chave de busca para cada seção do related work: "multi-robot task allocation survey", "Hungarian algorithm multi-robot assignment", "conflict-based search multi-agent path finding", "prioritized planning multi-agent", "UAV warehouse inventory RFID", "drone charging station scheduling", "mTSP clustering UAV".

### TODOs abertos no `paper.tex`

Cada `\todo` vermelho no texto tem um item aqui. Tirar o `\todo` do texto e marcar aqui quando resolver.

- [ ] Introdução: confirmar o "few" da lacuna depois do Related Work.
- [ ] Introdução: link do código aberto na contribuição C5, se o simulador for liberado.
- [ ] Related Work: checar se os trabalhos de drones em armazém modelam conflitos entre drones ou com veículos de chão.
- [x] Formulação (tarefas): o scan não ocupava passos no caminho. Resolvido no código (3 passos), e o texto diz isso.
- [ ] Método (recarga): "sem fila no ar" só vale se o trecho até a estação der certo. Se falhar, o drone paira e tenta de novo. Contar quantas vezes isso acontece nos benchmarks. Mesmo item da seção 2.
- [x] Método (custo): o texto diz D_max = 2N. Resolvido, o código agora define `dMaxFor(N) = 2N`.
- [ ] Setup: a frase dos racks ("With 12 or 16 levels, makespan and energy grow by about 10%") vem da amostra de 5 runs de 2/11. Confirmar o número na rodada final.
- [ ] Resultados (E1): o `\todo` diz que o Greedy ficou a menos de 2% do Hungarian e que o ganho vem da função de custo. Confirmar na rodada final antes de escrever.
- [ ] Seções V a VIII: ainda são só `\todo`.

### Regras de estilo (sempre)

- [ ] Sem ponto e vírgula no texto corrido (em tabelas pode).
- [ ] Sem travessões.
- [ ] Sem construções "not X but Y" e "rather than".
- [ ] Sem palavras como leverage, ensure, pivotal, crucial, seamless.

## 7. Checagem final antes de 30/11

- [ ] No máximo 6 páginas, contando referências.
- [ ] Template MIPRO sem alterações de margem ou fonte. A4. Sem números de página.
- [ ] Todas as figuras legíveis em impressão P&B.
- [ ] Todo número do texto bate com um CSV do commit registrado.
- [ ] O abstract do paper confere com os resultados finais.
- [ ] Texto original (vai passar por checagem de plágio).
- [ ] Revisão completa do texto por pelo menos um coautor.
- [ ] Submeter o PDF pelo portal MIPRO.

## 8. Cronograma

| Semana | Foco |
|---|---|
| 2 a 8/11 | Correções da 5.1, baselines de alocação, opção de altitude, testes estatísticos |
| 9 a 15/11 | Rodar E1 a E4, gerar figuras. Escrever III e IV |
| 16 a 22/11 | Escrever II, V, VI e VII. Fechar as referências |
| 23 a 30/11 | Introdução, conclusão, cortar até 6 páginas, revisão e submissão |
