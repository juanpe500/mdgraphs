/* Example diagrams for the MDGraph studio & gallery. */
window.MDGRAPH_EXAMPLES = [
  {
    name: 'Request flow',
    theme: 'dark',
    code: `
flowchart LR
  A([Client]) --> B{Authenticated?}
  B -->|yes| C[API Handler]
  B -->|no| D[401 Reject]
  C --> E[(Database)]
  C --> F[[Cache]]
  E --> G((Done))

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
  A[Commit] --> B[Build]
  B --> C[Unit tests]
  C --> D[Integration]
  D --> E{Passing?}
  E -->|yes| F([Deploy])
  E -->|no| G>Rollback]
  F --> H((Live))

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
  }
];
