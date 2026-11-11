# City packs — specification (draft 1)

Status: **implemented.** The server compiles every folder in `packs/` when it starts and the game plays whatever they describe.

Full example: [`packs/maple-city/`](../packs/maple-city/) is today's Maple City written in this format
(13 places, 8 pedestrians, 10 actions, 12 missions). The snippets below are shortened excerpts of it.
A second city, [`packs/london/`](../packs/london/), shows what changes from one city to the next: map, currency,
places, mission ids and a flag of its own (`oyster`).

## 1. Goal

Create a new city, its characters, shops and missions **without writing JavaScript**. A city is a folder of
text files (a *city pack*). The game validates it, compiles it and runs it.

Success looks like this:

- A teacher who has never opened `shared/missions.js` adds a pharmacy with a pharmacist and a mission by editing
  two YAML files, and gets a clear error message if something is wrong.
- A second city (for example London) is added with zero changes to the engine.
- Maple City, converted to a pack, plays exactly as it does today and the current tests still pass.

Not goals for this phase: a visual editor, uploading packs through the game, 3D interiors, WebAssembly.
The format leaves room for the first three (section 9).

## 2. Why a data format and not a programming language

Most of the world is already data: `shared/world.js`, `shared/npcs.js` and the catalogs in `shared/data.js`
contain no logic. The only real code lives in the mission templates (`objective`, `isComplete`, `requires`)
and in `validateAction`. Reading those functions, they only ever do four things:

