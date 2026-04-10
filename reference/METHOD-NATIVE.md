# Método ARCH — Versão Nativa (Zero Plugins)

**Baseado em 200+ fontes, 11 agentes de pesquisa, abril 2026**
**Esta versão usa APENAS features nativas do Claude Code — sem CCG, ECC, BMAD, ou qualquer plugin.**

### Por que este método existe

O METR Study (RCT, 246 tarefas, 16 devs) demonstrou que desenvolvedores com AI foram **19% mais lentos**, mas **acreditavam ser 24% mais rápidos** — um gap de percepção de 43 pontos. Quanto mais experiência no codebase, mais a AI atrapalhava. *(METR, alexmayhew.dev)*

Sem metodologia, AI gera código mais rápido que humanos conseguem revisar. O resultado: PRs 154% maiores, bugs +9%, code duplication subindo de 8.3% para 12.3%, refactoring despencando de 25% para <10% das linhas modificadas. *(Faros AI, 10K+ devs; GitClear 2024)*

Este método existe para inverter essa equação: **gastar 70% do tempo definindo e verificando, 30% gerando código**. A disciplina é humana — a AI é a ferramenta.

---

## Verdades Universais (Regras Imutáveis)

Estas regras são consenso forte de múltiplas fontes independentes. Não são opinião — são dados.

### Contexto

| Regra | Evidência | Fonte |
|-------|-----------|-------|
| **Máximo prático de contexto: 60%** | Performance degrada após 40-60%. Auto-compaction em 80% já é tarde — entre 60-80%, qualidade degrada silenciosamente sem aviso. Não espere o auto-compaction; trate 60% como seu limite pessoal | Stanford "Lost in the Middle", van Deth |
| **Sessão produtiva: 8-10 mensagens** | Após ~10 mensagens, qualidade cai. Sessão nova > sessão longa | Múltiplos praticantes, Edevard Hvide |
| **Sweet spot de código ativo: 1,500-3,000 linhas** | Acima disso, agent perde coerência com constraints anteriores | AICourses, Morph LLM |
| **CLAUDE.md efetivo: <60 linhas** | Claude tem "budget de ~100-150 slots de instrução" — cada regra no CLAUDE.md, prompt, e spec compete pelo mesmo budget finito. Acima de 60 linhas, regras são ativamente ignoradas | DEV Community análise |
| **Hooks = 100% compliance; CLAUDE.md = ~80%** | Para regras inegociáveis, usar hooks nativos (PreToolUse/PostToolUse em `settings.json`, exit code 2 = bloquear). CLAUDE.md é sugestão; hooks são enforcement. Ver Apêndice B | DEV Community, Anthropic docs |
| **`.claudeignore` reduz contexto em 80%+** | Exclui pastas irrelevantes (vendor, node_modules, builds) do indexing automático. Sem isso, Claude gasta tokens lendo arquivos que nunca vai usar | Crosley 50-session study |
| **Prefira sessões novas com handoff a compaction** | `/compact` é lossy — summaries perdem nuance. Handoffs escritos em arquivo são lossless e sobrevivem entre sessões. Compactar é "salvar de desespero"; handoff é "salvar de posição de força" | Continuous Claude v3, van Deth |
| **Subagents economizam 93% de contexto** | Rodam em context window separado, retornam sumários. Mas: cada subagent carrega ~120K tokens de system prompt. Só spawn para investigações de 5+ arquivos ou que precisem de web search | systemprompt.io, TOOLS.md |
| **`/clear` entre tarefas não-relacionadas** | "Kitchen sink session" é o anti-pattern #1 da documentação oficial | Anthropic oficial |

### Metodologia

| Regra | Evidência | Fonte |
|-------|-----------|-------|
| **Spec antes de código — sempre** | Qualidade da spec é o fator #1 de qualidade do output | Osmani, Augment Code, GitHub Spec Kit |
| **Humano decompõe, AI auxilia** | AI não se auto-decompõe de forma confiável — gera tarefas vagas ou sobrepostas. O humano faz a decomposição principal; AI pode sugerir, humano revisa e ajusta | METR, Velichko, Violaris |
| **Tarefas de 5-15 minutos** | Muito pequenas = overhead de coordenação. Muito grandes = agent trabalha sem check-in | Bache, Superpowers, Velichko |
| **TDD: testes guiam a implementação** | AI tende a deletar/enfraquecer testes. TDD constrange escopo ao confiável. Variantes válidas: clássico (RED→GREEN separados) ou combinado (test+implementação em par). Ver Fase 4 | Beck, Bache, Codemanship |
| **Micro-commit ANTES de cada prompt** | Cria rollback instantâneo. O hábito protetor mais citado em toda a pesquisa | Múltiplas fontes, CodePup.ai |
| **Recovery em 4 níveis** (não binário) | 1) Retry com contexto ajustado → 2) Rollback ao checkpoint → 3) Delegar a subagent → 4) Escalar ao humano com diagnóstico | Morph LLM, CodePup.ai |
| **70/30: 70% definição+verificação, 30% execução** | Devs bem-sucedidos inverteram a proporção tradicional | Osmani, Karpathy |
| **AI implementa padrões conhecidos, humano arquiteta** | "Brilhante em código, terrível em arquitetura." AI deve ser usada para implementação de padrões bem-entendidos, não para criar arquitetura nova | Reddit r/ClaudeAI, Gerus-lab |

### Anti-patterns (O que NUNCA fazer)

| Anti-pattern | Por quê | Fonte |
|--------------|---------|-------|
| **"Product prompts"** (descrição vaga → código) | Produz implementações profundamente falhas | Velichko (iximiuz Labs) |
| **Prompts omnibus** (10 problemas numa mensagem) | Quase nenhum é resolvido | Velichko |
| **AI escrever código E testes juntos** | Produz testes tautológicos que testam a si mesmos | Augment Code |
| **Confiar sem verificar** | 45% do código AI tem vulnerabilidades, 1.7x mais bugs | Veracode, CodeRabbit |
| **Sessão longa sem /clear** | Context rot: performance degrada silenciosamente | van Deth, Stanford |
| **Corrigir indefinidamente** | Loop infinito: fix A cria bug B cria bug C. Padrão destrutivo #1 | CodePup.ai |
| **Aceitar sem git diff** | Agent pode tocar arquivos inesperados, remover features silenciosamente ("silent feature dropout") | antjanus.com |
| **Deixar AI enfraquecer testes** | AI deleta testes que falham (`it.skip`), enfraquece assertions, ou "trapaceia" com loops — em vez de corrigir a implementação | Kent Beck, antjanus.com |
| **Aceitar nomes inventados pela AI** | Claude inventa nomes de colunas, métodos, APIs em vez de verificar os reais. Sempre confirmar nomes com `Grep`/`Read` antes de usar | GitHub Issue #39703 |

