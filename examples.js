/* Example diagrams for the MDGraph studio & gallery. */
window.MDGRAPH_EXAMPLES = [
  {
    name: 'Request flow',
    theme: 'dark',
    code: `
flowchart LR
  A([:user: Client]) --> B{:shield: Authenticated?}
  B -->|yes| C[:server: API Handler]
  B -->|no| D[:ban: 401 Reject]
  C --> E[(:database: Database)]
  C --> F[[:zap: Cache]]
  E --> G((:circle-check: Done))

  @show A 0.4s say:"A request arrives"
  @flow A->B 1s say:"Check the token"
  @flow B->D 0.8s color:#f87171 say:"No token → reject"
  @flow B->C 0.9s color:#34d399 say:"Authorized"
  @flow C->F 0.7s say:"Try the cache first"
  @flow C->E 0.9s color:#fbbf24 say:"Fall back to the database"
  @flow E->G 0.8s say:"Return the result"
  @pulse G 0.8s color:#34d399
`
  },
  {
    name: 'CI/CD pipeline',
    theme: 'neon',
    code: `
flowchart LR
  A[:git-commit-horizontal: Commit] --> B[:box: Build]
  B --> C[:check-check: Unit tests]
  C --> D[:layers: Integration]
  D --> E{:flag: Passing?}
  E -->|yes| F([:rocket: Deploy])
  E -->|no| G>Rollback]
  F --> H((:circle-check: Live))

  @show A 0.4s
  @flow A->B 0.7s say:"Push triggers the build"
  @flow B->C 0.7s
  @flow C->D 0.7s
  @flow D->E 0.7s say:"Gate on the test suite"
  @flow E->F 0.9s color:#39ff14 say:"Green — ship it"
  @pulse H 0.9s color:#39ff14 say:"Live in production"
`
  },
  {
    name: 'Decision tree',
    theme: 'blueprint',
    code: `
flowchart TB
  Start((Start)) --> Q1{Budget > 1k?}
  Q1 -->|yes| P[Premium plan]
  Q1 -->|no| Q2{Team > 5?}
  Q2 -->|yes| T[Team plan]
  Q2 -->|no| S[Solo plan]

  @show Start 0.4s say:"Pick a plan"
  @flow Start->Q1 0.8s
  @focus Q1 0.5s
  @flow Q1->Q2 0.8s say:"Under budget"
  @clear
  @flow Q2->T 0.8s color:#7dd3fc say:"Bigger team → Team plan"
  @pulse T 0.7s
`
  },
  {
    name: 'State machine',
    theme: 'dark',
    code: `
flowchart LR
  Idle((Idle)) --> Loading
  Loading[Loading] --> Success
  Loading --> Error
  Success((Success)) --> Idle
  Error>Error] --> Idle

  @show Idle 0.4s
  @flow Idle->Loading 0.9s say:"fetch()"
  @flow Loading->Success 0.9s color:#34d399 say:"resolved"
  @flow Success->Idle 0.9s back say:"reset"
  @flow Loading->Error 0.9s color:#f87171 say:"rejected"
`
  },
  {
    name: 'Bidirectional sync',
    theme: 'neon',
    code: `
flowchart LR
  A[Client] <--> B[Server]
  B <--> C[(Database)]
  B --> D[[Queue]]

  @show A 0.4s
  @show B 0.4s
  @flow A->B 1.2s both say:"Two-way sync"
  @flow B->C 1.2s both color:#22d3ee
  @flow B->D 0.9s say:"Emit events"
`
  },
  {
    name: 'Table + graph',
    theme: 'light',
    code: `
title: Deployment checklist
flowchart LR
  Plan --> Build --> Ship

  | Step  | Owner | Status |
  |-------|-------|--------|
  | Plan  | Ana   | done   |
  | Build | Leo   | wip    |
  | Ship  | Mia   | queued |

  @flow Plan->Build 0.8s
  @flow Build->Ship 0.8s
  @row 0 0.5s color:rgba(52,211,153,.25)
  @row 1 0.5s color:rgba(251,191,36,.25)
  @row 2 0.5s
`
  },
  {
    name: 'System architecture',
    theme: 'blueprint',
    code: `
title: System overview
flowchart LR
  U[:users: Users] --> W[:globe: Web App]
  W --> G{:shield-check: API Gateway}
  G --> S[:server: Service]
  G --> A[:bot: AI Worker]
  S --> DB[(:database: Postgres)]
  S --> C[[:zap: Redis]]
  A --> Q[:workflow: Queue]
  S --> M[:mail: Notifier]

  @show U 0.4s say:"Users hit the app"
  @flow U->W 0.8s
  @flow W->G 0.8s say:"Authenticate at the gateway"
  @flow G->S 0.8s color:#7dd3fc
  @flow G->A 0.8s say:"Async AI work"
  @flow S->DB 0.8s color:#34d399
  @flow S->C 0.7s
  @flow A->Q 0.8s
  @pulse M 0.8s color:#fbbf24 say:"Notify the user"
`
  }
];
