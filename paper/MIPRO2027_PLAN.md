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
- [x] "swarms of up to 24 drones": superado (3/11). Os experimentos rodam até 32 drones em todas as escalas, e o abstract do `paper.tex` já diz 32 drones e 1434 paletes. O abstract submetido continua com 24 e 200.
- [ ] "windowed Conflict-Based Search": descrever a janela de cerca de 10 ticks, o planejamento por trecho e o fallback para Cooperative A*.
- [ ] "booked in time to avoid queueing in the air": é a intenção da política, não uma garantia. Se o caminho até a estação falha, o drone paira no lugar e tenta de novo (até 5 vezes, 3 ticks cada) antes de voltar à base. Medir quantas vezes isso acontece ou descrever como objetivo de projeto.
- [ ] "safety-margin energy estimate": a parte da distância foi resolvida (Manhattan × 1,1 desde 2/11). Falta dizer no texto que mortes de bateria são detectadas e contadas, e não impossíveis por construção (zero no E3).

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

- [x] **Seção V escrita (3/11)**: armazéns (16/32/64, cerca de 90/358/1434 paletes, 2/5/10 empilhadeiras geradas, sensores meio a meio, π uniforme em [0,1; 1]), configurações de energia, os 5 experimentos com a Tabela I (`tab:experiments`), métricas, teste de Wilcoxon pareado e hardware. Bateria agora em unidades em todo o paper (B = 100, δ_safe = 20 unidades, E3 com B = 30 e a mesma margem), igual ao código. Abstract e contribuições atualizados (até 1434 paletes e 32 drones). TODOs no texto: refazer a Fig. 3 e a sensibilidade dos racks nas novas escalas, citação do Wilcoxon (palavras-chave: Wilcoxon 1945 "Individual comparisons by ranking methods"), link do código. A seção ficou maior que o orçamento de 0,4 página (cerca de 0,7 com a tabela).
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
- [x] **Decisão de 3/11: escalas 16, 32 e 64 cruzadas com 2, 4, 8, 16 e 32 drones em todos os experimentos** (lado dobra, área e paletes ×4: 90, 358 e 1434 paletes). Implementado: escalas `XL-32` e `XXL-64` (as antigas 12/16/24 continuam), presets `e1` a `e5`, `--cluster-radius` e `--cluster-size` como dimensões (só variam no Cluster, fora da seed), `MAX_TIMESTEPS` 150 000 (2 drones no 64 precisam de 98 007 ticks, 134 s, 1,1 GB de memória antes da otimização). 64 é o maior grid que as chaves espaço-tempo codificam.
  - Reserva das empilhadeiras sob demanda: antes, cada cenário reservava o horizonte inteiro. Com 150 000 ticks o preset `full` levou 408 s em vez de 42 s. Agora reserva até 5000 ticks além do caminho mais longo, antes de cada ciclo: 36 s, resultados idênticos.
  - Otimização guiada por profiler (64 × 64, 8 drones): `clearOwnerFromTime` (36%, varria a tabela inteira) e as chaves de aresta em texto (18% mais coleta de lixo) dominavam. Agora as reservas são indexadas por dono e as arestas usam chave numérica. Planejamento do cenário: 65 s → 34 s (reserva sob demanda) → 16 s. Resultados idênticos em 1080 runs (`standard` com os quatro planejadores, `full` com Cooperative). `full` com Cooperative: 42 s → 15 s. Ainda sobra `clearOwnerFromTime` com 20%.
  - Execução curta de todos os presets (3/11, 1 repetição): zero falhas, zero colisões, baterias esgotadas e drones presos nos planejadores seguros, cobertura 100% em E1, E2, E4 (exceto Naive) e E5. Tempo com o código otimizado: E1 72 s por repetição com 8 workers. E4 no 64 com 1 worker: 2 drones Naive 19 s, Cooperative 44 s, Energy Saver 43 s, CBS 70 s, 8 drones 14, 16, 16 e 25 s. Estimativa com 20 repetições: E1 cerca de 30 min (com e sem volta), E2 cerca de 30 min, E3 minutos, E4 cerca de 3 h. O E5 sai dos dados do E4 (mesmos planejadores, 1 worker).
  - **Problema no E3 (em decisão):** com bateria 30, só a base não alcança os paletes do fundo (cobertura 85% no 32 e cerca de 24% no 64), então makespan não é comparável entre números de estações. Com bateria 100 a cobertura é 100%, mas as estações quase não mudam o makespan (±2%, inclusive no 64), porque a recarga a 2%/tick custa o mesmo tempo em qualquer carregador e só a viagem até ele encurta. Opções: bateria apertada por escala (a menor que ainda cobre tudo só com a base), ou E3 só no 16.
    - Unidades (3/11): a bateria é em unidades absolutas (β_fly = 0,10 por célula, β_hover = 0,05 por tick) e δ_safe = 20 também é absoluto. Com capacidade 100 a margem é 20% da carga, com 30 é 67% (sobram 10 unidades, cerca de 90 células de ida e volta, palete a no máximo uns 45 passos da base). Se o paper descrever δ_safe como %, precisa virar fração da capacidade no código.
    - Avaliação acadêmica: bateria ajustada por escala sozinha mistura dois fatores (escala e bateria mudam juntos) e parece escolhida para favorecer as estações. Mais defensável: (a) bateria normalizada, definida como razão entre a energia utilizável e a energia da ida e volta ao palete mais longe (ex.: ρ = 1,2 em todas as escalas), ou (b) bateria física fixa (amarrada ao tamanho da célula em metros) com cobertura como métrica principal do E3 e makespan por palete lido.
    - Posicionamento das estações (3/11): hoje `World.generateStations` usa farthest-point sampling (a 1ª estação vai para a célula livre mais longe da base, a 2ª para a mais longe da base e da 1ª etc.). Não considera a bateria. Correção: o voo até uma estação não usa a margem (`ChargingPolicy.chooseCharger` só exige energia < bateria), então com bateria 30 o drone alcança uma estação a até cerca de 270 células, e qualquer estação do 64 fica ao alcance. O problema real é outro: as estações vão para os cantos, e os paletes entre elas ficam fora do alcance (1 estação espalhada cobriu 49% do 64, 2 cobriram 66%). Ideia do autor: posicionar as estações pela cobertura, em cadeia (cada estação ao alcance da base ou de outra estação) até todo palete ficar ao alcance de algum carregador. Com bateria física fixa, o E3 passa a medir o número mínimo de estações para cobertura 100% por escala e o ganho de makespan e energia com estações além desse mínimo.
    - [x] **Implementado (3/11, decisão: posicionamento por cobertura).** `--stations coverage` (preset `e3`, sites 1 a 7, bateria 30). Guloso de cobertura máxima: cada estação vai para a célula que cobre mais paletes ainda não cobertos (mesmo teste de energia da alocação, Eq. 13 e 14). Depois de cobrir tudo, cada estação extra vai para a célula que mais encurta a distância dos paletes ao carregador mais próximo. A colocação com n estações é prefixo da mesma sequência, então a comparação continua pareada. `runs.csv` ganha `stationPlacement` e `minChargingSites`.
    - Mínimo de pontos de recarga (base incluída) com bateria 30, 25 cenários por escala: 1 no 16, 2 no 32, 4 no 64 (5 em 2 cenários).
    - Smoke (Cooperative, 1 repetição, 2, 8 e 32 drones, sites 1 a 6): cobertura 100% exatamente a partir do mínimo, abaixo dele no máximo 98%. Zero colisões, baterias esgotadas e drones presos. Só a base: 85% a 91% no 32, 23% a 27% no 64. No 64 com 1 estação: 89% a 91% (espalhada: 49%).
    - Makespan além do mínimo: 64 × 8 drones 6299 (4 sites), 5498 (5), 5058 (6), com 5 sites espalhados 6091. 64 × 32 drones 4119, 2493, 2203. 32 × 8 drones 1161 (2 sites) até 942 (5). 64 × 2 drones quase não muda (19323 a 18481): com poucos drones a recarga, e não a viagem, domina.
    - Para o texto: E3 reporta (1) cobertura só com a base e o mínimo de estações por escala, (2) makespan e energia do mínimo até mínimo + 3.