---

## O Método: 6 Fases

```
┌─────────────────────────────────────────────────────────┐
│                    VISÃO GERAL                          │
│                                                         │
│  ① RESEARCH ──→ ② SPEC ──→ ③ DECOMPOSE ──→             │
│  ④ IMPLEMENT (loop por tarefa) ──→ ⑤ REVIEW ──→ ⑥ SHIP │
│                                                         │
│  Tempo ideal: 70% em ①②③⑤  |  30% em ④⑥              │
│  Se gastou menos tempo em ①②③ do que vai gastar em ④,  │
│  volte. Você está violando a regra 70/30.               │
└─────────────────────────────────────────────────────────┘
```

---

## Rastreio de Progresso (Tracking)

### O Problema

Pedir status duas vezes gera respostas completamente diferentes. Isso acontece porque a AI **gera** status da memória/contexto em vez de **ler** de um arquivo. O sistema de tasks nativo do Claude Code não resolve — `/clear` destrói tasks *(Issues #18081, #23316, #41667)*, e transições de Plan Mode orfanizam tasks ao criar novo sessionId.

**A solução:** Um arquivo de tracking **no filesystem**, lido (não gerado) a cada sessão. Arquivo no disco é a única persistência que sobrevive a `/clear`, compaction, e restart de sessão.

*(Validado por: Anthropic internal harness com `feature_list.json`; Beads/Hyperpowers com SQLite; Planning With Files com 96.7% pass rate; Kiro com `tasks.md` persistente)*

### Princípios de Design

| Princípio | Implementação |
|-----------|---------------|
| **Status é lido, nunca gerado** | AI lê `.ai/tracking/{feature}.md` — nunca gera status da memória |
| **Self-report é insuficiente** | AI marca tarefa como done → humano verifica com `git diff --stat` e test suite |
| **Arquivo > contexto** | O tracking file sobrevive a tudo; o contexto do chat não |
| **Serial para conflitos** | Campo `serial` no frontmatter incrementa a cada write — detecta edições concorrentes |
| **Gates são explícitos** | Checkpoints humanos marcados com `owner: human` e `status: pending` até aprovação |

### Arquivo de Tracking

Um arquivo Markdown com YAML frontmatter por feature. Criado na Fase 2, atualizado em cada transição de fase.

**Localização:** `.ai/tracking/{feature-slug}.md`

**Template inicial (criado no início da Fase 2):**

```markdown
---
feature: [nome-da-feature]
spec: docs/specs/YYYY-MM-DD-{nome}.md
spec_hash: [sha256 da spec]
phase: spec
created: YYYY-MM-DD
updated: YYYY-MM-DD
serial: 1
---

# [Nome da Feature]

## Gates

| Gate | Status | By | Date | Notes |
|------|--------|----|------|-------|
| G1: Spec aprovada | pending | - | - | - |
| G2: Tasks aprovadas | pending | - | - | - |
| G3: Review aprovado | pending | - | - | - |

## Contracts

_Nenhum contrato ainda._

## Tasks

_Aguardando decomposição (Fase 3)._

## Review

_Aguardando implementação._

## Reconcile

_Aguardando ship._

## Session Log

| Date | Phase | Notes |
|------|-------|-------|
| YYYY-MM-DD | spec | Tracking file criado |
```

**Exemplo em progresso (mid-implementation):**

```markdown
---
feature: vulnerability-management
spec: docs/specs/2026-04-05-vulnerability-management.md
spec_hash: a1b2c3d4
phase: implement
created: 2026-04-05
updated: 2026-04-05
serial: 8
---

# Vulnerability Management

## Gates

| Gate | Status | By | Date | Notes |
|------|--------|----|------|-------|
| G1: Spec aprovada | approved | human | 2026-04-05 | Aprovada após adicionar EC03 |
| G2: Tasks aprovadas | approved | human | 2026-04-05 | 4 tasks, revisadas |
| G3: Review aprovado | pending | - | - | - |

## Contracts

- [x] `app/Contracts/VulnerabilityRepositoryInterface.php` @ abc1234
- [x] `app/DTOs/VulnerabilityData.php` @ abc1234
- [x] `app/Enums/RiskLevel.php` @ abc1234

## Tasks

### T1: Criar model e migration [done]
- **Owner:** ai | **Est:** 5 min | **Depends:** none
- **Files:** `migration`, `Vulnerability.php`
- **Commit:** abc1234 | **Tests:** pass | **Strikes:** 0
- [x] Model com fillable, casts, relationships
- [x] Migration com todas as colunas da spec
- [x] Factory funcional

### T2: Criar service com lógica de negócio [done]
- **Owner:** ai | **Est:** 10 min | **Depends:** T1
- **Files:** `VulnerabilityService.php`
- **Commit:** def5678 | **Tests:** pass | **Strikes:** 1
- [x] Cálculo de risk score (RN01)
- [x] Validação de transição de status (RN02)
- Note: Strike 1 — esqueceu import do RiskLevel enum

### T3: Criar Filament resource [in_progress]
- **Owner:** ai | **Est:** 15 min | **Depends:** T1, T2
- **Files:** `VulnerabilityResource.php`, `Pages/`
- **Commit:** - | **Tests:** - | **Strikes:** 0
- [x] Resource class com form e table
- [ ] Coluna risk score com cores
- [ ] Filtros por status e risk level

### T4: Adicionar permissões e policy [pending]
- **Owner:** ai | **Est:** 5 min | **Depends:** T1
- **Files:** `permissions.php`, `VulnerabilityPolicy.php`
- **Commit:** - | **Tests:** - | **Strikes:** 0
- [ ] Entries no config
- [ ] Policy com viewAny, view, create, update, delete
- [ ] Testes da policy

## Review

_Aguardando conclusão de todas as tasks._

## Reconcile

_Aguardando ship._

## Session Log

| Date | Phase | Notes |
|------|-------|-------|
| 2026-04-05 10:00 | research | Explorou models existentes, padrão em AssetResource |
| 2026-04-05 10:30 | spec | Spec escrita, aprovada após adicionar EC03 |
| 2026-04-05 10:45 | decompose | 4 tasks criadas, contracts commitados |
| 2026-04-05 11:00 | implement | T1 e T2 concluídas. T2 precisou 1 strike |
| 2026-04-05 11:25 | implement | T3 em progresso, 1/3 subtasks done |
```

### Regras de Status por Task

```
PARSING:
  ### T{n}: {nome} [{status}]
  status = a palavra entre colchetes

ESTADOS VÁLIDOS:
  pending      → task não iniciada (dependencies podem estar pendentes)
  blocked      → dependencies não concluídas
  in_progress  → em execução
  done         → testes passam, commit feito, git diff verificado
  failed       → 3+ strikes, rollback feito
  skipped      → removida do escopo (com justificativa)

TRANSIÇÕES:
  pending → blocked     (dependency não done)
  pending → in_progress (dependencies done, sessão iniciada)
  in_progress → done    (testes passam + commit + diff ok)
  in_progress → failed  (3 strikes + rollback)
  failed → in_progress  (re-prompt com abordagem diferente)
  any → skipped         (apenas por decisão humana)
```

### Como Consultar Status (Prompt)

**NUNCA peça status à AI sem apontar para o arquivo.** Use este prompt:

```
Leia o arquivo .ai/tracking/{feature-slug}.md e reporte:
1. Fase atual (do frontmatter `phase`)
2. Gates: quais aprovados, quais pendentes
3. Tasks: quantas done/in_progress/pending/failed
4. Próxima ação: qual task deve ser executada, ou qual gate precisa de aprovação humana
5. Blockers: algo impedindo progresso?

NÃO gere status da memória. LEIA o arquivo.
```

### Como Atualizar o Tracking

Após cada transição de fase ou conclusão de task, a AI deve atualizar o arquivo:

```
Atualize .ai/tracking/{feature-slug}.md:
1. Incremente `serial` no frontmatter
2. Atualize `phase` e `updated`
3. Atualize o status da task T[N] para [novo_status]
4. Adicione uma linha no Session Log
5. NÃO modifique tasks que não foram tocadas nesta sessão
```

### Hook: Auto-Injetar Tracking no Início de Sessão

Para que toda sessão nova comece sabendo o progresso atual, configure um hook `SessionStart`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "bash -c 'TRACK=$(ls .ai/tracking/*.md 2>/dev/null | head -1); if [ -n \"$TRACK\" ]; then echo \"📊 Feature tracking ativo: $TRACK\"; echo \"---\"; head -5 \"$TRACK\"; echo \"---\"; grep -E \"^### T[0-9]+:\" \"$TRACK\"; fi'"
      }
    ]
  }
}
```

Este hook mostra o frontmatter (fase atual) e a lista de tasks com status ao iniciar qualquer sessão. O Claude recebe isso como contexto e sabe exatamente onde continuar.

### Quando o Tracking é Necessário

| Complexidade | Tracking |
|-------------|----------|
| **Trivial** (1 arquivo) | Não necessário |
| **Simples** (1-2 arquivos) | Não necessário |
| **Média** (3-5 arquivos) | Recomendado |
| **Complexa** (6-10 arquivos) | Obrigatório |
| **Épica** (10+ arquivos) | Obrigatório (1 arquivo por sub-feature) |

---

### FASE 1: RESEARCH (5-15 minutos)

**Objetivo:** Entender o problema, padrões existentes, APIs relevantes, antes de qualquer código.

**Quando:** SEMPRE para features de 3+ arquivos. Pular apenas para fixes de 1 arquivo onde você já sabe o que fazer.

**Como:**

1. Entre em **Plan Mode** (Shift+Tab 2x)
2. Use o prompt template abaixo
3. Claude explora SEM fazer mudanças

**Regra de contexto:** Use **subagents** para exploração ampla (5+ arquivos, múltiplos diretórios). Leia arquivos diretamente apenas quando o escopo já é estreito. Pré-carregar 8-10 arquivos no início da sessão é um anti-pattern — consome 40-60% do context window antes de qualquer trabalho. *(Crosley, 50-session study)*

**Prompt Template — Research:**

```
Preciso implementar [DESCRIÇÃO DA FEATURE].