1. fill text with values (prices, the player's profession, a place name);
2. include a sentence depending on the player's situation (has a phone or not);
3. check a condition (did the NPC emit `rent`? is the player level A2?);
4. clamp a number the AI proposed (a fare between $35 and $100).

Four small declarative building blocks cover all of it: **text templates**, **conditions**, **actions with
limits**, and **effects**. No loops, no variables, no functions. That keeps packs safe to load from strangers
(a pack can never run code) and easy to validate.

## 3. Layout of a pack

```
packs/
  maple-city/
    city.yaml        identity, language, currency, starting money, story order, daily pool
    map.yaml         size, roads, park, decoration, spawn
    places.yaml      every place you can enter: building + character + price list + vocabulary
    people.yaml      pedestrians for small talk
    actions.yaml     what characters are allowed to do in this city, with limits and effects
    missions.yaml    story, job and daily missions
    assets/          (optional) sprites, later 3D models
```

YAML is for people (comments, multi-line text). The compiler turns a pack into one JSON file that the
client and the server both load, so they can never disagree about prices or rules.

## 4. The files

### 4.1 `city.yaml`

```yaml
pack: 1                    # format version, so old packs keep loading when the format grows
id: maple-city
version: 1.0.0             # version of this city, recorded in saves
name: Maple City
country: United States
flag: 🇺🇸
language: en-US            # what characters speak
currency: { symbol: "$", code: USD }
start: { money: 600, mission: arrival_taxi }

story: [arrival_taxi, lodging, get_phone, open_bank, job_interview]

daily:
  count: 3                 # missions picked per day (deterministic per player and day)
  pool:
    - { mission: shop, with: { place: bakery,  items: { pick: 2, qty: [1, 2] } } }
    - { mission: shop, with: { place: grocery, items: { pick: 3, qty: [1, 2], where: food } } }
    - { mission: shop, with: { place: cafe,    items: { pick: 2 } } }
    - { mission: shop, with: { place: diner,   items: { pick: 1, where: "food > 30", plus: [soda, tip] } } }
    - { mission: barber_cut, with: { style: { one_of: ["short fade with a little off the top", "just a trim, keep the length", "buzz cut, number 2 clippers"] } } }
    - { mission: chat_people, with: { count: 2 } }
    - { mission: online_chat }

jobs:                      # where each profession works in this city, and the pay per shift
  nurse: { workplace: clinic,  wage: 190, title: Nurse Assistant }
  other: { workplace: offices, wage: 140, title: Office Assistant }
```

The list of professions the player chooses from stays global to the game, because the player picks one before
choosing a destination. So do the CEFR levels and the interface languages.

### 4.2 `map.yaml`

Same model as today (rectangles on a street grid), written in **cells** instead of pixels so numbers stay small.

```yaml
cell: 20                   # pixels per cell
size: [120, 95]            # 2400 × 1900 px
roads:
  - { row: 15, width: 5 }  # horizontal road across the whole map
  - { row: 45, width: 5 }
  - { col: 15, width: 5 }  # vertical road
  - { col: 50, width: 5 }
park: { name: Central Park, at: [22, 52], size: [26, 21] }
decor:                     # buildings you cannot enter
  - { at: [2, 2], size: [11, 11] }
spawn: [16, 35]
taxi_stand: [17, 30]
```

One visible difference from today: roads are 96 px wide in the code and become 5 cells (100 px) in the pack.
Nothing overlaps, and the grid stays simple. If exact pixels matter, `cell: 4` gives the same map with bigger numbers.

Buildings you can enter are not here: their position is part of the place (4.3), so one block of text
describes one place completely.

### 4.3 `places.yaml`

A place bundles everything that today is spread over four files (`LOCATIONS`, `NPCS`, `LOCATION_NPC`,
`CATALOG`, `SHOP_VOCAB`).

```yaml
bakery:
  name: Sweet Crumbs Bakery
  short: Bakery
  icon: 🥐
  building: { at: [22, 35], size: [9, 8], door: bottom, color: "#fdcb6e", roof: "#e1a32b" }
  character:
    name: Rosa
    emoji: 👩‍🍳
    voice: { gender: female, rate: 1.0 }   # optional: deepgram: aura-2-thalia-en (a specific Deepgram voice)
    role: Owner of Sweet Crumbs Bakery
    persona: >
      Rosa Martinez, 45, warm and chatty Mexican-American baker. Proud of her
      sourdough, recommends items, asks "for here or to go?".
  sells:                               # price, then what it does to the player
    bagel:           { price: 2.50, food: 15 }
    croissant:       { price: 3.50, food: 18 }
    coffee:          { price: 2.25, food: 2, energy: 10, consume: now }
  vocabulary: ["for here or to go", "a loaf of", "freshly baked", "I'd like…", "How much is…?"]

hotel:
  name: Hotel Sunrise
  short: Hotel
  icon: 🏨
  building: { at: [22, 22], size: [11, 10], door: top, color: "#e17055", roof: "#b44a32" }
  character: { name: Emily, emoji: 🛎️, role: Front desk clerk at Hotel Sunrise, persona: "…" }
  lodging: { per: night, price: 110, min: 85, max: 140, max_nights: 14 }

barber:
  # …
  services:                            # like `sells`, but done on the spot, quantity always 1
    haircut: { price: 25 }
    shave:   { price: 20 }
```

`door` is a side (`top`, `bottom`, `left`, `right`); the compiler computes the exact point. An explicit
`door: [x, y]` is accepted for odd shapes.

An item whose price the customer decides (a tip) says so: `tip: { price: 2, customer_sets_price: [1, 20] }`.

### 4.4 `people.yaml`

```yaml
- name: Grandpa Joe
  emoji: 👴
  color: "#7f8c8d"
  voice: { gender: male }
  persona: Joe, 78, retired teacher feeding pigeons, loves telling stories about old Maple City, speaks slowly.
```

### 4.5 `actions.yaml`

An action is something a character may do to the game world. The AI can only *ask* for an action; the
engine checks it against this file. Each action is built on one of a fixed set of engine **kinds**:

| kind | what the engine does | today's actions of this kind |
|---|---|---|
| `sell` | charges for items from the place's `sells` list (price ±30%), adds them to the inventory | `sell` |
| `service` | charges for one entry of `services` | `service` |
| `price` | agrees a negotiated amount, clamped to `min`…`max`, and charges it | `agree_price` |
| `choose` | records a choice from a closed list, for later missions to use | `set_destination` |
| `rent` | starts a stay at a place with `lodging`, clamped to its limits | `rent` |
| `grant` | applies `effects` if `requires` holds | `open_account` |
| `hire` / `reject` | scores an interview; `hire` under `pass_score` becomes `reject` | `hire`, `reject` |
| `work_done` | pays the day's wage scaled by performance | `work_done` |
| `end` | closes the conversation | `end` |

```yaml
agree_price:
  kind: price
  tell_ai: Emit ONCE when you and the passenger have clearly agreed on the fare.
  start: 75
  min: 35
  max: 100

set_destination:
  kind: choose
  tell_ai: Emit when the passenger has told you clearly where to go.
  into: lodging_place            # name of the choice, readable later as {{choice.lodging_place}}
  options:
    hotel:     [hotel, sunrise]  # words that also count, when the AI answers loosely
    apartment: [apart, oak]

open_account:
  kind: grant
  tell_ai: Emit when all requirements are met and the customer confirmed the account details.
  requires:
    all:
      - { has: home,  else: the player has no US address yet }
      - { flag: phone, else: the player has no US phone number yet }
      - { not: { flag: bank }, else: the player already has an account }
  effects:
    - { set_flag: bank }
```

The `else` text is what the character is told when the game refuses the action, so it can react in the
conversation (as `[GAME: …]` messages do today).

Items can carry effects too: `prepaid SIM card: { price: 15, effects: [{ set_flag: phone }] }` replaces the
hard-coded `sim: true`.

### 4.6 `missions.yaml`

```yaml
arrival_taxi:
  kind: story
  at: airport                           # the character defaults to the one who works there
  title: { en: Get a taxi from the airport, pt: Apanhe um táxi no aeroporto }
  goal:
    en: Talk to the taxi driver, choose {{place.hotel.name}} or {{place.apartment.name}}, and negotiate the fare.
    pt: Fala com o taxista, escolhe o {{place.hotel.name}} ou o {{place.apartment.name}} e negoceia o preço.
  brief: >                              # instructions for the AI playing the character
    The passenger just landed in {{city.name}} with luggage and needs a ride to either
    {{place.hotel.name}} ({{money place.hotel.lodging.price}}/night) or {{place.apartment.name}}
    ({{money place.apartment.lodging.price}}/week). Your opening price is {{money action.agree_price.start}}.
    Your secret minimum is {{money action.agree_price.min}}. Haggle realistically…
  allow: [agree_price, set_destination, end]
  vocabulary: [fare, "How much to…?", "That's too expensive", deal, luggage, trunk]
  complete: { all: [{ did: agree_price }, { did: set_destination }] }
  reward: { xp: 80, social: 5 }

lodging:
  kind: story
  at: "{{choice.lodging_place}}"        # decided in the taxi
  variants:                             # one mission, different text per place
    hotel:
      title: { en: Check in at Hotel Sunrise, pt: Faz o check-in no Hotel Sunrise }
      brief: A new guest arrives at the front desk. Room rate is {{money place.lodging.price}} per night…
    apartment:
      title: { en: Rent a room at Oak Street, pt: Aluga um quarto no Oak Street }
      brief: A newcomer wants to rent a furnished room. Rent is {{money place.lodging.price}} per week…
  allow: [rent, end]
  complete: { did: rent }
  reward: { xp: 70, social: 5 }

open_bank:
  kind: story
  at: bank
  brief:
    - The customer wants to open a checking account. Requirements — passport (they have it),
    - { when: { has: home },  text: "a US address (they live at {{home.name}}),", else: "a US address (they DO NOT have one yet)," }
    - { when: { flag: phone }, text: "and a US phone number (they have one).", else: "and a US phone number (they DO NOT have one yet)." }
    - If a requirement is missing, politely explain what they need and do not open the account…
  allow: [open_account, end]
  complete: { did: open_account }
  reward: { xp: 70, social: 3 }

job_interview:
  kind: story
  at: job_center
  requires:
    all: [{ level: A2 }, { has: home }, { flag: phone }, { flag: bank }, { not: { has: job } }]
  retry: next_day
  brief: >
    Interview the candidate for a "{{player.profession.title}}" position. Ask ONE question per turn…
  allow: [hire, reject, end]
  complete: { did: hire }
  reward: { xp: 150, social: 10 }

work_shift:
  kind: job
  at: "{{player.job.workplace}}"
  once_per: day
  requires: { has: job }
  brief: >
    The employee works as "{{player.job.title}}". Today's situation: {{rotate situations}}.
    Play it out realistically in 4-6 turns. Then emit work_done with performance.
  lists:
    situations:                         # one per day, in order
      - a morning stand-up meeting
      - an unhappy client complaint the employee must handle politely
  allow: [work_done, end]
  complete: { did: work_done }

shop:
  kind: daily
  at: "{{with.place}}"
  title: { en: "Shopping: {{list with.items}}", pt: "Compras: {{list with.items}}" }
  brief: >
    The customer needs to buy: {{list with.items}} (but they must ask for it themselves).
    Serve them naturally, tell the total, and take payment. {{price_list}}
  allow: [sell, service, end]           # the engine keeps only what the place offers
  complete: { bought: with.items }
  reward: { xp: 50, social: 4 }

smalltalk:
  kind: social
  brief: You are a stranger in the street. {{with.persona}} Make friendly small talk…
  allow: [end]
  complete: { turns: 4 }
  reward: { xp: 30, social: 12 }
```

Other mission fields used by the full example:

- `character: <place id>` — talk to the character of another place (the manager at any workplace).
- `with_person: true` — the mission starts by stopping a pedestrian; `{{person.name}}` and `{{person.persona}}` are available.
- `kind: free` with `at: any` — the conversation used when the player walks into a place with no mission there.
- `once_per: day`, `retry: next_day` — limits on repeating.

## 5. The three small languages

**Text templates** — `{{path}}` inserts a value. Allowed roots are a closed list: `city`, `place` (the
mission's place, or `place.<id>`), `player`, `home`, `choice`, `with` (mission parameters), `action`, `person`.
Helpers: `{{money x}}`, `{{list x}}`, `{{price_list}}`, `{{rotate <list>}}`. Unknown paths are a compile error.

**Conditions** — used by `requires`, `complete` and `when`:

| condition | true when |
|---|---|
| `{ has: home }` / `{ has: job }` | the player has a home / a job |
| `{ flag: <name> }` | the flag was set by an effect |
| `{ level: A2 }` | CEFR level is at least A2 |
| `{ did: <action> }` | the character performed that action in this conversation |
| `{ did: sell, item: [sim, plan] }` | …and the item name contains one of the words |
| `{ bought: with.items }` | every requested item was sold in the right quantity |
| `{ turns: 4 }` | the player sent at least 4 messages |
| `{ count: smalltalk, at_least: 2 }` | a counter kept by the engine reached the number, since the mission was given (`<mission id>` = times completed, `online_messages`) |
| `all: […]`, `any: […]`, `not: …` | combinations |

**Effects** — `set_flag`, `clear_flag`, `money: ±n`, `xp: n`, `stat: { health: +40 }`. Homes, jobs, rent and
wages stay engine concepts, reached through the `rent`, `hire` and `work_done` kinds.

## 6. Compile and validate

`npm run pack -- maple-city` (or `npm run pack` for every pack; `npm test` compiles Maple City too):

1. Parse the YAML files; check their shape (wrong type, unknown field, missing field) with a small validator
   written for the purpose in `tools/pack/compile.js`, so every message can say what to fix.
2. Check references: every `at`, `allow`, `story` entry, workplace, item and `{{path}}` must exist.
3. Check the map: buildings inside the map, no overlaps with roads or each other, doors next to a road, and
   every door, the park and the taxi stand reachable on foot from where the player lands.
4. Check playability: every story mission's `complete` is achievable with its `allow` list; every flag that is
   required somewhere is set somewhere.
5. Write `packs/dist/maple-city.json` (ignored by git; `dist/` itself is emptied by every `vite build`).
6. Write `packs/maple-city/preview.svg`, a picture of the map with the cell numbers, kept in git so a change to
   a map can be seen in a pull request (CI fails if it is out of date).
7. Print advice (`⚠`, from `tools/pack/lint.js`): things that work but will disappoint players, such as a mission
   with no Portuguese text. Advice never fails the check.

Errors point at the file and the entry and say what to do:

```
places.yaml › pharmacy › character: missing "persona" (a sentence or two describing who this is)
missions.yaml › buy_medicine › allow: unknown action "prescribe". Known: sell, service, end, …
map check: "pharmacy" overlaps the road at row 45. Move it up by 1 cell.
```

## 7. How the engine uses a pack

- The server loads compiled packs at start and serves them at `GET /api/packs` (list for the departures board)
  and `GET /api/packs/:id`.
- The client downloads the pack of the chosen destination before starting the world scene.
- `shared/` stops exporting constants and exports functions that take a pack: `buildPrompt(pack, mission, state)`,
  `validateAction(pack, mission, action, state)`, `generateDaily(pack, day, seed)`. Client and server keep
  using the same code, so the AI can still never do something the game would not allow.
- A save records the pack id and version. Player progress that today is `flags.phone`, `flags.bank` becomes the
  generic flag set; old saves are migrated once.

## 8. Steps (each one leaves the game working)

1. **Compiler + Maple City pack.** Write the schema, the compiler and the full pack. A test compiles the pack
   and compares it with today's hard-coded data (same prices, same places, same prompts). The game does not
   use it yet.
2. **Engine reads the pack.** `shared/`, the server and the world scene take the pack as input; the
   hard-coded data is deleted. The existing tests must pass unchanged in meaning.
3. **A second, small city** written only in YAML, to prove the format and find what is missing. The departures
   board lists available packs.
4. **Contributor guide** ("add a place in ten minutes") and updates to the three READMEs.

## 9. Left open on purpose

- **Interiors (Three.js).** A place may carry an `interior:` block (`model: assets/bakery.glb`, or a room
  layout with furniture and where the character stands). Version 1 only checks its shape and ignores it.
- **Map editor.** The rectangle format compiles trivially. Importing maps drawn in the free
  [Tiled](https://www.mapeditor.org) editor can be added later as a second input for `map.yaml` without
  changing anything else.
- **Packs from players.** Because packs are pure data, they can later be stored in the database and uploaded
  through the game. Their `persona` and `brief` texts go into AI prompts, so uploaded packs will need
  moderation and size limits before that is opened.
- **Other languages.** `language` is per city; the coach prompts are still written for English and need the
  same treatment before a French or Spanish city works well.

## 10. Decisions needed

| # | Question | Proposed |
|---|---|---|
| 1 | YAML for authors, JSON after compiling? | Yes. Adds one dev dependency (`yaml`). |
| 2 | Map as rectangles on a cell grid now, Tiled import later? | Yes. |
| 3 | Are fixed engine *kinds* plus `grant`/effects enough, or should packs define wholly new behaviours? | Fixed kinds. Every current action fits; new kinds are added to the engine when a real case appears. |
| 4 | Packs live in the repository only (reviewed by pull request) for now? | Yes; database and uploads later. |