- [ ] **Escalas 16, 28 e 40 (ideia de 3/11, substituída pela decisão acima).** Teste rápido (1 run, todos os paletes, densidade de 0,35 palete por célula do chão, Cooperative e CBS):
  - 16: 90 paletes, 2 empilhadeiras, cerca de 0,5 s por cenário.
  - 28: 274 paletes, 4 empilhadeiras, cerca de 3 s por cenário (4 drones: makespan 4431, 8 drones: 2136).
  - 40: 560 paletes, 6 empilhadeiras, 11 a 17 s por cenário. Com 8 drones cobre tudo (makespan 5941). Com 2 drones para em `MAX_TIMESTEPS = 10 000` com 40% de cobertura, e com 4 drones também passaria do limite (cerca de 12 000 ticks).
  - Zero colisões e zero fallbacks do CBS em todos.
  - 64 (para o E5, medido com `MAX_TIMESTEPS` temporariamente em 60 000): 1434 paletes, 10 empilhadeiras, cerca de 3 min por cenário com os dois planejadores. Makespan 24 279 (8 drones), 12 008 (16), 5947 (32). Planejamento de 60 a 66 s no Cooperative e de 106 a 112 s no CBS, quase sem depender do número de drones. Cobertura 100%, zero colisões e fallbacks, e CBS a menos de 0,2% do Cooperative.
  - Tamanho da célula não está definido em lugar nenhum. Se uma célula for uma posição de palete (cerca de 1,2 a 1,5 m), 40 dá uns 60 × 60 m e 64 uns 96 × 96 m, com racks de cerca de 12 m. Definir no Setup e procurar referência para o tamanho típico de um armazém (o usuário decide).
  - Se adotar: subir `MAX_TIMESTEPS` (cerca de 30 000), trocar `SCALES`, refazer os renders da figura dos cenários, refazer a sensibilidade dos racks e conferir o preset `charging` (bateria 30 com δ_safe 20 pode não alcançar o fundo de um armazém 40).