Antes de qualquer plano ou código, pesquise:

1. CODEBASE: Existe algo parecido já implementado? Quais padrões o projeto usa
   para features similares? (Glob e Grep nos diretórios relevantes)

2. DEPENDÊNCIAS: Quais models, services, migrations, e configs já existem
   que esta feature vai tocar ou estender?

3. PADRÕES: Como features similares foram estruturadas neste projeto?
   (Olhe 2-3 exemplos existentes)

4. DOCS: Se há dúvida sobre APIs de libs externas, busque na web
   a documentação oficial da versão utilizada no projeto.

5. RISCOS: Quais são os edge cases, conflitos com código existente,
   e dependências que podem quebrar?

Pesquise o codebase PRIMEIRO. Só use WebSearch quando precisar de docs
externos, comportamento versão-específico, ou quando o codebase não tem
exemplos do padrão necessário.

NÃO proponha solução ainda. Apenas apresente o que encontrou,
organizado por tópico, com file paths.
```

**Ferramentas nativas nesta fase:**
- **Plan Mode** (Shift+Tab 2x) — zero custo extra, Claude lê sem modificar
- **Subagent** (Agent tool) — para investigação ampla que consumiria contexto
- **WebSearch/WebFetch** — para docs de libs (Filament, Livewire, etc.)
- **Leitura direta de migrations/models** — para entender schema do banco

**Critério de saída:** Você entende o terreno. Sabe quais arquivos serão tocados, quais padrões seguir, e quais riscos existem.

**📊 Tracking:** Se a feature for Média+ (3+ arquivos), registre no Session Log: `| data | research | [resumo das findings] |`

---

### FASE 2: SPEC (10-20 minutos)

**Objetivo:** Documento escrito que define O QUE e POR QUÊ (não COMO). Fonte da verdade para toda a implementação.

**Quando:** SEMPRE para features de 3+ arquivos. Para features menores, um bloco de texto no prompt já serve como spec informal.

**Importante:** Após concluir a spec, **inicie uma sessão nova** (`/clear` ou nova instância do Claude Code) para a implementação. A sessão de spec já consumiu contexto com exploração e decisões — implementar na mesma sessão é context rot. *(Anthropic oficial, "Interview Pattern")*

**Prompt Template — Spec via Entrevista (recomendado):**

```
Com base na pesquisa que você fez, preciso que você me entreviste
sobre esta feature antes de escrevermos a spec.

Faça perguntas UMA POR VEZ sobre:
1. Requisitos funcionais (o que o usuário vê/faz)
2. Regras de negócio (validações, permissões, estados)
3. Edge cases (o que acontece quando X falha?)
4. UX (como o usuário interage? qual o fluxo?)
5. Dados (quais models/tabelas? relações?)
6. Integrações (APIs externas? jobs? events?)

Depois das perguntas, escreva uma spec em docs/specs/YYYY-MM-DD-{nome}.md
com: Objetivo, Requisitos, Regras de Negócio, Edge Cases, Arquivos Envolvidos,
Decisões Tomadas (com rationale), e Alternativas Rejeitadas.
```

**Alternativa — Spec com Múltiplas Perspectivas:**

Para features full-stack, peça análise de múltiplos ângulos numa única sessão:

```
Analise esta feature sob 3 perspectivas diferentes, SEPARADAMENTE:

PERSPECTIVA BACKEND:
- Quais models, migrations, services, jobs serão necessários?
- Quais validações e regras de negócio no servidor?
- Quais endpoints/routes?

PERSPECTIVA FRONTEND:
- Quais componentes de UI?
- Qual o fluxo de interação do usuário?
- Quais estados (loading, error, empty, success)?

PERSPECTIVA DADOS:
- Schema do banco: tabelas, colunas, tipos, indexes
- Relações entre entidades
- Dados iniciais / seeds necessários?

Após analisar as 3 perspectivas, identifique CONFLITOS ou AMBIGUIDADES
entre elas. Liste cada ambiguidade como uma pergunta para eu decidir.
```

**Formato da spec:**

```markdown
# Spec: [Nome da Feature]
Data: YYYY-MM-DD

## Objetivo
[1-2 frases: o que e por quê]

## Requisitos Funcionais
- RF01: [requisito]
- RF02: [requisito]

## Regras de Negócio
- RN01: [regra]
- RN02: [regra]

## Edge Cases
- EC01: [caso + comportamento esperado]

## Arquivos Envolvidos
- `app/Models/X.php` — novo model
- `app/Services/XService.php` — lógica de negócio
- `database/migrations/xxx.php` — nova tabela

## Decisões Tomadas
- [Decisão]: [rationale — POR QUÊ esta escolha e não outra]

## Alternativas Rejeitadas
- [Alternativa]: [por que foi descartada]

## Critérios de Aceitação
- [ ] [critério verificável 1]
- [ ] [critério verificável 2]

## Fora de Escopo
- [o que NÃO está incluído nesta feature]
```

**Contracts-First (recomendado para features de 3+ arquivos):**

Antes de implementar, gerar DTOs/interfaces/enums como **código real commitado no repo**:

```
Com base na spec, gere os CONTRATOS desta feature:
- Interfaces (métodos que cada service/repository deve ter)
- DTOs (estrutura de dados trocados entre camadas)
- Enums (estados, tipos, categorias)

Gere como código real, commite no repo.
Estes contratos são a "spec executável" — implementação deve respeitá-los.
NÃO implemente lógica — apenas a estrutura tipada.
```

**Por que:** Quando múltiplas tarefas são implementadas separadamente, contratos commitados garantem que todas as partes se encaixam. Elimina o problema #1 de multi-task: decisões de interface inconsistentes. *(FORGE: rework <15% com "constitution" files vs 30-50% sem)*

**Decision Journal (obrigatório):**

Durante a entrevista de spec, problemas e decisões surgem naturalmente. Registre CADA UM em `decisions.md` ao lado da spec:

```markdown
## P1: [título do problema]
**Problema:** [o que foi descoberto]
**Solução:** [o que foi decidido]
**How to apply:** [como essa decisão afeta a implementação]
```

O decision journal é proporcional à feature — feature simples tem 2-3 problemas, feature complexa tem 20+. Nunca é overhead porque registra o que já aconteceu naturalmente na entrevista.

**Por quê:** A seção "Decisões Tomadas" da spec registra O QUE foi decidido. O decision journal registra POR QUÊ — a jornada do problema à solução. Quando um implementador questiona uma decisão, o journal mostra o raciocínio completo. Sem journal, decisões parecem arbitrárias e são revertidas por falta de contexto.

**Protocolo de Interação AI-Humano:**

Regras universais (aplicam a TODAS as fases):
- AI SEMPRE explicita a fase/etapa atual (ex: "Fase ② SPEC — criação"). Nunca assume que o humano lembra o contexto.
- AI sempre pesquisa (research files, decisions, evidência) ANTES de propor. Nunca fabrica do training data quando evidência existe no projeto.
- AI ANTES de levantar uma questão, pesquisa se já não foi decidido (decision journal, spec, research files).
- AI sempre recomenda COM embasamento, nunca auto-aprova. Humano SEMPRE decide.
- Discussões são UM item por vez. Nunca agrupar múltiplas questões numa decisão.

Regras adicionais para refinamento/revisão (quando requisitos JÁ existem):
- Ao discutir um requisito, TRANSCREVER ele inteiro. Humano precisa de contexto completo para decidir.
- Cobrir TODOS os RF/RN/EC sequencialmente. NUNCA pular, mesmo se parecer trivial — gaps vêm dos triviais.
- Quando uma dúvida é resolvida por ANÁLISE (sem perguntar ao humano), ESCREVER a dúvida E a análise que a resolveu. Não aguardar validação — o humano lê e intervém se a compreensão estiver errada. AI que resolve dúvidas silenciosamente impede o humano de validar.

**Por quê:** Descoberto empiricamente — a qualidade da spec é drasticamente superior quando esses protocolos são seguidos. Sem eles, a AI pula para partes "interessantes", dá respostas rasas, e assume aprovação.

**Critério de saída:** Spec escrita, salva no repo, decision journal atualizado, e você concorda com todos os pontos. Se algo está vago, refine ANTES de prosseguir.

**⚠️ GATE (G1):** Não avance sem spec aprovada. A pesquisa mostra que esse é o fator #1 de sucesso.

**📊 Tracking:** Crie o arquivo `.ai/tracking/{feature}.md` com o template inicial. Atualize G1 para `approved` após sua aprovação. Gere o `spec_hash`: `sha256sum docs/specs/{file}.md | cut -c1-8`

---

### FASE 3: DECOMPOSE (5-10 minutos)

**Objetivo:** VOCÊ quebra a spec em tarefas atômicas de 5-15 minutos cada.

**Quem faz o quê:** Você faz a decomposição principal. AI pode sugerir uma lista inicial como ponto de partida, mas **você revisa, reordena, e ajusta cada tarefa**. Aceitar a lista da AI sem revisão viola a regra "humano decompõe". *(METR, Velichko)*

**Regras de decomposição:**

1. **Cada tarefa toca no máximo 2-3 arquivos** (idealmente 1)
2. **Cada tarefa tem um entregável claro** (um model, um service, um test file)
3. **Cada tarefa é testável isoladamente**
4. **Ordenar por dependência** (model antes do service, service antes do controller)
5. **5-10 tarefas por feature** (se tem mais que 10, quebre a feature em duas)
6. **Cada descrição de tarefa é auto-contida** — não assuma que o agent leu outras tarefas ou a spec inteira. Inclua apenas o que é necessário para ESTA tarefa

**Prompt Template — Decomposição Assistida:**

```
Aqui está a spec: [cole ou referencie o arquivo da spec]

Preciso decompor isso em tarefas atômicas de implementação.

