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

## 5. Trabalho no código e experimentos

### 5.1 Correções e ajustes antes de rodar

- [ ] Rodar de novo todos os benchmarks no commit atual. Os resultados em `bench-results/` são de antes da mudança nas faixas dos empilhadeiras (1/10, 18:33) e não podem ir para o paper.
- [ ] Registrar o hash do commit e a versão do Node usados em cada experimento.
- [ ] Inconsistência de distância: a alocação usa Euclidiana × γ, e o planejador usa passos Manhattan no grid. Corrigir ou justificar no texto.
- [ ] `D_MAX` não é usado. O código usa `world.size * 2`. Alinhar código e texto.
- [ ] Prioridade em modo `mixed` vai só de 0,10 a 0,59. Decidir se fica assim e descrever.
- [ ] `t_hover = 5` só entra na estimativa de energia, e o scan não ocupa ticks no caminho. Corrigir ou declarar no texto.
- [ ] Decidir sobre Naive e Energy Saver: entram nos experimentos ou saem do paper?
- [ ] Não usar os experimentos "Exp 2 Monte Carlo" e "Exp 3 fault" da UI. O de falha é um stub.

### 5.2 Funcionalidades novas

- [ ] **Baselines de alocação** (essencial, revisor vai pedir): greedy por custo, tarefa mais próxima, aleatório. Opcional: leilão simples (sequential single-item auction).
- [ ] **Opção `--altitude` no benchmark** (hoje `runScenario` usa o tamanho do grid como teto). Necessária para o E4.
- [ ] Opcional: corredores de 1 célula ou outro jeito de aumentar a densidade de conflitos.
- [ ] Teste estatístico pareado no `bench/report.ts` (Wilcoxon signed-rank, já que os cenários são pareados por semente).
- [ ] Script que gera as figuras a partir de `summary.csv` (matplotlib ou similar), salvo no repositório.

### 5.3 Experimentos (mínimo 10 repetições por célula, idealmente 20)

- [ ] **E1. Alocação:** Hungarian vs greedy vs nearest vs random. S/M/L, 2/4/8 drones, cobertura total. Métricas: makespan, energia, soma de custos.
- [ ] **E2. Clusters:** 1-para-1 vs Cluster. Variar raio (3, 5, 7) e tamanho máximo (2, 3, 4, 6).
- [ ] **E3. Recarga:** preset `charging` (1, 2, 3, 5 pontos de recarga). Métricas: makespan, energia, visitas e ticks nas estações.
- [ ] **E4. Planejadores vs densidade:** Cooperative vs CBS, 4 a 32 drones, teto de altitude alto vs baixo. Métricas: soma de custos, makespan, tempo de planejamento, nós do CBS, fallbacks, falhas. Teste preliminar de 2/11 (S-12, 3 repetições, teto alto): CBS ganha até 1,5% em soma de custos e é cerca de 1,5× mais lento, com zero fallbacks.
- [ ] **E5 (opcional). Escalabilidade:** tempo de planejamento vs número de drones e de paletes.
- [ ] Confirmar zero colisões e zero baterias esgotadas em todos os cenários seguros. Se alguma aparecer, investigar antes de escrever.

### 5.4 Figuras e tabelas planejadas

- [ ] Fig. 1: arquitetura (alocação → planejamento por trecho → reservas → detecção de colisão → playback).
- [ ] Fig. 2: makespan vs número de drones (1-para-1 vs Cluster), com barras de erro.
- [ ] Fig. 3: makespan e energia vs número de pontos de recarga.
- [ ] Fig. 4 ou tabela: CBS vs Cooperative em densidade crescente.
- [ ] Tabela I: parâmetros do modelo (β_fly, β_hover, γ, δ_safe, λ, w1, w2, escalas S/M/L).
- [ ] Tabela II: comparação entre métodos de alocação (E1).

## 6. Escrita

- [ ] Baixar o template LaTeX do MIPRO e montar o esqueleto das seções.
- [ ] III. Formulação: notação igual à do `SimulationConfig.ts` (equações 13 a 18).
- [ ] IV. Método: pseudocódigo do loop de planejamento por eventos (`SimulationManager.runPathfinding`).
- [ ] V. Setup: semente, repetições, hardware, versão do código.
- [ ] VI. Resultados: só números do commit atual, com média ± IC95 e resultado dos testes estatísticos.
- [ ] VII. Limitações, ditas abertamente: modelo em grid sem dinâmica nem unidades físicas, empilhadeiras com rotas conhecidas, planejamento offline sem replanejamento durante a execução, CBS por janela de trechos (não ótimo para a missão inteira), escala até 24³ células.
- [ ] Introdução e conclusão por último.
- [ ] Referências: o Luiz define as citações. Preparar palavras-chave de busca para cada seção do related work: "multi-robot task allocation survey", "Hungarian algorithm multi-robot assignment", "conflict-based search multi-agent path finding", "prioritized planning multi-agent", "UAV warehouse inventory RFID", "drone charging station scheduling", "mTSP clustering UAV".

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