- [x] **Execução paralela** (`--workers n` ou `auto` = núcleos − 1, padrão 1). Cada processo roda cenários inteiros com o próprio gerador aleatório, e os registros voltam na ordem dos cenários. Conferido em 3/11: preset `full` só com Cooperative (360 runs) deu `runs.csv` idêntico com 1 e 13 workers, tirando `planningMs`, e levou 42 s vs 9 s. Mas o tempo de planejamento médio por run subiu de 112 ms para 273 ms (2,45×) com 13 workers. Regra: E1, E2 e E3 em paralelo, E4 e E5 (onde o tempo de planejamento é métrica) com 1 worker. `summary.json` grava o número de workers.
- [x] Script que gera as figuras a partir de `runs.csv`, salvo no repo do paper (16/11): `figstyle.py` (estilo comum), `results_e2.py` (Fig. 4, Cluster contra 1-para-1, makespan, energia e tempo ponderado, um painel por N), `results_e3.py` (Fig. 5) e `results_tables.py` (corpo LaTeX das tabelas do E1 e do E4, com adaga quando o Wilcoxon pareado dá p ≥ 0,05, e o Naive só com colisões, porque drones perdidos encerram cedo). Testados com os dados de α = 1 e com uma rodada pequena do E4. As saídas finais saem quando terminarem as rodadas com α = 0,5.
  - [x] E3 (16/11): `figures/results_e3.py` no repo do paper lê o `runs.csv`, desenha a variação pareada do makespan (média ± IC 95%) contra o mínimo de sites de cada escala (1, 2, 4), um painel por N, uma linha por enxame (rampa de azul + marcador, legível em cinza), e sombreia os sites com cobertura < 100%. Grava os valores em `figures/data/e3_makespan.csv`. PDF com fontes TrueType (não Type 3). Largura de uma coluna. Ainda não está no `paper.tex`. Confere com a análise de 3/11 (64 × 32 drones, +3 estações: −45,5%).

### 5.3 Experimentos (mínimo 10 repetições por célula, idealmente 20)

- [ ] **E1. Alocação:** Hungarian vs greedy vs nearest vs random. 16/32/64, 2 a 32 drones, cobertura total, com e sem ida e volta. Métricas: makespan, energia, soma de custos, `priorityScanTime` e `meanScanTime`.
  - **Rodado em 16/11** (commit 6ad8708, 13 workers): 2400 runs (1200 com volta, 1200 sem), zero falhas, zero incidentes, cobertura 100% em todos. Resultados em `bench-results/e1-return-2026-11-16/` e `bench-results/e1-noreturn-2026-11-16/`.
  - Com volta, variação pareada contra o Hungarian no 16/32/64: makespan e energia empatam (|Δ| ≤ 1,4%). `priorityScanTime`: Greedy ≈ 0, Nearest +15,7/+4,0/+1,2%, Random +28,9/+9,6/+2,8%.
  - **Sem volta, o Nearest ganha do Hungarian em tudo:** makespan −5,6/−17,4/−27,7%, energia −6,8/−19,3/−29,8%, e até o `priorityScanTime` −13,8% no 32 e −23,4% no 64 (+2,0% no 16). Random +46 a +84% de makespan. Greedy ≈ Hungarian (≤ 1,5%), então o problema está na função de custo, não no solver.
  - **Investigação da função de custo (16/11, subconjunto: 16 e 64, 4 e 16 drones, 5 repetições, zero incidentes).** O conjunto de candidatos é o mesmo para todos os métodos (os primeiros max(4·ociosos, 20) paletes na ordem do gerador). Variantes contra o custo atual (w₁d + w₂b)/π, sem volta, no 64 com 4/16 drones: sem prioridade (π ignorado) makespan −28,8/−23,7%, `priorityScanTime` −27,4/−21,8%; dividir por √π: −20,0/−14,6% e −19,8/−15,7%; prioridade somada (+0,25(1−π)): ≈ igual ao atual (+0,1 a +4,8%). Com volta, sem prioridade piora o `priorityScanTime` em +13,4% no 16 (o Nearest também, +12,9/+13,4%), e √π fica a +0,8/+1,8%. Leitura: dividir por π faz o drone atravessar o armazém atrás do palete urgente. Sem volta isso custa mais viagem do que ganha em espera, e piora até a métrica de prioridade. √π fica melhor que o atual nos dois modos.
  - **Varredura do expoente (16/11), custo C/π^α, mesmo subconjunto, zero incidentes.** Sem volta, 64 com 4/16 drones, makespan contra α = 1: α = 0 −28,8/−23,7%, α = 0,25 −26,2/−20,8%, α = 0,5 −20,0/−14,6%, α = 0,75 −12,2/−6,4% (Nearest −28,0/−23,0%). `priorityScanTime` acompanha (α = 0,5: −19,8/−15,7%). Com volta, o makespan e a energia não mudam (|Δ| ≤ 3,9%), e o `priorityScanTime` no 16 com 4/16 drones fica: α = 0 +13,4/+13,4%, α = 0,25 +3,6/+4,8%, α = 0,5 +0,8/+1,8%, α = 0,75 +0,2/−0,2%. Recomendação: α = 0,5 (mantém cerca de 90% do efeito da prioridade com volta e recupera cerca de 2/3 do ganho do Nearest sem volta). Se adotado, mudam a Eq. 15 e os resultados de E1, E2 e E3 (todos usam o custo), então os três precisam rodar de novo (cerca de 50 min). **Decisão do autor (16/11): α = 0,5.** As rodadas com α = 0,5 gravam o commit 00f1577 no `summary.json`. Esse commit depois recebeu amend só no checklist, então o código é o mesmo do commit "feat(alloc): cost divides by the square root of the priority" no histórico. `PRIORITY_EXPONENT` no `SimulationConfig.ts`, Eq. 15 do paper com π_k^α. E1, E2, E3 e E4 rodam de novo com o custo novo. Os resultados de E1 e E2 acima (α = 1) ficam como referência.

