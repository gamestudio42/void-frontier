# 🚀 Engenharia reversa de C-Beams
## Análise do jogo e especificação para desenvolvimento com agentes de IA

**Jogo original:** [C-Beams — Steam](https://store.steampowered.com/app/3102780/CBeams/?utm_source=chatgpt.com)  
**Desenvolvedora:** Distant Light Games  
**Publicadora:** Hooded Horse  
**Gênero:** Space Action RPG / Simulador espacial / Sandbox  
**Perspectiva:** Top-down 3D, com câmera acompanhando a nave  
**Plataforma anunciada:** PC (Windows)  
**Estado em 27/10/2026:** Ainda não lançado na Steam.

Minha avaliação inicial é que C-Beams é uma excelente referência para desenvolver um jogo espacial independente, especialmente porque combina simulação física, combate tático, exploração e progressão econômica.

O grande diferencial não parece ser simplesmente pilotar uma nave e destruir inimigos. É a combinação de **física newtoniana, gerenciamento de sistemas da nave, exploração espacial e liberdade para escolher como ganhar dinheiro**.

Isso permite construir um jogo no qual o jogador pode ser transportador, minerador, explorador, comerciante, caçador de recompensas ou pirata.

A documentação oficial confirma essas mecânicas, incluindo combate com subsistemas, diferentes armamentos, carga que influencia a movimentação, anomalias espaciais e progressão por equipamentos e reputação. [Steam Store](https://store.steampowered.com/app/3102780/CBeams/?utm_source=chatgpt.com)

**Uma observação importante:** como o jogo ainda não foi lançado, esta é uma engenharia reversa funcional baseada nas informações e imagens públicas. Não temos acesso ao código-fonte, aos algoritmos internos ou aos valores exatos de física e balanceamento.

Vou separar os sistemas confirmados das implementações propostas. Assim, seu agente poderá criar uma experiência equivalente, sem depender de reproduzir o código, os recursos visuais ou a identidade do original.

---

# 1. Análise visual e de gameplay



## 1.1. O que caracteriza C-Beams?

O jogo possui seis grandes pilares.

| Pilar | Mecânica | Importância |
|---|---|---|
| Física espacial | Inércia, aceleração, desaceleração e propulsores | Crítica |
| Combate espacial | Projéteis, mísseis, lasers e subsistemas | Crítica |
| Exploração | Setores, asteroides, estações e anomalias | Alta |
| Economia | Mineração, comércio, contratos e saque | Alta |
| Progressão | Naves, equipamentos, habilidades e reputação | Alta |
| Universo dinâmico | Facções, inimigos e oportunidades | Média |

A física é o centro da experiência.

Em jogos espaciais mais arcade, soltar o acelerador faz a nave parar ou desacelerar automaticamente.

Em C-Beams, a proposta é diferente:

- A nave continua se deslocando quando os motores são desligados.
- O jogador utiliza propulsores para alterar sua trajetória.
- Para frear rapidamente, precisa aplicar força contrária ao deslocamento.
- O peso da carga influencia a aceleração e a capacidade de manobra.
- O combustível limita determinadas capacidades de propulsão.

O jogo também utiliza essa física para tornar o combate e a atracação mais interessantes.

Isso gera uma característica essencial: **dominar a pilotagem é parte da progressão do jogador**, independentemente dos equipamentos que ele possui.

## 1.2. Minha avaliação

| Critério | Avaliação |
|---|---:|
| Conceito | 9/10 |
| Potencial de gameplay | 9/10 |
| Profundidade dos sistemas | 9/10 |
| Potencial de expansão | 10/10 |
| Adequação para desenvolvimento com IA | 8/10 |
| Complexidade técnica | 9/10 |
| Viabilidade de um MVP | 8/10 |

Essas notas avaliam o conceito e o escopo observáveis, não a qualidade de uma versão final ainda não disponível.

**Minha conclusão:** vale a pena usar C-Beams como referência, mas eu não tentaria reproduzir todo o jogo imediatamente.

Começaria com uma versão jogável que tenha física convincente, combate, mineração, uma estação espacial e um ciclo econômico completo. Depois expandiria o universo.

---

# 2. Visão do jogo que vamos construir

Para a especificação, utilizarei o nome provisório **Void Frontier**.

O nome é apenas interno. A identidade comercial deverá ser definida posteriormente, com verificação de disponibilidade.

### Conceito

Void Frontier será um RPG espacial sandbox no qual o jogador assume o controle de uma pequena nave em uma região remota do espaço.

O jogador começa com poucos recursos e precisa sobreviver explorando asteroides, realizando contratos, transportando mercadorias, enfrentando piratas e melhorando sua nave.

O mundo será composto por setores interconectados, cada um contendo diferentes riscos, oportunidades econômicas e pontos de interesse.

### Características principais

| Característica | Decisão |
|---|---|
| Tipo | Space Action RPG |
| Jogadores | Single-player |
| Gráficos | 3D |
| Câmera | Top-down inclinada |
| Física | Newtoniana simplificada |
| Mundo | Setores conectados |
| Progressão | Economia, equipamentos e reputação |
| Plataforma inicial | Navegador |
| Plataforma futura | Desktop |
| Idioma inicial | Português brasileiro |
| Código e documentação | Inglês |
| Licenciamento sugerido | GPL-3.0-or-later para o código do jogo |

A licença não abrange automaticamente todos os recursos artísticos de terceiros. Recomendo manter a arte, os sons e os demais assets sob licenças explicitamente documentadas.

**Escolha de plataforma:** considerando a possibilidade de manter jogos web e desktop, a arquitetura será projetada para compartilhar o máximo de código possível entre as versões.

A implementação inicial usará TypeScript e Three.js, com Vite para desenvolvimento e distribuição web.

Essa é uma decisão de projeto proposta, não uma identificação da tecnologia utilizada por C-Beams.

# 3. Referências visuais

As imagens públicas mostram um jogo com naves industriais, ambientes espaciais de grande escala, efeitos de propulsão e uma interface de combate relativamente discreta.



Para nosso projeto, proponho preservar os princípios visuais, mas criar uma identidade própria.

### Direção artística

**Estilo:** ficção científica industrial, com realismo estilizado.

As naves devem parecer máquinas construídas para trabalhar no espaço, não apenas aviões futuristas.

Características:

- Cascos modulares com peças identificáveis.
- Motores e propulsores posicionados de maneira funcional.
- Antenas, contêineres, reatores e radiadores.
- Iluminação emissiva em motores, janelas e equipamentos.
- Asteroides irregulares e campos de destroços.
- Estações espaciais construídas com módulos reutilizáveis.
- Interface inspirada em instrumentos reais de navegação.
- Explosões e fragmentação visualmente satisfatórias.

### Câmera

Utilizaremos uma câmera perspectiva posicionada acima da nave, inclinada para oferecer profundidade.

A câmera acompanha a posição do jogador, mas não necessariamente acompanha toda a sua rotação.

Configuração inicial proposta:

| Propriedade | Valor |
|---|---|
| Projeção | Perspectiva |
| FOV | 50° |
| Inclinação | 55° em relação ao plano de movimentação |
| Distância | 45 unidades |
| Zoom | 0,5× a 2× |
| Suavização | 0,15 s |
| Look-ahead | Proporcional à velocidade |
| Rotação | Livre, opcional |

Uma funcionalidade importante será o zoom dinâmico: quanto maior a velocidade, maior o campo de visão necessário para antecipar obstáculos.

---

# 4. Arquitetura geral do gameplay

A estrutura de jogo proposta será:

```text
                    VOID FRONTIER
                          |
                 GALAXY / STAR SYSTEM
                          |
                 SECTOR NAVIGATION
                          |
       +------------------+------------------+
       |                  |                  |
   EXPLORATION         COMBAT             ECONOMY
       |                  |                  |
   Scanning            Weapons             Trading
   Mining              Projectiles         Contracts
   Anomalies           Targeting           Salvaging
   Discovery           Damage              Reputation
       |                  |                  |
       +------------------+------------------+
                          |
                    SHIP SYSTEM
                          |
       +------------------+------------------+
       |                  |                  |
     PHYSICS           MODULES             CARGO
       |                  |                  |
   Movement             Engines            Inventory
   Rotation             Weapons            Capacity
   Inertia              Reactor            Mass
   Thrusters            Sensors            Resources
       |                  |                  |
       +------------------+------------------+
                          |
                      PROGRESSION
                          |
                  Ships / Equipment
                  Skills / Reputation
                  Exploration / Wealth
```

A regra arquitetural mais importante:

**A simulação não pode depender diretamente da interface gráfica.**

Precisamos conseguir simular a nave, seus equipamentos, o combate e a economia sem renderizar uma única cena.

Isso possibilita testes automatizados, balanceamento, agentes NPC, replay de simulações e futuras versões desktop.

---

# 5. Sistema de física espacial

Este é o primeiro sistema que o agente deverá implementar.

## 5.1. Modelo físico

O gameplay será essencialmente 2D em um ambiente visual 3D, uma abordagem frequentemente chamada de *2.5D*.

A nave terá:

```typescript
interface Vector2 {
  x: number;
  y: number;
}

interface ShipPhysics {
  position: Vector2;
  velocity: Vector2;

  rotation: number;
  angularVelocity: number;

  dryMass: number;
  cargoMass: number;
  equipmentMass: number;

  mainThrust: number;
  lateralThrust: number;
  reverseThrust: number;

  momentOfInertia: number;
  torque: number;

  maxAngularVelocity: number;

  fuel: number;
  fuelCapacity: number;
}
```

Apesar de o espaço ser representado em três dimensões, o movimento inicial será realizado em um plano.

Isso simplifica controles, colisões, inteligência artificial e combate, sem sacrificar a maior parte da experiência pretendida.

## 5.2. Dinâmica linear

A aceleração é determinada pela força resultante e pela massa.

\[
a = \frac{F}{m}
\]

A velocidade evolui conforme:

\[
v_{t+\Delta t}=v_t+a\Delta t
\]

A posição será integrada utilizando:

\[
p_{t+\Delta t}=p_t+v_{t+\Delta t}\Delta t
\]

Usaremos integração semi-implícita de Euler com passo de simulação fixo.

A massa total será:

\[
m=m_{\text{casco}}+m_{\text{equipamentos}}+m_{\text{carga}}
\]

Consequentemente, carregar mercadorias pesadas deixa a nave menos ágil.

### Exemplo

Considere uma nave com as seguintes características:

| Parâmetro | Valor |
|---|---:|
| Massa vazia | 10.000 kg |
| Propulsão principal | 200.000 N |
| Carga transportada | 5.000 kg |
| Massa carregada | 15.000 kg |

Sem carga, sua aceleração será de 20 m/s².

Com carga, cairá para aproximadamente 13,33 m/s².

O jogador perceberá essa diferença imediatamente.

## 5.3. Inércia

Quando o jogador soltar o acelerador:

```typescript
throttle = 0;
```

A nave deverá continuar se movimentando.

Não devemos aplicar amortecimento artificial de velocidade no modo de física padrão.

Exemplo:

```typescript
if (thrustInput === 0) {
  // Preserve linear velocity.
  // Do not apply artificial braking.
}
```

Isso significa que a nave pode apontar para uma direção enquanto se desloca em outra.

**Esse comportamento é fundamental.**

É justamente o que permite deslocamentos laterais, disparos durante manobras e combate baseado em vetores de movimento.

## 5.4. Propulsores

Implementaremos quatro grupos de propulsão.

| Grupo | Função |
|---|---|
| Main thruster | Aceleração para frente |
| Reverse thruster | Frenagem e movimento reverso |
| Lateral thrusters | Movimento lateral |
| Rotation thrusters | Controle angular |

Cada nave terá valores diferentes para esses componentes.

Naves de transporte serão pesadas e pouco ágeis.

Naves de combate terão aceleração lateral elevada.

Naves de exploração terão maior eficiência de combustível.

## 5.5. Modos de pilotagem

Proponho três modos.

### Newtonian

Controle totalmente manual.

- A nave preserva sua velocidade.
- O jogador precisa frear.
- Direção e velocidade são independentes.
- Ideal para jogadores experientes.

### Assisted

O computador de bordo ajuda na pilotagem.

- Compensação de rotação.
- Frenagem automática opcional.
- Estabilização de velocidade.
- Ajuda para atracação.

### Cruise

Piloto automático para deslocamentos longos.

- Aceleração até a velocidade configurada.
- Orientação automática.
- Frenagem ao aproximar-se do destino.
- Correção de trajetória.

A assistência deverá utilizar os propulsores existentes, não alterar diretamente posição ou velocidade.

## 5.6. Controle de rotação

A física angular utilizará:

\[
\alpha=\frac{\tau}{I}
\]

Em que:

- \(\alpha\) é a aceleração angular.
- \(\tau\) é o torque.
- \(I\) é o momento de inércia.

Depois:

\[
\omega_{t+\Delta t}=\omega_t+\alpha\Delta t
\]

\[
\theta_{t+\Delta t}=\theta_t+\omega_{t+\Delta t}\Delta t
\]

O modo assistido utilizará um controlador PD para estabilizar a rotação.

Uma nave pesada deverá exigir mais tempo para mudar sua orientação.

## 5.7. Frenagem automática

Para estimar a distância mínima de frenagem:

\[
d=\frac{v^2}{2a}
\]

A interface deverá apresentar uma indicação de distância necessária para parar.

Isso será particularmente importante durante aproximações de estações espaciais.

### Critérios de aceitação da física

O sistema estará funcional quando:

1. A nave continuar se movendo sem propulsão.
2. O jogador conseguir rotacionar sem alterar sua trajetória.
3. O jogador conseguir deslocar-se lateralmente.
4. Uma nave carregada acelerar menos do que uma vazia.
5. Os propulsores consumirem combustível conforme configuração.
6. A assistência de pilotagem conseguir estabilizar a nave.
7. Os mesmos comandos produzirem resultados reproduzíveis com o mesmo passo de simulação.
8. Colisões aplicarem dano proporcional à intensidade do impacto.

---

# 6. Controles do jogador

Para desktop e navegador:

| Controle | Ação |
|---|---|
| W | Propulsão principal |
| S | Propulsão reversa |
| A / D | Propulsão lateral |
| Mouse | Apontar nave ou sistema de mira |
| Q / E | Rotação manual |
| Shift | Boost |
| Espaço | Frenagem assistida |
| Botão esquerdo | Arma principal |
| Botão direito | Arma secundária |
| Tab | Alternar alvo |
| F | Interagir / Atracar |
| M | Mapa |
| I | Inventário |
| J | Missões |
| R | Scanner |
| C | Alternar assistência |
| Esc | Pausa |

O mouse terá dois modos configuráveis:

**Mouse steering:** a nave tenta orientar seu nariz na direção do cursor.

**Independent aiming:** o mouse controla a mira enquanto a orientação da nave permanece sob controle do teclado.

O segundo modo será especialmente útil para naves com torretas.

Também recomendo suporte completo a gamepad usando a Gamepad API.

---

# 7. Sistema de naves

Uma das principais características de Void Frontier será a diferenciação entre classes de naves.

## 7.1. Classes

| Classe | Especialização |
|---|---|
| Scout | Exploração e reconhecimento |
| Interceptor | Combate rápido |
| Fighter | Combate equilibrado |
| Miner | Extração mineral |
| Hauler | Transporte de mercadorias |
| Frigate | Combate pesado |
| Salvager | Recuperação de destroços |

Cada classe terá uma configuração específica de massa, propulsores, casco, energia e equipamentos.

## 7.2. Estrutura de uma nave

```typescript
interface ShipDefinition {
  id: string;
  name: string;
  class: ShipClass;

  hull: {
    maxIntegrity: number;
    dryMass: number;
    collisionRadius: number;
  };

  movement: {
    mainThrust: number;
    reverseThrust: number;
    lateralThrust: number;
    rotationalTorque: number;
  };

  reactor: {
    maxPower: number;
    rechargeRate: number;
  };

  storage: {
    cargoCapacity: number;
    fuelCapacity: number;
  };

  hardpoints: WeaponHardpoint[];

  moduleSlots: ModuleSlot[];

  sensors: {
    range: number;
    resolution: number;
  };
}
```

## 7.3. Componentes

As naves serão configuráveis por módulos.

```text
SHIP
├── HULL
├── ENGINE
├── REACTOR
├── FUEL TANK
├── CARGO HOLD
├── RADAR
├── SHIELD GENERATOR
├── ARMOR
├── WEAPON HARDPOINTS
├── UTILITY MODULES
└── SPECIAL MODULES
```

### Módulos propostos

**Propulsão:** motores principais, propulsores laterais, sistemas de boost e melhorias de consumo.

**Combate:** torretas, canhões, lançadores de mísseis, lasers, sensores de combate e sistemas de defesa.

**Exploração:** scanners de longo alcance, detectores de anomalias, sondas e sistemas de navegação.

**Industrial:** lasers de mineração, tratores, refinarias compactas e ampliação de carga.

**Defesa:** blindagens, escudos, contramedidas e redução de assinatura.

## 7.4. Energia

Todos os equipamentos ativos consumirão energia.

O reator possuirá capacidade máxima de geração.

Por exemplo:

```text
REACTOR OUTPUT: 100 MW

ENGINES:          35 MW
WEAPONS:          30 MW
SHIELDS:          20 MW
SENSORS:           5 MW
OTHER SYSTEMS:     5 MW
-----------------------
TOTAL:            95 MW
```

Se a demanda ultrapassar a capacidade do reator, o sistema precisará priorizar consumidores ou limitar seu funcionamento.

A distribuição será configurável pelo jogador em uma etapa posterior.

Esse mecanismo cria escolhas interessantes: aumentar potência dos motores pode exigir reduzir temporariamente a energia disponível para armas.

---

# 8. Sistema de combate espacial

O combate deverá valorizar posicionamento, movimento, escolha de armas e gerenciamento de sistemas.

Não será simplesmente um jogo de disparos com naves.

## 8.1. Tipos de armas

| Arma | Alcance | Dano | Característica |
|---|---|---|---|
| Gatling | Curto | Baixo por disparo | Alta cadência |
| Autocannon | Médio | Médio | Projéteis físicos |
| Railgun | Longo | Alto | Disparo de alta velocidade |
| Laser | Médio | Contínuo | Consome energia |
| Beam weapon | Longo | Alto | Aquecimento elevado |
| Missile | Longo | Alto | Rastreamento de alvo |
| Mining laser | Curto | Industrial | Extração de materiais |

Todos esses armamentos serão implementações originais, com características próprias.

A presença de diferentes canhões, mísseis e armas de energia em C-Beams é confirmada pela documentação oficial. [Steam Store](https://store.steampowered.com/app/3102780/CBeams/?utm_source=chatgpt.com)

## 8.2. Projéteis

Cada projétil possuirá:

```typescript
interface Projectile {
  id: string;

  position: Vector2;
  velocity: Vector2;

  damage: number;
  penetration: number;

  lifetime: number;
  collisionRadius: number;

  ownerId: string;
  targetId?: string;
}
```

A velocidade inicial do projétil poderá incorporar a velocidade da nave que disparou.

```typescript
projectile.velocity = add(
  scale(firingDirection, muzzleVelocity),
  scale(ship.velocity, inheritanceFactor)
);
```

O fator de herança será configurável, permitindo um modelo mais físico ou mais arcade.

## 8.3. Mira preditiva

Com velocidades elevadas, mirar diretamente na posição atual do inimigo não será suficiente.

Precisaremos calcular uma solução de interceptação.

Seja:

\[
r=p_{\text{alvo}}-p_{\text{atirador}}
\]

\[
v=v_{\text{alvo}}-v_{\text{atirador}}
\]

E \(s\) a velocidade do projétil em relação à nave.

Procuramos o menor tempo positivo \(t\) que satisfaça:

\[
\|r+vt\|^2=(st)^2
\]

Expandindo:

\[
(v\cdot v-s^2)t^2+2(r\cdot v)t+r\cdot r=0
\]

O sistema resolve essa equação e encontra um ponto futuro para a mira.

Essa solução inicial assume que o alvo mantém velocidade constante.

O HUD exibirá um indicador próximo à posição prevista de interceptação.

## 8.4. Dano localizado

Em vez de utilizar apenas uma barra de vida, cada nave terá subsistemas danificáveis.

```typescript
interface ShipDamageState {
  hull: number;

  components: {
    engines: ComponentHealth;
    reactor: ComponentHealth;
    radar: ComponentHealth;
    weapons: ComponentHealth[];
    cargoHold: ComponentHealth;
  };

  statusEffects: StatusEffect[];
}
```

Exemplos:

- Danificar os motores reduz a aceleração.
- Destruir o radar prejudica a aquisição de alvos.
- Danificar o reator reduz a energia disponível.
- Destruir uma torreta impede seu disparo.
- Danificar o compartimento de carga pode provocar perda de mercadorias.

O posicionamento dos módulos precisa ser representado no espaço local da nave.

Os disparos deverão primeiro identificar o ponto de impacto e depois determinar quais componentes podem ser atingidos.

### Modelo inicial

Para o MVP, utilizaremos zonas de dano associadas a componentes.

Posteriormente, podemos evoluir para um sistema com penetração, projéteis atravessando múltiplos módulos e destruição visual localizada.

## 8.5. Escudos, blindagem e casco

Proponho três camadas de defesa.

```text
INCOMING DAMAGE
       |
       v
     SHIELD
       |
       v
     ARMOR
       |
       v
      HULL
       |
       v
  SUBSYSTEM DAMAGE
```

O escudo absorve energia até seu limite.

A blindagem reduz ou absorve parcialmente o dano restante.

O casco recebe dano estrutural, e componentes próximos ao impacto podem ser afetados.

Cada arma poderá ter multiplicadores contra diferentes tipos de defesa.

## 8.6. Combate com asteroides

Asteroides devem bloquear projéteis e sensores quando apropriado.

Isso permitirá:

- Fugir de mísseis utilizando obstáculos.
- Esconder-se atrás de grandes asteroides.
- Atacar inimigos que estejam se aproximando.
- Utilizar o ambiente para interromper a linha de tiro.

O jogo também terá detecção por radar e assinatura.

A velocidade, a utilização de motores e os equipamentos ativos poderão afetar a assinatura detectável.

A furtividade completa ficará para uma fase posterior.

## 8.7. Inteligência artificial de combate

Não recomendo implementar a IA inicial por meio de um LLM.

Os inimigos deverão utilizar máquinas de estados, árvores de comportamento ou sistemas de utilidade.

Um comportamento inicial:

```text
PATROL
   |
   v
DETECT TARGET
   |
   v
EVALUATE THREAT
   |
   +----> ESCAPE
   |
   +----> ENGAGE
             |
             v
       APPROACH TARGET
             |
             v
       MATCH VELOCITY
             |
             v
       ATTACK TARGET
             |
             +----> EVADE
             |
             +----> REPOSITION
             |
             +----> DISENGAGE
```

Cada classe de nave utilizará parâmetros diferentes.

Por exemplo, interceptadores tentarão flanquear o alvo, enquanto fragatas procurarão manter distância e utilizar armas de longo alcance.

**A IA deverá operar com as mesmas limitações físicas do jogador.**

Não deve conseguir alterar diretamente sua velocidade ou posição para realizar manobras impossíveis.

---

# 9. Sistema de exploração espacial

O universo será dividido em setores.

Cada setor será uma cena espacial independente, conectada às demais por pontos de salto.

## 9.1. Estrutura do universo

```text
STAR SYSTEM
│
├── SECTOR 001 — STARTING ZONE
│   ├── Main Station
│   ├── Asteroid Field
│   ├── Mining Outpost
│   ├── Pirates
│   └── Jump Gate
│
├── SECTOR 002 — INDUSTRIAL BELT
│   ├── Refinery
│   ├── Dense Asteroid Field
│   ├── Cargo Routes
│   └── Jump Gates
│
├── SECTOR 003 — PIRATE TERRITORY
│   ├── Pirate Station
│   ├── Ship Wrecks
│   ├── Smuggler Cache
│   └── Combat Encounters
│
└── SECTOR 004 — ANOMALY ZONE
    ├── Gravitational Anomaly
    ├── Rare Resources
    ├── Abandoned Ship
    └── Ancient Structure
```

## 9.2. Setores

Cada setor possuirá:

```typescript
interface SectorDefinition {
  id: string;
  name: string;

  seed: number;

  environment: EnvironmentType;

  asteroidFields: AsteroidFieldDefinition[];

  stations: StationDefinition[];

  spawnTables: SpawnTable[];

  resources: ResourceDistribution[];

  anomalies: AnomalyDefinition[];

  connections: JumpConnection[];

  controllingFactionId?: string;
}
```

## 9.3. Geração procedural

O universo será gerado a partir de uma seed.

A geração deverá ser determinística.

Isso significa que a mesma seed sempre produzirá a mesma configuração inicial do universo.

O gerador deverá suportar:

- Campos de asteroides.
- Destroços.
- Estações.
- Pontos de interesse.
- Depósitos de recursos.
- Anomalias.
- Eventos de exploração.

As missões e os acontecimentos poderão modificar o estado persistido do setor, sem alterar sua seed original.

## 9.4. Campos de asteroides

Asteroides terão diferentes tamanhos, composições e propriedades.

```typescript
interface AsteroidDefinition {
  id: string;

  size: number;
  mass: number;

  composition: ResourceComposition[];

  durability: number;

  position: Vector2;
  velocity: Vector2;

  mineable: boolean;
}
```

Asteroides pequenos poderão ser destruídos.

Asteroides grandes serão obstáculos permanentes ou semipermanentes.

A geração visual poderá utilizar geometrias procedurais com deformações, materiais PBR e variações de textura.

Não precisamos simular física completa para todos os asteroides.

Objetos estáticos deverão utilizar colliders simples, enquanto objetos móveis próximos ao jogador receberão simulação.

---

# 10. Mineração e coleta de recursos

A mineração será uma das primeiras profissões disponíveis.

## 10.1. Ciclo de mineração

```text
SCAN ASTEROID
      |
      v
IDENTIFY RESOURCES
      |
      v
APPROACH ASTEROID
      |
      v
ACTIVATE MINING LASER
      |
      v
EXTRACT ORE
      |
      v
COLLECT MATERIALS
      |
      v
RETURN TO STATION
      |
      v
SELL OR REFINE
```

## 10.2. Recursos

Inicialmente:

| Recurso | Raridade | Aplicação |
|---|---|---|
| Iron Ore | Comum | Estruturas |
| Copper Ore | Comum | Equipamentos |
| Titanium Ore | Incomum | Componentes avançados |
| Platinum | Raro | Comércio e tecnologia |
| Helium-3 | Incomum | Combustível |
| Exotic Matter | Muito raro | Equipamentos especiais |

Os recursos terão massa, volume e valor comercial.

O jogador não poderá transportar quantidades ilimitadas.

## 10.3. Extração

O laser de mineração terá potência, alcance, eficiência e consumo de energia.

Exemplo:

```typescript
interface MiningLaser {
  extractionPower: number;
  range: number;
  energyConsumption: number;
  heatGeneration: number;
  optimalDistance: number;
}
```

Uma versão inicial poderá converter dano de mineração em unidades extraídas.

Posteriormente, podemos implementar fraturamento visual e fragmentação física dos asteroides.

---

# 11. Economia e comércio

A economia será responsável por conectar exploração, mineração, transporte e combate.

Ela precisa ser suficientemente profunda para gerar escolhas, mas não tão complicada que atrase o MVP.

## 11.1. Mercados locais

Cada estação possuirá seu próprio mercado.

O preço dos recursos poderá variar conforme:

- Estoque disponível.
- Demanda local.
- Especialização da estação.
- Segurança das rotas comerciais.
- Eventos do setor.
- Relações com facções.

Modelo simplificado:

\[
P=P_{\text{base}}\times M_{\text{oferta}}\times M_{\text{demanda}}\times M_{\text{evento}}
\]

Os multiplicadores devem ser limitados por faixas de preço para evitar valores extremos.

## 11.2. Inventário

```typescript
interface InventoryItem {
  itemId: string;
  quantity: number;
}

interface Inventory {
  items: InventoryItem[];

  usedMass: number;
  maxMass: number;

  usedVolume: number;
  maxVolume: number;
}
```

Toda alteração no inventário deverá recalcular a massa da nave.

Esse será um dos principais pontos de integração entre economia e física.

## 11.3. Contratos

O sistema de missões terá diferentes categorias.

| Contrato | Objetivo |
|---|---|
| Delivery | Transportar mercadorias |
| Mining | Extrair recursos |
| Bounty | Eliminar determinado inimigo |
| Salvage | Recuperar carga de destroços |
| Exploration | Investigar localização |
| Escort | Proteger uma nave |
| Recovery | Recuperar equipamento |
| Smuggling | Transportar mercadorias proibidas |

O MVP utilizará três categorias: transporte, mineração e combate.

## 11.4. Reputação

Cada facção terá uma pontuação de reputação.

```typescript
interface FactionReputation {
  factionId: string;
  reputation: number; // -100 to +100
}
```

A reputação poderá alterar os preços, contratos disponíveis, permissões de atracação e comportamento de NPCs.

No MVP, a reputação terá impacto principalmente na disponibilidade de contratos e hostilidade.

---

# 12. Estações espaciais

As estações serão elementos centrais da progressão.

## 12.1. Serviços disponíveis

```text
SPACE STATION
│
├── DOCKING
├── MARKET
├── CONTRACT BOARD
├── SHIP REPAIR
├── REFUEL
├── EQUIPMENT SHOP
├── SHIP DEALER
├── INVENTORY STORAGE
└── HANGAR
```

## 12.2. Atracação

A atracação deve ser uma mecânica de habilidade, não apenas pressionar um botão ao se aproximar.

O jogador precisará:

1. Aproximar-se de uma porta de atracação.
2. Reduzir sua velocidade.
3. Alinhar a nave.
4. Entrar no raio de aproximação.
5. Solicitar atracação.

Parâmetros iniciais:

```typescript
interface DockingRules {
  maxRelativeSpeed: number;
  maxDistance: number;
  maxAngleDifference: number;
  requiresPermission: boolean;
}
```

Valores iniciais sugeridos:

| Parâmetro | Valor |
|---|---:|
| Distância máxima para atracar | 12 m |
| Velocidade relativa máxima | 3 m/s |
| Desalinhamento máximo | 15° |

Esses valores deverão ser ajustados por playtests.

Se a nave estiver acima da velocidade segura, a atracação será recusada.

Se houver colisão com a estação, o jogador poderá sofrer danos.

## 12.3. Interface da estação

Ao atracar, o jogo abrirá uma interface com os serviços disponíveis.

Não precisamos criar interiores completos de estações espaciais.

Essa escolha reduz bastante o escopo e permite concentrar o desenvolvimento nas mecânicas principais.

---

# 13. Progressão do jogador

A progressão deverá ocorrer por três caminhos simultâneos.

### Progressão econômica

O jogador ganha créditos, compra equipamentos, melhora sua nave e eventualmente adquire embarcações maiores.

### Progressão técnica

O jogador domina pilotagem, combate, mineração e exploração.

Essa progressão acontece principalmente pela habilidade real do jogador.

### Progressão de reputação

O jogador completa contratos, estabelece relações com facções e desbloqueia oportunidades.

## 13.1. Evolução inicial

```text
STARTER SHIP
     |
     v
FIRST DELIVERY
     |
     v
MINING CONTRACT
     |
     v
FIRST SHIP UPGRADE
     |
     v
FIRST PIRATE ENCOUNTER
     |
     v
COMBAT / TRADING / MINING
     |
     v
BUY SPECIALIZED SHIP
     |
     v
EXPLORE NEW SECTORS
```

Não quero um sistema em que o jogador simplesmente aumente números indefinidamente.

Naves maiores devem oferecer vantagens e desvantagens.

Uma nave de transporte pesada deverá ser melhor para comércio, mas pior para perseguições.

Uma nave pequena e bem equipada poderá derrotar inimigos maiores se o piloto souber explorar suas limitações.

---

# 14. Arquitetura técnica para desenvolvimento com IA

Esta é a parte mais importante para transformar a especificação em um projeto implementável.

Minha recomendação é utilizar uma arquitetura **ECS (Entity Component System)**, mantendo a física, a lógica de gameplay e a renderização separadas.

## 14.1. Stack recomendada

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Linguagem | TypeScript | Código principal |
| Engine gráfica | Three.js | Renderização 3D |
| Build | Vite | Desenvolvimento e distribuição |
| Física espacial | Implementação própria | Dinâmica newtoniana 2D |
| Colisões | Rapier, adaptado para 2D | Detecção e resposta física |
| ECS | bitECS ou implementação leve | Entidades e componentes |
| Interface | React | Menus, inventário e HUD |
| Estado da UI | Zustand | Estado visual |
| Áudio | Web Audio API | Som espacial e efeitos |
| Persistência | IndexedDB | Salvamento local |
| Testes unitários | Vitest | Física, economia e gameplay |
| Testes E2E | Playwright | Fluxos completos |
| Desktop futuro | Tauri | Aplicação instalável |

**Uma decisão técnica importante:** como a simulação é planar, prefiro utilizar a física 2D do Rapier, mantendo as coordenadas visuais 3D como uma representação desse plano.

Não recomendo misturar a física nativa do Rapier com outra implementação de integração de movimento para as mesmas entidades. A arquitetura deverá escolher uma única fonte de verdade.

Minha proposta:

- Integrador newtoniano próprio para naves e projéteis.
- Rapier para consultas e resolução de colisões, quando necessário.
- Um único sistema de integração controla o movimento de cada entidade.
- Objetos físicos sincronizados de maneira determinística.

Essa arquitetura deverá ser validada no primeiro protótipo.

## 14.2. Estrutura de diretórios

```text
void-frontier/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   └── public/
│   │
│   └── desktop/
│
├── packages/
│   │
│   ├── core/
│   │   ├── ecs/
│   │   ├── events/
│   │   ├── math/
│   │   ├── simulation/
│   │   └── time/
│   │
│   ├── physics/
│   │   ├── movement/
│   │   ├── collisions/
│   │   ├── thrusters/
│   │   └── navigation/
│   │
│   ├── gameplay/
│   │   ├── ships/
│   │   ├── weapons/
│   │   ├── projectiles/
│   │   ├── damage/
│   │   ├── mining/
│   │   ├── inventory/
│   │   ├── economy/
│   │   ├── missions/
│   │   ├── factions/
│   │   ├── exploration/
│   │   └── progression/
│   │
│   ├── ai/
│   │   ├── behavior/
│   │   ├── navigation/
│   │   ├── combat/
│   │   └── utility/
│   │
│   ├── universe/
│   │   ├── generation/
│   │   ├── sectors/
│   │   ├── asteroids/
│   │   ├── stations/
│   │   └── anomalies/
│   │
│   ├── rendering/
│   │   ├── camera/
│   │   ├── ships/
│   │   ├── environments/
│   │   ├── particles/
│   │   ├── lighting/
│   │   └── materials/
│   │
│   ├── ui/
│   │   ├── hud/
│   │   ├── inventory/
│   │   ├── stations/
│   │   ├── missions/
│   │   └── settings/
│   │
│   ├── content/
│   │   ├── ships/
│   │   ├── weapons/
│   │   ├── equipment/
│   │   ├── missions/
│   │   └── localization/
│   │
│   └── persistence/
│       ├── saves/
│       ├── migrations/
│       └── serialization/
│
├── assets/
│   ├── models/
│   ├── textures/
│   ├── audio/
│   └── shaders/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── performance/
│
├── docs/
│   ├── architecture/
│   ├── gameplay/
│   ├── technical/
│   └── decisions/
│
├── AGENTS.md
├── README.md
├── package.json
└── pnpm-workspace.yaml
```

## 14.3. Simulation loop

A simulação deverá funcionar em uma frequência fixa de 60 Hz.

O rendering será independente.

```typescript
const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25;

let accumulator = 0;
let previousTime = performance.now();

function frame(now: number): void {
  const elapsed = Math.min(
    (now - previousTime) / 1000,
    MAX_FRAME_TIME
  );

  previousTime = now;
  accumulator += elapsed;

  input.capture();

  while (accumulator >= FIXED_DT) {
    simulation.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;

  renderer.render(alpha);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

Essa implementação é apenas o esqueleto inicial.

A versão definitiva deverá limitar a quantidade de passos acumulados por frame e definir uma política para máquinas que não consigam acompanhar a simulação.

Além disso, entradas devem ser registradas de forma que cada passo de simulação processe corretamente os comandos correspondentes.

## 14.4. Ordem dos sistemas

A ordem importa, pois diferentes sistemas possuem dependências.

```text
1. Input System
2. Ship Control System
3. AI Decision System
4. Thruster System
5. Energy System
6. Weapon System
7. Physics Integration
8. Collision System
9. Damage System
10. Mining System
11. Inventory System
12. Mission System
13. Economy System
14. Event Processing
15. Persistence Scheduling
16. Rendering Synchronization
```

Alguns sistemas poderão executar em frequências diferentes.

Por exemplo, a economia não precisa atualizar 60 vezes por segundo.

A frequência da economia poderá ser de 1 Hz, enquanto a física permanecerá em 60 Hz.

---

# 15. Sistema de dados

Quero que o agente implemente o jogo utilizando definições declarativas sempre que possível.

Não devemos precisar modificar código-fonte para adicionar uma nave ou alterar o dano de uma arma.

## 15.1. Exemplo de definição de nave

```json
{
  "id": "scout_mk1",
  "name": "Scout MK-I",
  "class": "scout",
  "description": "Light exploration vessel.",
  "physics": {
    "dryMass": 8000,
    "mainThrust": 160000,
    "reverseThrust": 80000,
    "lateralThrust": 50000,
    "rotationalTorque": 450000
  },
  "hull": {
    "integrity": 1000,
    "armor": 100
  },
  "reactor": {
    "maxPower": 100
  },
  "cargo": {
    "maxMass": 2000,
    "maxVolume": 20
  },
  "fuel": {
    "capacity": 500
  },
  "hardpoints": [
    {
      "id": "primary_1",
      "size": "small",
      "position": [2, 0]
    },
    {
      "id": "primary_2",
      "size": "small",
      "position": [-2, 0]
    }
  ]
}
```

Os valores são parâmetros iniciais de balanceamento.

## 15.2. Exemplo de arma

```json
{
  "id": "autocannon_mk1",
  "name": "Autocannon MK-I",
  "type": "ballistic",
  "damage": 25,
  "fireRate": 8,
  "projectileSpeed": 450,
  "projectileLifetime": 4,
  "energyConsumption": 2,
  "heatPerShot": 4,
  "maxHeat": 100,
  "coolingRate": 12,
  "range": 1800
}
```

Todas as definições deverão ser validadas com schemas.

Recomendo Zod para validação dos dados TypeScript.

---

# 16. Interface do jogador

A interface deve ser funcional, limpa e orientada à pilotagem.

## 16.1. HUD

```text
+--------------------------------------------------------------+
| CREDITS: 2,450                  SECTOR: INDUSTRIAL BELT       |
|                                                              |
|                        [ TARGET ]                            |
|                        PIRATE SCOUT                          |
|                        DIST: 1.2 KM                          |
|                                                              |
|                                                              |
|                        +                                     |
|                    PLAYER SHIP                               |
|                                                              |
|                                                              |
| SPEED: 125 m/s                         RADAR                  |
| VECTOR: 045°                       +-------------+           |
| HEADING: 030°                      |    .        |           |
|                                   |  .    P     |           |
| HULL   [===================]      |      .      |           |
| SHIELD [==============     ]      +-------------+           |
| FUEL   [================   ]                                  |
| ENERGY [==============     ]                                  |
|                                                              |
| WEAPON 1: AUTOCANNON     AMMO: 350                           |
| WEAPON 2: MISSILES      AMMO: 8                              |
+--------------------------------------------------------------+
```

## 16.2. Informações essenciais

O jogador precisa visualizar:

- Velocidade atual.
- Direção do deslocamento.
- Orientação da nave.
- Integridade do casco.
- Escudos.
- Combustível.
- Energia.
- Armas e munições.
- Alvo selecionado.
- Radar.
- Objetivo atual.

**A direção da velocidade e a orientação da nave devem aparecer separadamente.**

Essa informação é fundamental em um jogo de física newtoniana.

## 16.3. Radar

O radar apresentará:

| Símbolo | Significado |
|---|---|
| Triângulo verde | Nave aliada |
| Triângulo vermelho | Nave hostil |
| Ponto cinza | Asteroide |
| Quadrado azul | Estação |
| Losango amarelo | Objetivo |
| Círculo roxo | Anomalia |

A representação deverá considerar alcance e capacidade dos sensores.

---

# 17. Persistência

O salvamento será local no navegador.

Utilizaremos IndexedDB, com serialização versionada.

## 17.1. Dados persistidos

```typescript
interface SaveGame {
  version: number;

  metadata: {
    id: string;
    createdAt: string;
    updatedAt: string;
    playtime: number;
  };

  player: PlayerState;

  ownedShips: ShipInstance[];

  inventory: InventoryState;

  missions: MissionState[];

  reputation: FactionReputation[];

  universe: UniverseState;

  economy: EconomyState;
}
```

## 17.2. Requisitos

O sistema deverá suportar:

- Salvamento manual.
- Salvamento automático.
- Múltiplos slots.
- Importação de save.
- Exportação de save.
- Migração entre versões.
- Verificação de integridade.
- Recuperação de erros de gravação.

Uma regra importante: o salvamento deve capturar um estado consistente da simulação.

Não pode registrar metade de uma transação de compra ou transferência de inventário.

---

# 18. MVP — primeira versão jogável

Aqui está a versão que eu realmente passaria ao agente para construir primeiro.

Não tentaria implementar todos os sistemas descritos anteriormente.

O objetivo é criar uma experiência pequena, mas completa.

## MVP 0.1 — Vertical Slice

### Conteúdo

| Sistema | Escopo |
|---|---|
| Universo | 1 setor |
| Naves | 2 modelos |
| Física | Newtoniana e assistida |
| Armas | Autocannon e laser |
| Inimigos | 1 tipo de pirata |
| Asteroides | 3 tipos |
| Recursos | 3 minerais |
| Estações | 1 |
| Comércio | Compra e venda |
| Missões | 3 categorias |
| Inventário | Massa e volume |
| Progressão | 4 melhorias |
| Salvamento | Local |
| Idioma | PT-BR |
| Áudio | Efeitos básicos |

## 18.1. Primeiro setor

Nome provisório: **Outpost Alpha**.

O setor terá:

```text
OUTPOST ALPHA
│
├── SPACE STATION
│   ├── Market
│   ├── Repair
│   ├── Refuel
│   └── Contracts
│
├── ASTEROID FIELD
│   ├── Iron
│   ├── Copper
│   └── Titanium
│
├── PIRATE PATROL AREA
│   ├── Pirate Scout
│   └── Salvage
│
└── EXPLORATION AREA
    ├── Abandoned Wreck
    └── Hidden Resource Deposit
```

O jogador começará atracado na estação.

Receberá uma nave básica, combustível e alguns créditos.

Poderá escolher entre minerar, transportar mercadorias e enfrentar piratas.

## 18.2. Loop principal do MVP

```text
START GAME
    |
    v
DOCKED AT STATION
    |
    v
SELECT CONTRACT
    |
    v
UNDOCK
    |
    v
FLY THROUGH SECTOR
    |
    +----> MINE ASTEROIDS
    |
    +----> FIGHT PIRATES
    |
    +----> COLLECT CARGO
    |
    v
RETURN TO STATION
    |
    v
DOCK
    |
    v
SELL RESOURCES
    |
    v
COMPLETE CONTRACT
    |
    v
EARN CREDITS
    |
    v
UPGRADE SHIP
    |
    +----> REPEAT
```

A primeira versão será considerada completa quando esse ciclo funcionar sem intervenções do desenvolvedor.

---

# 19. Plano de implementação para o agente

Sugiro dividir o trabalho em marcos incrementais.

Cada marco deverá terminar com uma versão executável e testes automatizados.

## Fase 1 — Foundation

**Objetivo:** criar a base arquitetural.

Entregáveis:

- Monorepo TypeScript.
- Aplicação Vite.
- Cena Three.js.
- Simulation loop.
- Sistema de entidades.
- Gerenciamento de entrada.
- Câmera.
- Instrumentação de FPS.
- Testes básicos.

### Critério de aceitação

Uma cena espacial deve ser renderizada com uma nave estática e câmera funcional.

## Fase 2 — Flight Physics

**Objetivo:** implementar a pilotagem.

Entregáveis:

- Propulsão.
- Inércia.
- Rotação.
- Movimento lateral.
- Frenagem.
- Modo assistido.
- Combustível.
- Massa variável.
- HUD de navegação.

### Critério de aceitação

O jogador consegue controlar uma nave em espaço aberto, acelerar, girar, deslocar-se lateralmente e parar utilizando propulsores.

A massa da carga afeta mensuravelmente a aceleração.

## Fase 3 — Environment

**Objetivo:** construir o primeiro cenário.

Entregáveis:

- Campo de asteroides.
- Skybox espacial.
- Estação.
- Iluminação.
- Colisões.
- Efeitos de motores.
- Sistema de câmera aprimorado.

### Critério de aceitação

O jogador consegue navegar por um campo de asteroides e aproximar-se de uma estação.

## Fase 4 — Combat

**Objetivo:** implementar o primeiro combate.

Entregáveis:

- Autocannon.
- Laser.
- Projéteis.
- Alvos.
- Mira preditiva.
- Dano.
- Destruição.
- Primeiro inimigo com IA.

### Critério de aceitação

O jogador consegue localizar um pirata, combatê-lo e destruí-lo.

A IA consegue perseguir, atacar e recuar sem violar as regras físicas.

## Fase 5 — Mining

**Objetivo:** implementar extração de recursos.

Entregáveis:

- Scanner.
- Recursos minerais.
- Laser de mineração.
- Extração.
- Inventário.
- Massa variável.
- Coleta.

### Critério de aceitação

O jogador consegue encontrar um asteroide, minerá-lo e transportar os recursos.

## Fase 6 — Station & Economy

**Objetivo:** fechar o ciclo econômico.

Entregáveis:

- Atracação.
- Interface de estação.
- Mercado.
- Compra e venda.
- Reparos.
- Reabastecimento.
- Créditos.
- Melhorias da nave.

### Critério de aceitação

O jogador consegue minerar recursos, atracar, vender a carga e comprar uma melhoria.

## Fase 7 — Missions

**Objetivo:** criar progressão orientada por objetivos.

Entregáveis:

- Contratos.
- Missões de transporte.
- Missões de mineração.
- Missões de combate.
- Recompensas.
- Histórico.
- Reputação básica.

### Critério de aceitação

O jogador consegue aceitar, realizar e concluir contratos de diferentes categorias.

## Fase 8 — Polish & Release

**Objetivo:** transformar o protótipo em um MVP publicável.

Entregáveis:

- Menus.
- Configurações.
- Áudio.
- Efeitos.
- Salvamento.
- Tutorial.
- Correções.
- Otimizações.
- Documentação.

### Critério de aceitação

Um jogador consegue iniciar uma nova partida, aprender os controles e completar o ciclo principal sem ajuda externa.

---

# 20. Testes automatizados

Um agente de IA precisa de mecanismos objetivos para verificar o próprio trabalho.

Não basta criar arquivos, executar o build e declarar que o jogo está pronto.

Precisamos definir testes para as principais mecânicas.

## 20.1. Testes de física

| Teste | Resultado esperado |
|---|---|
| Aplicar propulsão | A velocidade aumenta |
| Desligar propulsão | A velocidade permanece constante |
| Ativar propulsão reversa | A velocidade diminui |
| Aumentar massa | A aceleração diminui |
| Rotacionar sem propulsão | A trajetória permanece |
| Aplicar propulsão lateral | A velocidade lateral muda |
| Consumir combustível | A quantidade disponível diminui |
| Colidir com asteroide | O casco recebe dano |

### Exemplo

```typescript
import { describe, expect, it } from "vitest";

describe("Ship physics", () => {
  it("preserves velocity without forces", () => {
    const ship = createTestShip();

    ship.velocity.x = 100;
    ship.velocity.y = 0;

    simulate(ship, 1);

    expect(ship.velocity.x).toBeCloseTo(100);
    expect(ship.velocity.y).toBeCloseTo(0);
  });

  it("reduces acceleration when cargo mass increases", () => {
    const emptyShip = createTestShip();
    const loadedShip = createTestShip();

    loadedShip.cargoMass = 5000;

    const emptyAcceleration = calculateAcceleration(
      emptyShip
    );

    const loadedAcceleration = calculateAcceleration(
      loadedShip
    );

    expect(loadedAcceleration).toBeLessThan(
      emptyAcceleration
    );
  });
});
```

## 20.2. Testes de combate

Devem verificar:

- Projéteis causam dano.
- Projéteis expiram.
- Obstáculos bloqueiam disparos.
- A mira preditiva funciona com movimento constante.
- Componentes recebem dano localizado.
- Naves são destruídas corretamente.
- Armas consomem energia e munição.
- Não existe dano duplicado por uma única colisão.

## 20.3. Testes de economia

Devem verificar:

- Compra reduz créditos.
- Venda aumenta créditos.
- Estoque é atualizado.
- Inventário respeita capacidade.
- Não é possível vender quantidade inexistente.
- Massa da carga é atualizada.
- Contratos não concedem recompensa duplicada.

## 20.4. Testes E2E

O Playwright deverá validar os principais fluxos.

Por exemplo:

```text
NEW GAME
  -> START AT STATION
  -> UNDOCK
  -> FLY TO ASTEROID
  -> MINE RESOURCE
  -> COLLECT RESOURCE
  -> RETURN TO STATION
  -> DOCK
  -> SELL RESOURCE
  -> VERIFY CREDIT BALANCE
  -> SAVE GAME
  -> RELOAD GAME
  -> VERIFY PROGRESS
```

Esse fluxo precisa ser executável de maneira automatizada.

Para isso, a aplicação deverá disponibilizar uma interface de testes em modo de desenvolvimento, permitindo controlar comandos e avançar a simulação sem depender exclusivamente de interações visuais.

---

# 21. Requisitos de performance

Como a plataforma inicial será o navegador, performance deve ser considerada desde o começo.

Metas propostas para o MVP, em um computador de referência de nível intermediário:

| Métrica | Meta |
|---|---|
| FPS | 60 |
| Simulação | 60 Hz |
| Naves ativas | 20 |
| Projéteis simultâneos | 200 |
| Asteroides visíveis | 500 |
| Tempo de carregamento inicial | Menor que 10 s |
| Memória | Até 1 GB |
| Resolução de referência | 1920 × 1080 |

São metas de engenharia, não resultados medidos.

Para atingi-las, recomendo:

- InstancedMesh para asteroides.
- Object pooling para projéteis e partículas.
- Culling por distância.
- LOD para objetos espaciais.
- Atualização de IA por frequência variável.
- Física simplificada para objetos distantes.
- Carregamento incremental de recursos.
- Limitação explícita de efeitos de partículas.
- Profiling contínuo de CPU, GPU e memória.

---

# 22. O que não implementar inicialmente

Esta lista é tão importante quanto a lista de funcionalidades.

O agente deverá evitar implementar:

- Multiplayer.
- Servidor dedicado.
- Universo persistente online.
- Construção livre de naves peça por peça.
- Interiores exploráveis de estações.
- Personagens humanos caminhando.
- Combate em primeira pessoa.
- Planetary landing.
- Superfícies planetárias exploráveis.
- Economia totalmente simulada em tempo real.
- Centenas de facções.
- Simulação gravitacional completa de múltiplos corpos.
- Física orbital realista para todo o universo.
- Destruição física de cada componente visual.
- Sistemas de crafting complexos.
- Narrativa procedural gerada por LLM.
- Geração de todo o universo simultaneamente.

Esses sistemas poderão ser considerados posteriormente.

O principal risco do projeto é implementar muitos sistemas parcialmente, sem entregar um gameplay divertido.

---

# 23. Evolução depois do MVP

Após a versão 0.1, eu dividiria o desenvolvimento em quatro grandes etapas.

| Versão | Objetivo | Funcionalidades |
|---|---|---|
| 0.1 | Vertical Slice | Pilotagem, combate, mineração, economia |
| 0.2 | Expansão espacial | Múltiplos setores, saltos, exploração |
| 0.3 | Profundidade | Subsistemas, facções, equipamentos avançados |
| 0.4 | Universo dinâmico | Comércio NPC, eventos, rotas, reputação |
| 0.5 | Sandbox avançado | Múltiplas naves, hangar, especializações |
| 1.0 | Jogo completo | Conteúdo, balanceamento, narrativa, polimento |

Na versão 0.2, adicionaria o sistema de navegação entre setores.

Na 0.3, priorizaria o combate com subsistemas, pois é uma das mecânicas mais interessantes de C-Beams.

Na 0.4, desenvolveria uma economia regional em que os NPCs também transportam recursos.

Na 0.5, incluiria a capacidade de possuir múltiplas naves e alternar entre diferentes especializações.

---

# 24. Como eu organizaria os agentes de IA

Como pretende utilizar agentes de desenvolvimento, considero importante definir responsabilidades técnicas.

Minha proposta é trabalhar com um agente principal coordenando agentes especializados.

```text
                    GAME DIRECTOR
                          |
                          v
                    TECHNICAL LEAD
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
    GAMEPLAY AGENT   GRAPHICS AGENT    UI AGENT
          |               |               |
          v               v               v
    Physics/Combat    Three.js/VFX    React/HUD
          |
          v
     WORLD AGENT
          |
          v
    Universe/Economy
          |
          +---------------+
                          |
                          v
                      QA AGENT
                          |
                          v
                 AUTOMATED TESTING
```

## Responsabilidades

**Game Director:** mantém os objetivos do produto, escopo do MVP, coerência das mecânicas e experiência do jogador.

**Technical Lead:** define contratos entre módulos, arquitetura, regras de integração e qualidade técnica.

**Gameplay Agent:** implementa física, combate, movimentação, mineração e sistemas de naves.

**Graphics Agent:** implementa renderização, câmera, materiais, efeitos, iluminação e modelos procedurais.

**World Agent:** desenvolve setores, geração procedural, economia, contratos e comportamento de NPCs.

**UI Agent:** desenvolve HUD, menus, inventário, estação, configurações e interações.

**QA Agent:** cria testes, valida os critérios de aceitação, executa cenários e registra problemas reproduzíveis.

### Regras de colaboração

Cada agente deverá trabalhar em tarefas com escopo claramente definido.

O Technical Lead deverá estabelecer interfaces antes de distribuir implementações paralelas.

Nenhum agente poderá modificar contratos compartilhados sem registrar a alteração.

Cada entrega deverá incluir testes e documentação.

O QA Agent deverá verificar a integração e não apenas a funcionalidade isolada.

Eu também criaria um arquivo `AGENTS.md` na raiz do projeto, em inglês, estabelecendo essas regras para qualquer ferramenta utilizada.

Isso permitirá trabalhar com Cursor, Codex, Claude Code, OpenCode ou outros agentes sem criar instruções completamente diferentes para cada um.

---

# 25. Prompt inicial para o agente

Abaixo está o briefing que utilizaria para começar efetivamente a implementação.

# VOID FRONTIER — MASTER IMPLEMENTATION BRIEF

## Role

You are a senior game development AI agent responsible for designing and implementing a production-quality, browser-based space action RPG.

Your goal is to create an original game inspired by the gameplay principles of Newtonian space simulators, including C-Beams.

Do not reproduce proprietary code, copyrighted assets, recognizable ship designs, names, storylines, or branding from existing games.

Implement original gameplay systems, visual assets, content, and technical solutions.

## Project Vision

Build a 3D top-down space action RPG featuring:

- Newtonian spacecraft physics.
- Independent ship orientation and velocity.
- Modular spacecraft.
- Tactical ship-to-ship combat.
- Mining and resource collection.
- Cargo management.
- Space station docking.
- Trading and economic progression.
- Contracts and missions.
- AI-controlled spacecraft.
- Persistent player progression.

The initial target is a playable vertical slice running directly in modern desktop browsers.

The architecture must support future desktop distribution.

## Technical Stack

Use:

- TypeScript.
- Three.js.
- Vite.
- React for the interface.
- An ECS-oriented gameplay architecture.
- Fixed-timestep simulation.
- Vitest for unit and integration testing.
- Playwright for end-to-end testing.
- IndexedDB for persistence.

Additional dependencies may be introduced when technically justified.

Keep rendering, simulation, content definitions, and user interface decoupled.

## Engineering Principles

1. Write all source code, comments, documentation, identifiers, and commit messages in English.
2. Use TypeScript strict mode.
3. Prefer modular, composable systems.
4. Keep simulation logic independent from rendering.
5. Store gameplay configuration in validated data files.
6. Use deterministic generation where appropriate.
7. Implement automated tests for core mechanics.
8. Avoid unnecessary dependencies.
9. Avoid premature optimization while respecting performance budgets.
10. Never replace unfinished functionality with misleading placeholders.
11. Do not claim that a feature works without validation.
12. Keep the application executable after every milestone.
13. Document architectural decisions.
14. Use original or properly licensed assets.
15. Do not expand beyond the approved milestone scope.

## Simulation Requirements

Implement a fixed-timestep simulation targeting 60 Hz.

The initial game operates on a two-dimensional movement plane while using three-dimensional rendering.

Spacecraft must support:

- Linear velocity.
- Angular velocity.
- Main propulsion.
- Reverse propulsion.
- Lateral propulsion.
- Rotation control.
- Variable mass.
- Fuel consumption.
- Newtonian inertia.
- Assisted flight controls.

When all forces are zero, a spacecraft must maintain its velocity.

Changing ship orientation alone must not change the velocity vector.

Increasing ship mass must reduce acceleration for the same thrust.

## Rendering Requirements

Create a visually convincing industrial science-fiction aesthetic.

Use original procedural assets when possible.

Implement:

- A top-down perspective camera.
- A spacecraft model with visible thrusters.
- Engine exhaust effects.
- Directional lighting.
- Space background.
- Basic post-processing where justified.
- Camera smoothing.
- Adjustable zoom.
- Velocity-aware camera framing.

Prioritize readability and stable performance.

## Gameplay Requirements

The first vertical slice must include:

- One playable sector.
- One functional space station.
- Two spacecraft definitions.
- One enemy spacecraft type.
- Basic enemy AI.
- Two weapons.
- Three mineral resources.
- Mining.
- Cargo collection.
- Trading.
- Three mission categories.
- Ship repairs.
- Refueling.
- Basic upgrades.
- Save and load.

All systems must work together in a complete gameplay loop.

## Architecture Requirements

Create separate packages or modules for:

- Core simulation.
- Physics.
- Gameplay.
- Artificial intelligence.
- Universe generation.
- Rendering.
- User interface.
- Content.
- Persistence.

Define clear interfaces and dependency boundaries.

Use data-driven definitions for ships, weapons, equipment, resources, and missions.

Maintain versioned save-game structures.

## Development Workflow

Start by inspecting the repository and documenting its current state.

If the repository is empty, initialize the project.

Create:

- README.md
- AGENTS.md
- docs/architecture.md
- docs/game-design.md
- docs/implementation-plan.md
- docs/decisions/
- docs/progress.md

Plan implementation as independently verifiable milestones.

For each milestone:

1. Define the technical requirements.
2. Identify dependencies.
3. Implement the smallest complete solution.
4. Add automated tests.
5. Run type checking and linting.
6. Run the test suite.
7. Build the application.
8. Validate the feature in a browser when possible.
9. Update documentation.
10. Record any known limitations.

Do not advance to the next milestone while critical acceptance criteria remain unmet.

## First Milestone

Implement the foundation and spacecraft flight physics.

Deliver:

1. A functional Vite application.
2. A Three.js scene.
3. A controllable spacecraft.
4. A fixed-timestep simulation.
5. Newtonian movement.
6. Main, reverse, and lateral thrusters.
7. Ship rotation.
8. An assisted flight mode.
9. A basic navigation HUD.
10. Unit tests for physics.
11. A development debug overlay.

The spacecraft must remain controllable using a keyboard and mouse.

The HUD must show:

- Speed.
- Heading.
- Velocity direction.
- Fuel.
- Current flight mode.

## Acceptance Criteria

The first milestone is complete when:

- The game launches successfully.
- The spacecraft accelerates under thrust.
- The spacecraft maintains velocity without thrust.
- The spacecraft rotates independently of its velocity.
- The spacecraft can move laterally.
- Reverse thrust reduces forward velocity.
- Fuel consumption works.
- Increasing mass reduces acceleration.
- Assisted flight is functional.
- The camera follows the spacecraft.
- The simulation remains stable under normal frame-rate variation.
- Automated physics tests pass.
- The application builds successfully.

## Important Restrictions

Do not implement multiplayer.

Do not implement complex orbital mechanics.

Do not implement planetary surfaces.

Do not implement procedural narratives.

Do not implement advanced ship construction.

Do not start the economy or combat systems before the flight foundation is validated.

The immediate goal is not to build every feature.

The immediate goal is to build an excellent and technically sound spacecraft flight experience that can support the complete game.

## Expected Output

Produce a working implementation, not merely a design proposal.

Begin with repository inspection, architecture documentation, and the first implementation milestone.

At the end, provide:

- Implemented features.
- Tests executed and results.
- Build status.
- Files created or modified.
- Known limitations.
- Recommended next milestone.

---

# 26. O que eu faria diferente de C-Beams

Até aqui, nossa especificação procura reproduzir os principais princípios mecânicos apresentados publicamente por C-Beams.

Mas, pensando em construir um jogo original com potencial de crescimento, eu adicionaria três diferenciais importantes.

## 26.1. Economia realmente dinâmica

Em vez de estações espaciais possuírem somente preços de compra e venda, eu permitiria que mercadorias fossem transportadas por NPCs.

Imagine:

Uma estação mineradora produz minério.

Uma estação industrial compra esse minério e fabrica equipamentos.

Uma estação militar compra equipamentos da estação industrial.

Piratas atacam os transportadores.

Se muitos transportadores forem destruídos, a estação militar começará a enfrentar escassez.

Isso provoca aumento de preços e gera novos contratos para o jogador.

Teríamos uma economia orientada por eventos e fluxos de mercadorias.

O jogador poderia influenciar diretamente esse sistema.

## 26.2. Tripulações e agentes autônomos

Esse seria um diferencial particularmente interessante.

Em uma etapa avançada, o jogador poderia contratar pilotos para controlar outras naves.

Por exemplo:

```text
PLAYER
   |
   +---- MINING SHIP
   |        |
   |        +---- Mine asteroids
   |        +---- Return cargo
   |
   +---- TRADING SHIP
   |        |
   |        +---- Buy resources
   |        +---- Sell resources
   |
   +---- ESCORT SHIP
            |
            +---- Protect convoy
            +---- Engage pirates
```

O jogador poderia estabelecer políticas e ordens para sua pequena frota.

A operação dessas naves não dependeria necessariamente de LLMs. Sistemas determinísticos seriam mais rápidos e baratos.

Mas agentes de IA poderiam acrescentar funcionalidades mais sofisticadas, como planejamento de contratos, avaliação econômica e estratégias de exploração.

Assim, o jogo começaria como um RPG espacial e poderia evoluir para uma combinação de **simulador espacial com gerenciamento de frota**.

## 26.3. Universo modificável pela comunidade

Como estamos pensando em um projeto open source, eu construiria o conteúdo em arquivos declarativos, com uma API de extensões.

Isso permitiria criar:

- Novas naves.
- Novas armas.
- Novos módulos.
- Novas facções.
- Novos setores.
- Novos contratos.
- Novas mecânicas.

Uma comunidade poderia manter pacotes independentes de conteúdo, enquanto o núcleo do jogo continuaria estável.

É uma forma de aproveitar a mesma filosofia de modularidade e colaboração que tornou ecossistemas como o OCA sustentáveis.

---

# 27. Priorização e avaliação final

Considerando o potencial do jogo e a dificuldade de implementação, minha classificação é:

| Sistema | Valor para o jogo | Complexidade | Prioridade |
|---|---|---|---|
| Física newtoniana | Muito alto | Média | P0 |
| Controle da nave | Muito alto | Média | P0 |
| Câmera e HUD | Muito alto | Média | P0 |
| Combate básico | Muito alto | Média | P0 |
| Asteroides | Alto | Baixa | P0 |
| IA inimiga | Alto | Média | P0 |
| Mineração | Alto | Média | P1 |
| Inventário | Alto | Baixa | P1 |
| Atracação | Alto | Média | P1 |
| Comércio | Alto | Baixa | P1 |
| Missões | Alto | Média | P1 |
| Equipamentos | Alto | Média | P1 |
| Múltiplos setores | Alto | Média | P2 |
| Subsistemas de dano | Muito alto | Alta | P2 |
| Facções | Médio | Média | P2 |
| Economia dinâmica | Muito alto | Alta | P3 |
| Frota autônoma | Muito alto | Alta | P3 |
| Multiplayer | Variável | Muito alta | Fora do escopo |

### Meu direcionamento

Eu desenvolveria Void Frontier com três princípios:

**1. Física antes de conteúdo.** Uma única nave muito bem implementada vale mais do que vinte naves com movimentação ruim.

**2. Gameplay completo antes de expansão.** Um setor divertido, com combate, mineração e comércio, vale mais do que um universo enorme e vazio.

**3. Arquitetura aberta desde o início.** Precisamos permitir que outras pessoas — e outros agentes de IA — acrescentem conteúdo sem reescrever o jogo inteiro.

O projeto é tecnicamente viável para desenvolvimento incremental com agentes de IA, especialmente se cada marco possuir testes automatizados e um resultado jogável.

**Minha recomendação é começar pelo protótipo de pilotagem newtoniana com Three.js e TypeScript.** Ele permitirá avaliar rapidamente se a principal mecânica de C-Beams funciona bem no navegador. Quando essa base estiver convincente, combate, mineração e economia poderão ser desenvolvidos sem precisar reconstruir o núcleo do jogo.

A referência central continua sendo a documentação oficial de C-Beams e o anúncio da Hooded Horse, que confirmam seus principais pilares de física, combate, exploração e progressão. [Steam Store](https://store.steampowered.com/app/3102780/CBeams/?utm_source=chatgpt.com)