Regras:
- Cada tarefa deve levar 5-15 minutos
- Cada tarefa toca no máximo 2-3 arquivos
- Cada tarefa tem um entregável testável
- Ordenar por dependência: data → domain → application → presentation
- Para cada tarefa, listar: arquivos, o que muda, critério de done,
  e testes relevantes que já existem no projeto
- COLLISION CHECK: duas tarefas NÃO podem produzir o mesmo arquivo
- Critérios de aceitação como assertions determinísticas (não prosa)
  Regra: "Se uma AI preguiçosa pode passar o teste sem implementar
  o comportamento, REESCREVA o critério"

Proponha a lista. EU vou revisar e ajustar antes de implementar.
```

**Salve a task list no repo:** `docs/specs/YYYY-MM-DD-{nome}-tasks.md`. Este arquivo é o plano — ele sobrevive session boundaries e serve como input para cada tarefa na Fase 4.

**spec_hash — Detecção de Drift (para features complexas):**

Se a spec mudar após a decomposição, as tarefas podem estar stale. Para features complexas, adicione detecção de drift:

```
Para cada tarefa, registre no cabeçalho:
- spec_section: [qual seção da spec originou esta tarefa]
- spec_hash: [SHA-256 da seção da spec]

Se a spec mudar após decomposição, compare os hashes:
  sha256sum <(sed -n '/## Requisitos/,/## Regras/p' docs/specs/*.md)
Tarefas com hash desatualizado devem ser re-derivadas (não patcheadas).
```

*(Inovação do Atomic Flow — gap não-resolvido no ecossistema. Nenhum plugin implementa drift detection automática.)*

**Formato do task list:**

```markdown
## Tasks para [Feature]
spec: docs/specs/YYYY-MM-DD-{nome}.md

### T1: Criar model e migration [5 min]
- Arquivos: migration, Model.php
- Testes relevantes: tests/Unit/Models/ (padrão existente)
- Critério: model criado, factory funcional, `php artisan test --filter=ModelTest` passa

### T2: Criar service com lógica de negócio [10 min]
- Arquivos: XService.php
- Testes relevantes: tests/Unit/Services/ (padrão existente)
- Critério: testes unitários cobrem RN01, RN02

### T3: Criar Filament resource [15 min]
- Arquivos: Resource.php, Form.php, Table.php, Pages/
- Testes relevantes: tests/Feature/ (padrão existente)
- Critério: CRUD funcional, campos conforme spec

### T4: Adicionar permissões [5 min]
- Arquivos: config/permissions.php, Policy.php
- Testes relevantes: tests/Unit/Policies/
- Critério: policy testes passam
```

**Critério de saída:** Lista de tarefas revisada POR VOCÊ. Cada tarefa tem arquivos, descrição, testes relevantes, e critério de done.

**⚠️ GATE (G2):** Se uma tarefa parece > 15 minutos, quebre-a. Se precisa de mais de 3 arquivos, quebre-a.

**📊 Tracking:** Preencha a seção `## Tasks` no tracking file com todas as tasks (status `pending`). Atualize G2 para `approved` após sua revisão. Atualize `phase: implement`.

**Mid-feature escalation:** Se durante a implementação uma tarefa revela-se maior do que estimada: (1) commite o que funciona até agora, (2) atualize a task list para dividir o restante, (3) `/clear` e comece a sub-tarefa como sessão nova.

---

### FASE 4: IMPLEMENT (loop por tarefa)

**Objetivo:** Executar cada tarefa em uma sessão limpa, com testes guiando a implementação, micro-commits, e verificação.

**Este é o loop que se repete para CADA TAREFA:**

```
┌────────────────────────────────────────────────┐
│            LOOP POR TAREFA                     │
│                                                │
│  4.0  /clear (sessão limpa)                    │
│  4.1  Carregar contexto (spec + tarefa)        │
│  4.2  git commit (snapshot antes de começar)   │
│  4.3  Escrever TESTE primeiro                  │
│  4.4  Implementar código mínimo para passar    │
│  4.5  Rodar test suite — deve PASSAR           │
│  4.6  git diff --stat (verificar escopo)       │
│  4.7  git commit (micro-commit da tarefa)      │
│  4.8  Verificar (full test suite, lint, etc.)  │
│  4.9  Se falhou → recovery em 4 níveis         │
│  4.10 Próxima tarefa → voltar ao 4.0           │
│                                                │
└────────────────────────────────────────────────┘
```

**Sobre TDD com AI — duas abordagens válidas:**

A pesquisa com 8 praticantes experientes de TDD (Bache, 2026) identificou duas abordagens que funcionam:

1. **Clássico (RED→GREEN):** Escreva o teste, rode para confirmar que falha, depois implemente. Mais seguro para lógica complexa.
2. **Combinado:** Peça ao Claude para escrever teste e implementação na mesma interação, mas rode o teste separadamente para confirmar. Funciona bem para tarefas simples com padrão claro.

**O que NÃO é negociável:** O teste deve existir ANTES de você considerar a tarefa concluída. AI tende a deletar/enfraquecer testes que falham — `it.skip`, assertions enfraquecidas, ou "trapacear" com loops. Monitore isso.

**Achado importante (TDAD Paper, arXiv 2026):** Instruções procedurais verbosas de TDD sem contexto de testes relevantes **AUMENTARAM** regressões de 6% para 10%. O que funciona melhor: informar QUAIS testes existem e serão afetados, não HOW to do TDD passo-a-passo. Por isso, cada tarefa inclui "testes relevantes" na decomposição.

**Prompt Template — Implementação de Tarefa:**

```
/clear

Contexto: Estou implementando [NOME DA FEATURE].
Spec: docs/specs/YYYY-MM-DD-{nome}.md
Tarefa atual: T[N] — [descrição da tarefa]

Arquivos envolvidos: [lista]
Testes relevantes existentes: [lista de test files/classes afetados]
Critério de done: [critério]

Regras desta sessão:
1. Escreva o teste ANTES da implementação.
2. Implemente o código mínimo para passar o teste.
3. Rode o test suite completo para verificar.
4. NÃO toque em arquivos fora do escopo desta tarefa.
5. NÃO remova funcionalidades existentes.
6. NÃO enfraqueça assertions de testes existentes.
7. Siga os padrões encontrados em [arquivo similar existente].

Comece escrevendo o teste.
```

**Ferramentas nativas por situação:**

| Situação | Como resolver (nativo) |
|----------|----------------------|
| Implementação normal | Claude Code direto (single agent) |
| Pergunta rápida sem poluir contexto | `/btw [pergunta]` — overlay que NÃO entra no histórico |
| Preciso pesquisar algo amplo | Subagent de investigação (Agent tool) — roda em context separado |
| Teste falha e não sei por quê | Prompt de debug (template abaixo) |
| Build quebrou | Prompt de diagnóstico (template abaixo) |
| Erro de tipagem/lint | Rodar manualmente e colar output: `! composer lint`, `! phpstan` |
| Preciso consultar docs de lib | WebSearch pela doc oficial + versão do projeto |
| Sessão longa, precisa continuar | `/compact preservar: spec path, tarefa atual T[N], decisões tomadas, último erro` |

**Prompt Template — Debug de Teste:**

```
O teste [NOME DO TESTE] está falhando.

Output do erro:
[cole o output do test runner]

Regras para diagnóstico:
1. Leia o teste E o código sendo testado.
2. Identifique a causa raiz — não adivinhe.
3. Proponha UMA correção focada.
4. NÃO enfraqueça o teste para fazê-lo passar.
5. NÃO mude a assertion — mude a implementação.
```

**Prompt Template — Build Quebrado:**

```
O build/test suite está falhando após a última mudança.

Erro:
[cole o output]

1. Analise o stacktrace. Qual arquivo e linha causam o erro?
2. Compare com o git diff — o que mudou que pode ter causado isso?
3. Proponha a correção mínima. NÃO refatore código não-relacionado.
```

**Recovery em 4 Níveis (não binário):**

Quando algo falha, escale progressivamente:

| Nível | Ação | Quando |
|-------|------|--------|
| **1. Retry com contexto** | Reescreva o prompt com mais contexto (stacktrace completo, arquivo relevante, padrão existente) | 1ª falha — geralmente falta de contexto |
| **2. Rollback ao checkpoint** | `git checkout .` → re-prompt do zero com abordagem diferente | 2ª-3ª falha — abordagem errada |
| **3. Delegar a subagent** | Spawnar subagent de investigação focado no problema, voltar com diagnóstico | Problema sistêmico ou em área desconhecida |
| **4. Escalar ao humano** | Parar, documentar o que tentou e falhou, decidir manualmente | Problema de arquitetura ou requisito ambíguo |

**Regras de segurança:**

- **Micro-commit ANTES de cada prompt ao Claude** — `git add -A && git commit -m "wip: T[N] checkpoint"`
- **`git diff --stat`** após CADA mudança do Claude — verificar que só os arquivos esperados foram tocados
- **Nunca aceitar sem rodar testes** — `composer test` (ou equivalente) é obrigatório após cada tarefa
- **Nunca aceitar nomes sem verificar** — se Claude referencia uma coluna, método, ou classe, confirme que existe com `Grep`

**Critério de saída por tarefa:** Testes passam. `git diff --stat` mostra apenas os arquivos esperados. Commit feito.

**📊 Tracking:** Após cada task concluída, atualize o tracking file: status `[done]`, commit hash, `Tests: pass`, strikes. Adicione linha no Session Log. Quando TODAS as tasks estiverem done, atualize `phase: review`.

---

### FASE 5: REVIEW (5-10 minutos)

**Objetivo:** Verificar a feature completa após todas as tarefas implementadas.

**Quando:** Após completar TODAS as tarefas da feature. Não pule.

**Prompt Template — Review Completo:**

```
Acabei de implementar [FEATURE]. Todos os testes passam.

Revise o código que eu modifiquei (use git diff development...HEAD):

1. SEGURANÇA: inputs validados? SQL injection? XSS? Secrets expostos?
   Autorização verificada em cada endpoint? Mass assignment protegido?
2. EDGE CASES: null handling? arrays vazios? strings longas? Unicode?
   Concorrência? Timeout? Dados duplicados?
3. PERFORMANCE: N+1 queries? loops desnecessários? missing indexes?
   Queries sem limit? Carga em memória excessiva?
4. CONSISTÊNCIA: segue os padrões do projeto? nomenclatura consistente?
   Imports organizados? Sem código morto?
5. COMPLETUDE: todos os requisitos da spec foram implementados?
   Spec: docs/specs/YYYY-MM-DD-{nome}.md

Você NÃO está revisando o processo. Está revisando se a EXECUÇÃO
corresponde à ESPECIFICAÇÃO. (Violaris)

Liste issues encontrados com severidade: CRITICAL / HIGH / MEDIUM / LOW.
Para cada issue, inclua: arquivo, linha, descrição, e sugestão de fix.
```

**Para features críticas — Review com Dupla Perspectiva (subagents):**

Rode dois subagents em paralelo com focos diferentes:

```
[SUBAGENT 1 — Perspectiva de Segurança e Performance]
Revise git diff development...HEAD APENAS sob estes ângulos:
- Vulnerabilidades de segurança (OWASP Top 10)
- Problemas de performance (N+1, missing indexes, memory leaks)
- Input validation e sanitization
Reporte: severidade, arquivo:linha, descrição.

[SUBAGENT 2 — Perspectiva de Lógica e Completude]
Revise git diff development...HEAD APENAS sob estes ângulos:
- A spec docs/specs/YYYY-MM-DD-{nome}.md foi 100% cumprida?
- Há lógica incorreta ou edge cases não tratados?
- Código segue os padrões do projeto?
Reporte: severidade, arquivo:linha, descrição.
```

**Limitação importante:** Ambos os subagents usam o mesmo modelo (Claude), portanto compartilham os mesmos blind spots. Isto NÃO é equivalente a dual-model review (ex: Claude + Codex), que tem false positive rate muito menor porque modelos diferentes têm vieses diferentes. *(FORGE methodology)*

**Regra prática:** Quando ambos flaggam o mesmo issue → provavelmente real. Quando só um flagga → investigue antes de agir (pode ser false positive do viés compartilhado).

**Prompt Template — Quality Check:**

```
Analise os arquivos que modifiquei (git diff --name-only development...HEAD):

1. COMPLEXIDADE: algum método tem mais de 20 linhas ou 3+ níveis de nesting?
2. DUPLICAÇÃO: há código repetido que deveria ser extraído?
3. NAMING: nomes de variáveis/métodos/classes são descritivos e consistentes?
4. FUNÇÕES: alguma função faz mais de uma coisa?
5. MAGIC VALUES: há números/strings hardcoded que deveriam ser constantes?

Só reporte issues que REALMENTE impactam manutenção. Não seja pedante.
```

**Prompt Template — Security Check:**

```
Analise os arquivos que modifiquei (git diff --name-only development...HEAD)
focando EXCLUSIVAMENTE em segurança:

1. INPUT: Todos os inputs do usuário são validados e sanitizados?
2. AUTH: Autorização verificada em cada endpoint? Pode acessar dados de outro tenant?
3. INJECTION: SQL injection via raw queries? XSS via output não-escaped?
4. SECRETS: Alguma chave, token, ou senha hardcoded no código?
5. MASS ASSIGNMENT: Models com $fillable correto? Sem $guarded = []?
6. FILE UPLOAD: Validação de tipo, tamanho, nome do arquivo?

Só reporte vulnerabilidades REAIS. Não reporte riscos teóricos que
não se aplicam ao contexto deste código.
```

**Convergence Rule (previne loop infinito de correções):**

Se o review encontra issues e você pede correção, aplique esta regra:

```
REGRA DE CONVERGÊNCIA:
- A cada round de fix, a contagem de CRITICAL+HIGH DEVE diminuir
- Se ficou igual ou aumentou → PARE, rollback, re-prompt do zero
- Se o mesmo MEDIUM aparece em 3+ arquivos → promover para HIGH (issue sistêmico)
- Máximo 3 rounds de review-fix. Após isso: rollback ou aceitar com ressalvas
```

**Critério de saída:** Zero issues CRITICAL. Issues HIGH resolvidos ou justificados. Testes passam.

**⚠️ GATE (G3):** Review aprovado por você.

**📊 Tracking:** Preencha a seção `## Review` com findings e convergence. Atualize G3 para `approved`. Atualize `phase: ship`.

---

### FASE 6: SHIP (5 minutos)

**Objetivo:** Commit final, PR, verificação de CI.

**Prompt:**

```
Crie um commit com mensagem descritiva seguindo conventional commits.
Inclua no corpo do commit os requisitos da spec que foram implementados.
```

**Checklist pré-ship:**
- [ ] Testes passam (todos, não só os novos)
- [ ] `git diff --stat` — apenas arquivos esperados
- [ ] Spec foi cumprida completamente (review contra checklist)
- [ ] Zero CRITICAL/HIGH issues no review
- [ ] Linting/static analysis sem erros novos

**Reconcile — Verificação Final (terraform-inspired):**

Antes de mergear, rodar um check de integridade contra o tracking file:

```
Leia .ai/tracking/{feature}.md e verifique:

1. GATES: G1, G2, G3 estão todos `approved`?
2. TASKS: Todas as tasks estão `done`? Alguma `failed` ou `pending`?
3. DRIFT: Para cada task, os arquivos declarados em `Files:` existem no repo?
4. ORPHANS: git diff --name-only mostra algum arquivo NÃO declarado nas tasks?
5. SPEC STALE: O spec_hash atual confere com `sha256sum docs/specs/{file}.md`?
6. REGRESSION: O test suite completo passa?

Preencha a seção ## Reconcile no tracking file:
- Drift: [lista ou "none"]
- Orphans: [lista ou "none"]
- Spec stale: [yes/no]
- Regressions: [lista ou "none"]

Reporte: OK / DRIFT / ORPHAN / STALE / REGRESSION
```

**📊 Tracking:** Atualize `phase: done` e preencha `## Reconcile` após verificação.

---

## Handoff — Entre Fases e Entre Sessões

**Não apenas na Fase 6.** Salve um handoff em CADA transição de fase, especialmente:
- **Final da Fase 2** → decisões da spec, alternativas rejeitadas
- **Final da Fase 3** → rationale da decomposição, riscos identificados
- **Entre tarefas na Fase 4** → se troca de sessão entre tarefas
- **Final da Fase 6** → lições aprendidas, o que funcionou/falhou

```yaml
# docs/handoffs/{feature-slug}.yaml
session: [nome da feature]
date: YYYY-MM-DD
phase: [research|spec|decompose|implement|review|ship]
status: [in_progress|complete]
decisions:
  - [decisão com rationale]
findings:
  - [descoberta importante]
worked: [abordagens que funcionaram]
failed: [abordagens que falharam e por quê]
next:
  - [próximo passo concreto]
```

---

## Referência Rápida: Ferramentas Nativas

Todas estas são features built-in do Claude Code — zero instalação extra:

| Ferramenta | Quando | Como |
|-----------|--------|------|
| **Plan Mode** (Shift+Tab 2x) | FASE 1: Research. Claude lê sem modificar | Shift+Tab 2x para entrar/sair |
| **`/clear`** | Entre CADA tarefa. Entre tópicos não-relacionados | Digitar `/clear` no prompt |
| **`/compact <instruções>`** | Se sessão está longa e precisa continuar (não trocar). Especificar o que preservar | `/compact preservar: spec, task list, decisões` |
| **`/btw [pergunta]`** | Pergunta lateral que NÃO entra no histórico — ideal para dúvidas rápidas durante implementação | Digitar `/btw como funciona X?` |
| **Subagent** (Agent tool) | Investigação ampla (5+ arquivos), review paralelo | Claude usa automaticamente quando instruído |
| **`.claudeignore`** | Excluir pastas irrelevantes (vendor, node_modules, builds) do indexing | Criar arquivo `.claudeignore` na raiz do projeto |
| **Hooks** (`settings.json`) | Enforcement 100% de regras críticas (lint, test, file scope) | Ver Apêndice B |
| **Tracking file** (`.ai/tracking/`) | Source of truth para progresso. Ler ANTES de gerar status | `Leia .ai/tracking/{feature}.md e reporte status` |
| **WebSearch** | Docs de libs, versões, APIs externas | Pedir para Claude buscar na web |
| **`git diff --stat`** | Após CADA mudança — verificar escopo | `! git diff --stat` no prompt |
| **`git checkout .`** | Rollback (nível 2 do recovery) | `! git checkout .` no prompt |

---

## Fluxo Visual Resumido

```
FEATURE REQUEST
      │
      ▼
┌─────────────┐     ┌──────────────────────────────────┐
│ ① RESEARCH  │────▶│ Plan Mode + Subagent              │
│   5-15 min  │     │ "O que existe? Quais padrões?"    │
└─────────────┘     └──────────────────────────────────┘
      │
      ▼              📊 Criar tracking file
┌─────────────┐     ┌──────────────────────────────────┐
│ ② SPEC      │────▶│ Entrevista → Spec escrita no repo │
│   10-20 min │     │ + Decisões & Rationale            │
└─────────────┘     └──────────────────────────────────┘
      │
      ▼ ⚠️ GATE G1: spec aprovada?    📊 G1 → approved
      │
┌─────────────┐     ┌──────────────────────────────────┐
│ ③ DECOMPOSE │────▶│ VOCÊ quebra em tarefas de 5-15min │
│   5-10 min  │     │ Tasks preenchidas no tracking     │
└─────────────┘     └──────────────────────────────────┘
      │
      ▼ ⚠️ GATE G2: tasks revisadas?  📊 G2 → approved
      │
┌─────────────┐     ┌──────────────────────────────────┐
│ ④ IMPLEMENT │────▶│ Loop por tarefa:                  │
│   por tarefa│     │  /clear → ler tracking → TDD →    │
│             │     │  micro-commit → atualizar tracking │
│             │     │  Recovery: 4 níveis                │
└─────────────┘     └──────────────────────────────────┘
      │               📊 Cada task: done/failed + commit
      ▼
┌─────────────┐     ┌──────────────────────────────────┐
│ ⑤ REVIEW    │────▶│ Review prompt (single ou dual     │
│   5-10 min  │     │  subagent*) + quality + security  │
│             │     │  *mesmo modelo = mesmo viés       │
└─────────────┘     └──────────────────────────────────┘
      │
      ▼ ⚠️ GATE G3: review aprovado?  📊 G3 → approved
      │
┌─────────────┐     ┌──────────────────────────────────┐
│ ⑥ SHIP      │────▶│ Reconcile (tracking vs filesystem)│
│   5 min     │     │ Commit final + PR                 │
└─────────────┘     └──────────────────────────────────┘
                      📊 phase: done
```

---

## Checklist de Validação do Método

Após cada feature implementada com este método, avalie:

```
## Validação — [Nome da Feature] — [Data]

### Processo
- [ ] Research feito antes de planejar?
- [ ] Spec escrita e aprovada antes de codar?
- [ ] Spec inclui Decisões & Rationale?
- [ ] Decomposição revisada por mim (não aceita cegamente da AI)?
- [ ] Task list salva no repo?
- [ ] Cada tarefa teve sessão limpa (/clear)?
- [ ] Testes escritos antes da implementação?
- [ ] Micro-commit antes de cada prompt?
- [ ] Review feito após implementação completa?
- [ ] Handoffs escritos nas transições de fase?

### Resultado
- [ ] Todos os testes passam?
- [ ] Spec foi cumprida 100%?
- [ ] Zero issues CRITICAL no review?
- [ ] Nenhum arquivo inesperado foi tocado?
- [ ] Nenhuma feature existente foi removida?

### Métricas
- Tempo total: ___ min
- Tempo em ①②③⑤ vs ④⑥: ___% vs ___%  (alvo: 70/30)
- Número de tarefas: ___
- Número de recovery (por nível): ___
- Issues encontrados no review: ___
- Contexto ao final da maior sessão: ___%

### Lições
- O que funcionou bem: ___
- O que precisa ajustar: ___
```

---

## Escalas de Complexidade

Nem toda feature precisa das 6 fases completas:

| Complexidade | Arquivos | Fases | Exemplo |
|-------------|----------|-------|---------|
| **Trivial** | 1 | ④→⑥ | Fix de typo, ajuste de label |
| **Simples** | 1-2 | ④→⑤→⑥ | Bug fix com teste, campo novo em form |
| **Média** | 3-5 | ②→③→④→⑤→⑥ | Nova feature com model+service+resource |
| **Complexa** | 6-10 | ①→②→③→④→⑤→⑥ | Módulo novo (ex: Vulnerability Management) |
| **Épica** | 10+ | Quebrar em 2+ features médias | Sistema completo multi-módulo |

**Escalação mid-feature:** Se uma feature "Simples" revela-se "Média" durante a implementação, pare, escreva a spec que falta, decomponha, e retome com o fluxo correto. Não force uma feature complexa pelo fluxo simples.

---

## Apêndice A: Números de Referência

| Métrica | Valor | Fonte |
|---------|-------|-------|
| Context window prático máximo | 60% | van Deth, systemprompt.io |
| Mensagens produtivas por sessão | 8-10 | Hvide, múltiplos praticantes |
| Código ativo confiável em escopo | 1,500-3,000 linhas | AICourses, Morph LLM |
| CLAUDE.md efetivo máximo | 60 linhas / ~2,500 tokens | DEV Community |
| Budget de instrução do Claude | ~100-150 slots | DEV Community |
| Economia de contexto com subagents | ~93% | systemprompt.io |
| Economia de contexto com .claudeignore | ~80%+ | Crosley 50-session study |
| CLAUDE.md compliance | ~80% | DEV Community |
| Hooks compliance | 100% | DEV Community, Anthropic |
| Código AI com vulnerabilidades | 45% | Veracode 2025 |
| Bugs AI vs humano | 1.7x mais | CodeRabbit, 470 PRs |
| Rework com "constitution" file | <15% (vs 30-50% sem) | FORGE |
| Devs com AI: percepção vs realidade | +24% percebido, -19% real | METR Study (RCT) |
| PRs com AI sem metodologia | +154% maiores, +9% bugs | Faros AI, 10K+ devs |
| QA skip rate em vibe coding | 36% | ICSE 2026, 101 fontes |
| TDD verboso sem contexto de testes | +65% regressões (6%→10%) | TDAD Paper (arXiv) |

---

## Apêndice B: Hooks Nativos (Exemplos)

Hooks são configurados em `.claude/settings.json` (projeto) ou `~/.claude/settings.json` (global). São **nativos do Claude Code** — não requerem nenhum plugin.

**Por que hooks:** CLAUDE.md tem ~80% de compliance. Hooks têm 100%. Para regras inegociáveis, use hooks.

**Exemplo 1 — Auto-lint após write:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "composer lint -- $TOOL_INPUT_FILE_PATH 2>&1 | head -20"
      }
    ]
  }
}
```

**Exemplo 2 — Bloquear write fora do escopo (file scoping):**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "bash -c 'if ! grep -q \"$TOOL_INPUT_FILE_PATH\" docs/specs/*-tasks.md 2>/dev/null; then echo \"⚠️ Arquivo não declarado na task list: $TOOL_INPUT_FILE_PATH\" >&2; exit 2; fi'"
      }
    ]
  }
}
```

**Exemplo 3 — Aviso antes de compaction:**
```json
{
  "hooks": {
    "PreCompact": [
      {
        "command": "echo '⚠️ Context será compactado. Salve decisões importantes no handoff antes de continuar.'"
      }
    ]
  }
}
```

*(exit code 2 = bloquear a ação. exit code 0 = permitir. Qualquer output vai para o contexto do Claude.)*

---

## Apêndice C: CLAUDE.md — O Que Incluir vs Excluir

| Incluir (≤60 linhas) | Excluir |
|-----------------------|---------|
| Comandos bash que Claude não pode adivinhar (`composer test`, `php artisan`) | O que Claude descobre lendo o código |
| Regras de estilo diferentes do padrão da linguagem | Convenções padrão da linguagem |
| Decisões arquiteturais do projeto | API docs detalhados (linkar em vez disso) |
| Quirks do ambiente de dev | Descrições arquivo-por-arquivo |
| Stack do projeto (versões de frameworks) | Tutoriais ou explicações longas |