- [ ] **E2. Clusters:** 1-para-1 vs Cluster. Variar raio (3, 5, 7) e tamanho máximo (2, 3, 4, 6).
  - **Rodado em 16/11, com o custo atual (α = 1)**, com volta à base, 13 workers. A primeira tentativa morreu em 2728/3900 quando a sessão do Claude fechou (o processo filho foi encerrado junto). A segunda completou 3900 runs em 1459 s, com zero falhas, zero incidentes e cobertura 100%. Resultados em `bench-results/e2-2026-11-16/`.
  - Cluster (r = 5, m = 3) contra 1-para-1, pareado, 2/8/32 drones: makespan 16: −49,9/−46,3/−38,3%, 32: −53,7/−52,6/−48,9%, 64: −55,5/−55,2/−54,2%. Energia −50,6 a −56,2% em todas as células. `priorityScanTime` 16: −50,7/−49,5/−32,8%, 32: −59 a −61%, 64: −65%.
  - Sensibilidade, energia no 64 com 8 drones: r = 3: m 2/3/4/6 = −37,0/−46,7/−49,5/−50,5%; r = 5: −42,8/−56,0/−62,0/−66,5%; r = 7: −45,7/−60,6/−67,7/−74,6%. Clusters maiores e raios maiores economizam mais, sem saturar até m = 6.
  - Se o custo mudar para √π, o E2 precisa rodar de novo.
- [x] **E3. Recarga:** preset `e3` (1 a 7 pontos de recarga, posicionamento por cobertura, bateria 30). Rodado em 3/11: 2100 runs (3 escalas × 5 enxames × 7 sites × 20 repetições, Cooperative), 241 s com 13 workers, resultados em `bench-results/e3-2026-11-03/`. Zero falhas, colisões, baterias esgotadas e drones presos.
  - Mínimo de sites: 1 no 16 (100 de 100 cenários), 2 no 32 (100), 4 no 64 (91, e 5 nos outros 9). Cobertura só com a base: 100% no 16, 84% a 89% no 32, 23% a 27% no 64. No 64: 90% com 2 sites, 96% com 3, 99,9% a 100% com 4.
  - Makespan, variação pareada contra o mínimo (média ± IC 95%), com +3 estações: 16: −17% (2 drones), −7% (4), −2% (8), 0% (16 e 32, as estações quase não são usadas). 32: −7%, −15%, −15%, −9%, −9% (2 a 32 drones). 64: −4%, −7%, −17%, −28%, −46%. Com +6 no 16: −18%, −12%, −10%. Com +5 no 32: −7%, −16%, −18%, −15%, −11%.
  - Energia com +3: 64: −4%, −7%, −16%, −16%, −6%. 32: −7%, −15%, −16%, −10%, −5%.
  - Leitura: no 64 o ganho cresce com o enxame (até −46% com 32 drones), no 16 cai com o enxame. Ainda não investigado por quê (hipótese: com muitos drones cada um lê poucos paletes, e a ida e volta até a base pesa mais no tempo de cada um).
 Métricas: makespan, energia, visitas e ticks nas estações.
