# 🗽 OpenCourse — English City

**English** · [Português](README.pt.md) · [Français](README.fr.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)
[![GitHub stars](https://img.shields.io/github/stars/Hudson512/Open-Course-ENGLISH-CITY?style=social)](https://github.com/Hudson512/Open-Course-ENGLISH-CITY/stargazers)

**Learn English by actually living it: an open-world game (classic top-down GTA style) where every character is an AI you have to talk to.**

You land in Maple City, USA, with a suitcase and $600. Haggle with the taxi driver, rent a room, get a phone, open a bank account, pass a job interview — all in English, with a hidden coach correcting every sentence. Free, open source, and it runs on your own machine with **your own API key** (or with no key at all).

![Dialogue with the taxi driver](docs/screenshot-dialog.png)

## 💡 Why this project

- **Language apps teach sentences; life needs conversations.** Here you practise the ones that matter when you move abroad: prices, rent, paperwork, small talk, interviews.
- **The AI plays the character, the game keeps the rules.** NPCs can sell, charge, rent and hire, but every action is validated by the game, so the model cannot hand out money or skip steps.
- **No lock-in, no subscription.** Claude, OpenAI, Gemini, Groq, OpenRouter, a local Ollama model, or an offline rule-based mode.
- **Small enough to understand in an afternoon.** About 3,200 lines of plain JavaScript and three runtime dependencies.

## 🚀 Try it in one minute

You need **Node.js 18.17+** ([nodejs.org](https://nodejs.org)). No API key is required for a first look: without one, the game runs in offline **mock** mode.

```bash
git clone https://github.com/Hudson512/Open-Course-ENGLISH-CITY.git
cd Open-Course-ENGLISH-CITY
npm install
npm start            # builds the game and starts the server
```

Open **http://localhost:8787** in Chrome or Edge.

## ✨ What already works (v0.1)

| | |
|---|---|
| ✈️ **Departure** | Create your character (name, home city, native language, profession) and pick a destination on the airport departures board. For now only 🇺🇸 USA is active (UK, Canada, Australia, France, Spain are marked "coming soon"). |
| 🚕 **Arrival** | You land in Maple City and have to **negotiate the taxi** with Tony and choose between **Hotel Sunrise** ($110/night) and **Oak Street Apartments** ($180/week). |
| 🌆 **Open world** | A city with roads, traffic (cars brake… but be careful crossing!), a park, 13 places you can enter, pedestrians with personality, a day/night cycle, a minimap and a GPS arrow. |
| 🤖 **AI NPCs** | 13 fixed characters (baker, barber, diner waitress, bank teller, recruiter…) + 8 pedestrians. The AI adapts its language to your level (A1→C2), stays in character and **acts in the world** (sells, charges, rents, hires) through actions validated by the game. |
| 🧑‍🏫 **Invisible coach** | Every sentence you write gets a 0–100 score, a corrected/natural version, tips in your language, new words (saved to your notebook) and reply suggestions. Automatic translation at levels A1/A2. |
| 🎤 **Voice** | NPCs speak (browser text-to-speech) and you can answer with your microphone (Chrome/Edge). |
| ❤️ **Survival** | Hunger, energy, social and health drop over time. Eat, sleep, talk. If you faint you pay the hospital; 3 faints = you go back home (game over). Rent is charged automatically — with no money, you get evicted. |
| ⭐ **Story** | Taxi → housing → phone number → bank account → **job interview in your field** → daily work shifts with a salary. |
| 📅 **Daily missions** | Generated per day: shopping at the bakery/grocery/café, lunch at the diner with a tip, a specific haircut, talking to pedestrians, talking to real players. |
| 👥 **Multiplayer** | See other players in the city, with their CEFR level, and talk to whoever is nearby (proximity chat + speech bubbles). Optional: the AI corrects your English in chat. |
| 📒 **Notebook** | Vocabulary collected automatically + flashcards with simple spaced repetition. |
| 🔌 **Any AI** | Anthropic (Claude), OpenAI, Google Gemini, Groq, OpenRouter, **Ollama (100% local and free)**, any OpenAI-compatible server (LM Studio, vLLM…) or an **offline mode** with no AI for testing. |

![Multiplayer](docs/screenshot-multiplayer.png)

## 🔌 Set up your AI (pick ONE way)

**A) In the game (easiest):** ⚙️ Settings → pick the provider → paste your API key → *Test connection* → *Save*.
The key stays in your browser's `localStorage` and is only sent to the game's local server.

**B) On the server:** copy `.env.example` to `.env` and fill it in:

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

| Provider | `LLM_PROVIDER` | Key variable | Default model* |
|---|---|---|---|
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| Groq | `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct` |
| Ollama (local) | `ollama` | — | `llama3.1` |
| Other OpenAI-compatible | `custom` | `LLM_API_KEY` + `LLM_BASE_URL` | — |
| No AI (offline) | `mock` | — | rule-based replies |

\* Model names change often: you can always choose another one in `LLM_MODEL` or in Settings. For low costs use "mini/flash/haiku" models; each NPC line is one short call (~1–2k tokens).

**Free and private:** install [Ollama](https://ollama.com), run `ollama pull llama3.1` and choose `ollama` in Settings. Small models follow the JSON rules less reliably; ≥ 8B is recommended.

### Play with friends (LAN / same network)

The server listens on `0.0.0.0:8787`. Friends open `http://<your-IP>:8787`. With `ALLOW_CLIENT_KEYS=true` (the default) **each player uses their own key**, pasted in their own Settings.

> ⚠️ If you publish the server on the internet, set `ALLOW_CLIENT_KEYS=false` or protect it: the server makes AI calls on behalf of whoever plays there.

### Controls

`WASD`/arrows move · `Shift` run · `E` interact · `Enter` chat with players · `M` missions · `I` inventory · `N` notebook · `P` phone (taxi) · `Esc` close

The interface is available in Portuguese and English; NPCs always speak English and adapt to your CEFR level.

## 🧱 How it works

```
client/            Vite + Phaser 3 (world) + DOM (HUD, dialogues, menus)
  src/scenes/      WorldScene: map, physics, pedestrians, traffic, cameras, GPS
  src/ui/          hud, dialog (AI conversation), panels, screens
  src/state.js     state, survival, applying actions, XP, vocabulary, save (localStorage)
server/            Node + Express + ws
  index.js         API: /api/npc/turn, /api/chat/check, /api/llm/test, /api/config
  prompts.js       builds the NPC prompt (character, scene, level, rules, format)
  llm.js           multi-provider client + robust JSON parsing
  mock.js          rule-based offline NPC
  multiplayer.js   presence, positions, proximity chat
shared/            used by client AND server
  world.js         map (roads, buildings, doors)
  npcs.js          characters
  missions.js      missions, action contract, validation, daily generator
  data.js          catalogs/prices, CEFR levels, professions
```

**How an NPC "acts":** the model always returns JSON:

```json
{ "reply": "Two croissants, coming right up!", "actions": [{"type":"sell","item":"croissant","qty":2,"unitPrice":3.5}],
  "feedback": {"score": 72, "corrected": "Can I have two croissants, please?", "tips": ["..."], "newWords": [...]},
  "suggestions": ["To go, please."], "translation": "..." }
```

The game **validates** every action (`shared/missions.js → validateAction`): only actions allowed in the scene, prices within the catalog (±30%), taxi haggling between $35 and $100, a bank account only with an address and a phone, hiring only at level A2 + requirements. Declined payments go back to the NPC as `[GAME: Payment DECLINED…]` so it can react.

## 🤝 Contributing

This project is young and there is room for every kind of contribution — **you do not need to be a game developer, or even a programmer.** Teachers, translators, writers and artists are as welcome as coders.

### Good first contributions

| If you like… | You could… | Where |
|---|---|---|
| 🌍 Languages | Translate the interface into French, Spanish or your own language | `client/src/i18n.js` |
| ✍️ Writing | Create a new character with a personality and a way of speaking | `shared/npcs.js` |
| 🎯 Teaching | Design a mission around a real-life situation (pharmacy, post office, landlord call…) | `TEMPLATES` in `shared/missions.js` |
| 🏙️ World building | Add a new place to the city with its own shop and prices | `shared/world.js`, `shared/data.js` |
| 🎨 Pixel art | Draw CC0 sprites and tiles to replace the coloured shapes | `client/src/scenes/WorldScene.js` |
| 🧠 Learning science | Replace the simple flashcards with real spaced repetition (SM-2) | `client/src/ui/panels.js` |
| 🤖 Prompting | Make NPCs more natural or more reliable with small local models | `server/prompts.js`, `server/mock.js` |
| 📱 Front-end | Add a virtual joystick for mobile | `client/src/` |

Adding content is mostly data, not engine work:

- **New place:** add it to `shared/world.js` (`LOCATIONS`), the NPC to `shared/npcs.js`, the mapping to `LOCATION_NPC` and, if it sells things, the catalog to `shared/data.js`.
- **New mission:** create a template in `TEMPLATES` (`shared/missions.js`) with `objective` (instructions for the NPC), `goal` (text for the player in pt/en), `actions`, `vocab`, `reward` and `isComplete`. Add it to `generateDaily` or to `STORY`.
- **New country/language:** NPC texts and prompts are separated by target destination — the next step is to parameterize `CITY`, catalogs and personas by `destination`.

### Development workflow

```bash
npm run dev    # server with reload + Vite at http://localhost:5173
npm test       # tests (parsing, validation, prompts, mock)
```

1. Fork the repository and create a branch for your change.
2. Run `npm run dev`. Mock mode lets you work without spending any API credits.
3. Run `npm test` before opening the pull request.
4. Open a PR and describe what changed. A screenshot helps for anything visual.

Not sure where to start, or have an idea? [Open an issue](https://github.com/Hudson512/Open-Course-ENGLISH-CITY/issues) — questions and suggestions are welcome, in English, Portuguese or French.

### 🗺️ Roadmap

- [ ] Building interiors and pixel-art sprites/tiles (CC0)
- [ ] Cooperative multiplayer missions (e.g. one player asks for directions, the other explains) and shared "jobs"
- [ ] Initial placement test with the AI
- [ ] More destinations: 🇬🇧 London, 🇨🇦 Toronto, 🇦🇺 Sydney, and other languages (🇫🇷 🇪🇸)
- [ ] Public transport, your own car, bills (electricity, phone), online shopping
- [ ] Proper spaced repetition (SM-2) and progress reports
- [ ] Multiplayer persistence (dedicated server + optional accounts)
- [ ] Mobile mode (virtual joystick)

## ⭐ Support the project

If you think learning a language should feel like living somewhere and not like filling in exercises, star the repository and share it with someone who is learning English. It helps other contributors find the project.

## 📄 License

[MIT](LICENSE) — use it, fork it, teach with it.