- [x] **E1 a E3 com α = 0,5 (16/11), resultados em `bench-results/*-a05-2026-11-16/`.** 8400 runs (E1 2400, E2 3900, E3 2100), zero falhas e zero incidentes. Cobertura 100% em E1 e E2. As figuras e a tabela do E1 foram geradas com esses dados (repo do paper, `figures/`).
  - **E1, Hungarian com α = 0,5 contra α = 1** (mesmas sementes): sem volta, makespan −5,2/−13,7/−20,5%, energia −6,6/−14,7/−22,3%, `priorityScanTime` −1,7/−11,2/−18,1% (16/32/64). Com volta não muda (|Δ| ≤ 1,5%).
  - **E1, baselines contra o Hungarian (α = 0,5).** Com volta: makespan empata (|Δ| ≤ 0,7%), `priorityScanTime` Nearest +14,0/+4,3/+1,3%, Random +27,1/+9,9/+2,9%, Greedy −0,8 a −0,2%. Sem volta: Nearest ainda ganha no makespan no 32 e no 64 (−4,3/−8,9%, era −17,4/−27,7% com α = 1) e no `priorityScanTime` (−3,0/−6,5%, era −13,8/−23,4%), mas perde no 16 (+3,7%). Random +55 a +132% de makespan. Greedy +0,8 a +2,1%.
  - **E2 com α = 0,5:** praticamente igual ao de α = 1 (com volta). Cluster contra 1-para-1, 2/8/32 drones: makespan 16 −49,9/−47,0/−38,9%, 32 −53,7/−52,7/−49,1%, 64 −55,5/−55,2/−54,2%. Energia −50,6 a −56,2%. `priorityScanTime` 16 −50,9/−49,9/−35,8%, 32 −59 a −61%, 64 −65%.
  - **E3 com α = 0,5:** +3 estações além do mínimo, 2/4/8/16/32 drones: 16 −16,3/−10,7/−8,7/+0,2/0,0%, 32 −6,1/−13,5/−15,3/−10,1/−3,1%, 64 −5,5/−8,4/−17,4/−31,7/−44,5%. Mesma tendência de α = 1.
  - **Achado sobre a cobertura do E3:** no 64, com exatamente o mínimo de sites (4, ou 5 em 1 caso), 21 de 700 runs leram 1430 a 1433 dos 1434 paletes (99,7 a 99,9%). Já acontecia com α = 1 (cobertura parecida nas mesmas sementes). Acima do mínimo a cobertura é 100%. **Causa encontrada (16/11):** bug no posicionamento das estações. A distância da base era medida a partir da borda da zona reservada da base, que tem 1 célula de folga em volta das docas, então o drone parecia sair até 4 células mais perto. Exemplo (64, 2 drones, 4 sites, repetição 1): o palete em (29, 6, 11) precisa de 10,16 unidades do melhor carregador, o limite é 10, e o drone corretamente não foi. Corrigido: a distância é medida das docas reais (`StationCoverage.docks`), com teste novo. Com a correção, o mínimo no 64 é 4 em 73 de 100 cenários, 5 em 25 e 6 em 2 (antes 91 e 9), e a rodada acima lê todos os paletes. O E3 vai de 1 a 9 sites (para cada cenário ter +3 além do próprio mínimo) e roda de novo depois do E4, para não atrapalhar a medição de tempo do E4. A figura do E3 deve passar a usar o mínimo de cada cenário como referência.
- [x] **E4 e E3 com a correção das docas (16/11, terminaram às 16:49).**
  - Proveniência: o `summary.json` grava o commit no fim da rodada, então E4 e E3 registram 6d0af23. O E4 carregou o código no início (antes da correção das docas, que não afeta o E4, com só a base), e o E3 rodou com a correção.
  - **E4** (`bench-results/e4-a05-2026-11-16/`, 1 worker, 1200 runs, 1 h 50 min): zero falhas. Naive: 119,3 colisões drone-drone por run e 298 de 300 runs com cobertura < 100% (drones perdidos). Cooperative, Energy Saver e CBS: zero incidentes, cobertura 100%. Contra o Cooperative, 8/32 drones: Energy Saver makespan −0,1/−0,2% (n.s.), CBS −0,3/−0,7% (p < 0,05), soma de custos CBS −0,1/−0,3%. CBS caiu no fallback 3 vezes em 300 runs.
  - **E5** (dos runs do E4): tempo de planejamento por missão, Cooperative/CBS. N = 16: 0,04 a 0,06 s / 0,05 a 0,07 s. N = 32: 0,47 a 1,17 s / 0,75 a 1,53 s. N = 64: 8,2 a 42,7 s / 11,8 a 67,1 s. O tempo cai com mais drones (2 → 32 drones no 64: 42,7 → 8,2 s), e o CBS custa cerca de 1,3 a 1,6 vezes o Cooperative.
  - **E3 com a correção** (`bench-results/e3-fix-2026-11-16/`, 1 a 9 sites, 2700 runs): zero falhas e zero incidentes, cobertura 100% em todos os runs a partir do mínimo de cada cenário. Só a base: 100% no 16, 78,5 a 92,5% no 32 (média 85,7%), 19,5 a 29,9% no 64 (média 24,1%). Mínimo: 1 no 16, 2 no 32, 4/5/6 no 64 (73/25/2 de 100). +3 estações além do mínimo, 2/4/8/16/32 drones: 16 −16,3/−10,7/−8,7/+0,2/0,0%, 32 −6,1/−13,5/−15,3/−10,1/−3,1%, 64 −4,0/−7,1/−15,3/−27,1/−44,7%.
- [ ] **E4. Planejadores vs densidade:** Naive vs Cooperative vs Energy Saver vs CBS, 4 a 32 drones (o teto não aumenta a densidade, ver achado acima). Métricas: soma de custos, makespan, tempo de planejamento, nós do CBS, fallbacks, falhas. Teste preliminar de 2/11 (S-12, 3 repetições, teto alto): CBS ganha até 1,5% em soma de custos e é cerca de 1,5× mais lento, com zero fallbacks.
- [ ] **E5 (opcional). Escalabilidade:** tempo de planejamento vs número de drones e de paletes. Sai dos dados do E4, que já roda com 1 worker.
- [ ] Confirmar zero colisões e zero baterias esgotadas em todos os cenários seguros. Se alguma aparecer, investigar antes de escrever.

### 5.4 Figuras e tabelas planejadas

Plano revisto em 2/11: uma figura do problema e um diagrama da solução, e os resultados juntos numa figura de dois painéis. Fontes e geradores em `figures/` no repo do paper (SVG e PDF vetorial, Times).

- [x] Fig. 1: problema. Vista isométrica do cenário S-12 (seed 42), com os três desafios numerados. Na Introdução, depois do primeiro parágrafo.
- [x] Fig. 2: diagrama da solução (loop por eventos: alocação, recarga, planejamento por trecho, atualização, com a tabela de reservas espaço-tempo). Na Seção IV.
  - Compactada em 16/11: blocos de entrada mais baixos, estágios mais juntos e a saída numa linha só, com a altura indo de 228 para 186 pt (−18%) sem perder informação. A pedido do autor, o rótulo INPUTS fica em pé na frente dos blocos, OUTPUT fica na mesma linha dos blocos de saída, e o último bloco voltou a se chamar "Metrics". Legenda encurtada de 4 para cerca de 2,5 linhas (o resto já está no primeiro parágrafo do Método).
- [x] Figura dos cenários (largura total, Seção V): renders do simulador dos três armazéns com todas as prateleiras cheias, mais close-ups do drone, da empilhadeira e do rack renderizados sozinhos. Captura em `figures/scenarios_capture.mjs` (repo do paper) e `paper/figure-renders/` (aqui). É a 4ª figura, então o texto precisa encolher.
  - Refeita em 3/11 (ideia do autor): (a) exemplo 10 × 10 com os close-ups do palete, da empilhadeira e do drone, (b) a (d) os armazéns dos experimentos, 16, 32 e 64, numa linha só (painéis com cerca de 86 pt de altura, antes 112). Os renders mostram todas as prateleiras cheias (111, 482 e 1986 paletes na UI, contra cerca de 90, 358 e 1434 no benchmark), e a legenda diz isso. Empilhadeiras geradas: 1, 2, 5 e 10. O slider de grid da UI agora vai até 64, e a captura ganhou `SIM_URL` e `TILT` (arrasta a câmera para cima nos grids grandes, cuja vista padrão é rasa).
- [ ] **Plano das figuras de resultados (aprovado em 16/11, revisar o espaço quando todos os resultados estiverem prontos):** três figuras de uma coluna no mesmo estilo (um painel por N, rampa de azul + marcador, variação pareada com IC 95%) e uma tabela.
  - Tabela II, em cima: E1, Greedy/Nearest/Random contra o Hungarian (makespan, energia, `priorityScanTime`), com e sem volta. Embaixo: E4, colisões do Naive, e CBS e Energy Saver contra o Cooperative (makespan, soma de custos) com 8 e 32 drones. Gerada por script a partir do `runs.csv`.
  - Fig. 4 (E2): x = drones, y = variação de energia (ou makespan) do Cluster (r = 5, m = 3) contra o 1-para-1. A sensibilidade a r e m vai numa frase, ou em linhas extras se algum valor se destacar.
  - Fig. 5 (E3): pronta (`results_e3.py`).
  - Fig. 6 (E5): tempo de planejamento vs drones, uma linha por N, Cooperative e CBS em dois painéis, eixo y log.
  - Plano B se faltar espaço: juntar a Fig. 4 e a Fig. 5 numa figura de largura total, ou o E5 vira uma frase. O formato do E1 e do E2 depende dos dados (diferenças pequenas cabem na tabela).
- [ ] CBS vs Cooperative em densidade crescente: entra na Tabela II.
- [x] Tabela I: virou a tabela dos experimentos E1 a E5 (`tab:experiments`, 3/11). Os parâmetros do modelo ficam no texto do Método e do Setup, para poupar espaço.
- [ ] Tabela II: resultados (E1 alocação, mais CBS vs Cooperative do E4).

## 6. Escrita

- [x] Baixar o template LaTeX do MIPRO e montar o esqueleto das seções. O paper fica no repo do Overleaf, clonado em `paper/Paper_MIPRO_Planning_Warehouse/`.
- [x] Título, autores, afiliação, abstract e keywords no `paper.tex`.
- [x] I. Introdução: rascunho com citações. Rever depois dos resultados. Falta confirmar o "few" da lacuna e decidir sobre o link do código (C5).
- [x] II. Related work: rascunho em quatro parágrafos (drones em armazém, alocação, MAPF, alocação + path finding + energia). Falta checar se os trabalhos de armazém modelam conflitos.
- [x] III. Formulação: rascunho em sete parágrafos (grid, drones, tarefas, empilhadeiras, energia e recarga, conflitos, objetivo), com a notação do `SimulationConfig.ts`. Falta resolver o tempo de leitura (ver abaixo).
- [x] IV. Método: rascunho com abertura que percorre a Fig. 2 e as quatro subseções (custo e viabilidade com as equações de energia, viabilidade e custo, clusters, planejadores, recarga). Tem cerca de 920 palavras, uns 0,5 página acima do orçamento. Cortar depois.
- [ ] IV. Pseudocódigo do loop por eventos (`SimulationManager.runPathfinding`): ficou de fora por espaço. Decidir se entra.
- [x] V. Setup: escrito em 3/11 (ver seção 4). Falta o link e a versão do código.
- [ ] VI. Resultados: só números do commit atual, com média ± IC95 e resultado dos testes estatísticos.
  - 16/11: escritos os parágrafos do E1 (Tabela II, `tab:e1`, com o efeito de α) e do E2 (Fig. `fig:e2`, com a sensibilidade a r e m), com os números de `bench-results/*-a05-2026-11-16/`. A figura do E3 já está no texto, mas o parágrafo é `\todo` até a rodada com a correção das docas. E4 e E5 são `\todo`. A Tabela do E4 vira Tabela III. **16/11, à noite: Seção VI completa.** Parágrafos do E3 (cobertura só com a base, mínimo de sites, +3 estações, 0,8 visitas a estações por run no 16 com 32 drones), do E4 (Tabela III `tab:e4`) e do E5 (Fig. `fig:e5`), mais a frase de abertura com os 9900 runs coordenados de E1 a E4. A causa da queda do tempo de planejamento com mais drones não foi verificada, e o texto só descreve o fato. Floats na Seção VI: Tabela II, Fig. E2, Fig. E3, Tabela III, Fig. E5. Falta conferir o espaço no Overleaf (6 páginas). Scripts prontos e testados (16/11): `results_e3.py` agora compara cada cenário com o próprio mínimo de sites (eixo x "min., +1, +2, +3", título com o mínimo de cada N), e `results_e5.py` desenha o tempo de planejamento por mission contra o número de drones (Cooperative A* e CBS, uma linha por N, eixo y log), a partir do `runs.csv` do E4.
- [x] VII. Limitações: escritas em 16/11 (parágrafo "Limitations" na Seção VII, cerca de 200 palavras): grid sem dinâmica nem tamanho físico de célula, energia sem velocidade nem carga, empilhadeiras com rotas conhecidas e periódicas, planejamento offline, colisões e baterias checadas depois do planejamento (zero nos planejadores coordenados, mas não impossíveis por construção), janela de candidatos e CBS ótimo só por ciclo, posicionamento guloso das estações (limite superior), margem fixa de 20 unidades, um α para os dois modos, grid até 64. Falta a parte de discussão dos resultados (`\todo`).
- [x] Conclusão e discussão escritas em 16/11. Discussão (início da Seção VII): o ganho da alocação vem do custo e da verificação de energia, α troca urgência por viagem (com α = 0,5 o Nearest ganha no máximo 9% de makespan sem volta), clusters dão o maior ganho (cerca de metade), estações importam com armazém grande e enxame grande, CBS fica a menos de 1% com 30 a 60% mais tempo de planejamento. Conclusão: método, números principais (zero colisões nos coordenados, clusters cerca de −50%, estações até −45%) e trabalhos futuros (replanejamento online, margem relativa à bateria, α que depende de o drone voltar ou não). Abstract do paper reescrito em 16/11 com os resultados finais (195 palavras, limite do portal 200): custo com √π, estações posicionadas por cobertura, zero colisões nos coordenados, clusters cerca de metade, +3 estações até −45% no 64, CBS menos de 1% com 1,3 a 1,6 vezes o tempo. **O abstract submetido no portal (2/11) ainda fala em 24 drones e 200 paletes, e precisa ser atualizado no portal pelo autor.**
- [x] Referências: 21 no `.bib`, sem arXiv, incluindo 4 self-citations. Falta página e DOI do Bavaro e Amigoni (ECMR 2025).
- [ ] Referências novas: o Luiz define as citações. Preparar palavras-chave de busca para cada seção do related work: "multi-robot task allocation survey", "Hungarian algorithm multi-robot assignment", "conflict-based search multi-agent path finding", "prioritized planning multi-agent", "UAV warehouse inventory RFID", "drone charging station scheduling", "mTSP clustering UAV".

### TODOs abertos no `paper.tex`

16/11: Wilcoxon citado (Wilcoxon 1945, Biometrics Bulletin 1(6):80–83, a pedido do autor). Metrics ganhou a frase de que o simulador refaz a bateria de cada drone ao longo do caminho e conta as que chegam a zero (item do checklist sobre mortes de bateria). Sobra só o TODO da L89 (Related Work).

Cada `\todo` vermelho no texto tem um item aqui. Tirar o `\todo` do texto e marcar aqui quando resolver.

- [x] Introdução: "few" confirmado (16/11). Busca na literatura não achou trabalho que junte alocação com energia, carregadores de um drone só e empilhadeiras com drones em 3D. Mais próximos: Choudhury et al. (entrega com drones, MAPF com bateria, ao ar livre), Electronics 2026 (MAPF com energia e disputa de carregadores, robôs de chão), IEEE 10445457 (multi-UAV, mTSP + RL sem conflitos), review MDPI Drones 2026 (empilhadeiras e agendamento de carga como problemas em aberto). Citar Choudhury junto ao Bavaro é opcional (o autor decide). TODO tirado do texto.
- [x] Código aberto (16/11): o autor decidiu liberar em https://github.com/luizgiacomossi/Multi-Agent-UAV-Warehouse. C5 diz "open-source simulator" e o link está em Implementation (Seção V).
- [x] Related Work (16/11): respostas do Gemini conferidas nas fontes. Thomaidis 2024: um drone, laboratório. Kwon 2020: um quadricóptero, armazém real. Han 2022 (Remote Sensing, o citado; o Gemini respondeu sobre outro Han, Sensors and Materials): até 10 UAVs em simulação, "The aisle is wide enough to prevent collisions between UAVs", sem veículos de chão, bateria só via distância. Malang 2023 é revisão. Frase nova: "These studies fly a single drone [thomaidis, kwon] or assume aisles wide enough for the drones never to meet [han]. None of them models moving ground vehicles or plans recharging." Achado: Zhao et al. 2024 (IEEE IoT Journal, doi 10.1109/JIOT.2024.3370152) faz alocação (mTSP) e caminhos sem conflito (MARL) para UAVs heterogêneos em inspeção de carga em armazém, simulação. É o trabalho mais próximo do nosso. O resumo não fala de bateria. Citado no Related Work a pedido do autor (16/11), sem afirmar nada sobre bateria (o resumo não fala). Todos os TODOs do paper.tex resolvidos.
- [x] Formulação (tarefas): o scan não ocupava passos no caminho. Resolvido no código (3 passos), e o texto diz isso.
- [x] Método (recarga): contadores `stationLegFailures` e `stationFallbacks` adicionados (16/11). E3 rodado de novo (`bench-results/e3-legs-2026-11-16/`, 2700 runs, makespans idênticos ao e3-fix): 192 162 idas a estações, 0 trechos com falha, 0 recargas desviadas para a base. Texto diz isso e explica o retry (paira 3 passos, depois de 5 falhas carrega na base).
- [x] Método (custo): o texto diz D_max = 2N. Resolvido, o código agora define `dMaxFor(N) = 2N`.
- [x] Setup: sensibilidade dos racks refeita (16/11, `bench-results/racks-2026-11-16/`, 180 runs, 16/32/64, 8 drones, 10 repetições, 1-para-1 e Cluster r=5 m=3, níveis 8/12/16, α=0,5). Mudança média contra 8 níveis: makespan +0,9 a +13,7%, energia +0,9 a +16,4% (maior no Cluster e no 16 níveis). Cluster economiza 50,5/54,3/56,2% de energia com 8 níveis e 48,4 a 53,7% com 12 ou 16. Zero incidentes, cobertura 100%. Texto: "raise the makespan and the energy by 1 to 16% on average, and the cluster allocation still saves 48 to 56% of the energy".
- [ ] Resultados (E1): o `\todo` diz que o Greedy ficou a menos de 2% do Hungarian e que o ganho vem da função de custo. Confirmar na rodada final antes de escrever.
- [ ] Seções VI a VIII: ainda são só `\todo` (a V foi escrita em 3/11).

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
