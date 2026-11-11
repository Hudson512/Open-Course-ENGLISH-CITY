# 🗽 OpenCourse — English City

[English](README.md) · [Português](README.pt.md) · **Français**

[![Licence : MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)
[![PR bienvenues](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contribuer)
[![GitHub stars](https://img.shields.io/github/stars/Hudson512/Open-Course-ENGLISH-CITY?style=social)](https://github.com/Hudson512/Open-Course-ENGLISH-CITY/stargazers)

**Apprenez l'anglais en le vivant : un jeu en monde ouvert (style GTA classique, vu de dessus) où chaque personnage est une IA à qui il faut parler.**

Vous atterrissez dans une ville où tout le monde parle anglais — **Maple City** 🇺🇸 avec 600 $ ou **Londres** 🇬🇧 avec 500 £ — une valise à la main. Marchandez avec le chauffeur de taxi, louez une chambre, prenez un téléphone, ouvrez un compte bancaire, réussissez un entretien d'embauche — le tout en anglais, avec un coach invisible qui corrige chaque phrase. Gratuit, open source, et il tourne sur votre machine avec **votre propre clé API** (ou sans aucune clé).

![Dialogue avec le chauffeur de taxi](docs/screenshot-dialog.png)

## 💡 Pourquoi ce projet

- **Les applis de langues enseignent des phrases ; la vie demande des conversations.** Ici, vous pratiquez celles qui comptent quand on part vivre à l'étranger : les prix, le loyer, la paperasse, la conversation de tous les jours, les entretiens.
- **L'IA joue le personnage, le jeu garde les règles.** Les PNJ vendent, encaissent, louent et embauchent, mais chaque action est validée par le jeu : le modèle ne peut ni distribuer de l'argent ni sauter des étapes.
- **Ni dépendance à un fournisseur, ni abonnement.** Claude, OpenAI, Gemini, Groq, OpenRouter, un modèle local avec Ollama, ou un mode hors ligne par règles.
- **Les villes sont des fichiers texte, pas du code.** Une ville est un dossier de YAML : carte, lieux, personnages, prix, missions. [Ajoutez une pharmacie en dix minutes](docs/creating-a-city.md), ou écrivez votre propre ville.
- **Assez petit pour être compris en un après-midi.** Environ 3 500 lignes de JavaScript simple et cinq dépendances d'exécution.

## 🚀 Essayez-le en une minute

Il vous faut **Node.js 18.17+** ([nodejs.org](https://nodejs.org)). Aucune clé API n'est nécessaire pour un premier essai : sans clé, le jeu tourne en mode hors ligne (**mock**).

```bash
git clone https://github.com/Hudson512/Open-Course-ENGLISH-CITY.git
cd Open-Course-ENGLISH-CITY
npm install
npm start            # compile le jeu et démarre le serveur
```

Ouvrez **http://localhost:8787** dans Chrome ou Edge.

### 🐳 Ou avec Docker (jeu + base de données)

```bash
docker compose up --build
```

Ouvrez **http://localhost:3000**. Trois conteneurs démarrent : `frontend` (nginx qui sert le jeu), `backend` (API Node + multijoueur) et `db` (Postgres). La progression des joueurs est aussi enregistrée dans la base de données, dans le volume `pgdata`, et survit donc aux redémarrages et aux rebuilds ; ⚙️ Paramètres affiche un **code de sauvegarde** pour continuer sur un autre appareil.

- Clés d'IA : mettez-les dans `.env` (lu automatiquement) ou collez-les dans les Paramètres.
- Autre port : `WEB_PORT=8000 docker compose up`.
- Ollama sur votre machine : `LLM_PROVIDER=ollama` et `LLM_BASE_URL=http://host.docker.internal:11434/v1`.
- `docker compose down` arrête tout et conserve les données ; `docker compose down -v` supprime aussi les sauvegardes.
- Raccourcis : `make up`, `make stop`, `make restart`, `make logs`, `make db-backup`… lancez `make` pour tous les voir.

Sans Docker, le jeu garde la progression uniquement dans le navigateur, sauf si vous définissez `DATABASE_URL` vers votre propre Postgres.

## ✨ Ce qui fonctionne déjà (v0.1)

| | |
|---|---|
| ✈️ **Départ** | Vous créez votre personnage (nom, ville d'origine, langue maternelle, profession) et choisissez un vol sur le tableau des départs de l'aéroport : 🇺🇸 **Maple City** (anglais américain) ou 🇬🇧 **Londres** (anglais britannique). Toronto, Sydney, Paris et Madrid sont marqués « bientôt ». |
| 🚕 **Arrivée** | Vous négociez le taxi et choisissez où habiter : à Maple City, l'**Hotel Sunrise** (110 $/nuit) ou les **Oak Street Apartments** (180 $/semaine) ; à Londres, un taxi noir jusqu'au **Wanderers Hostel** (35 £/nuit) ou à l'**Albion Road Flatshare** (160 £/semaine). |
| 🌆 **Monde ouvert** | Chaque ville a sa propre carte : des routes, de la circulation (les voitures freinent… mais attention en traversant !), un parc, 13–14 lieux où entrer, des piétons avec leur personnalité, un cycle jour/nuit, une mini-carte et une flèche GPS. |
| 🤖 **PNJ IA** | Dans chaque ville, un personnage par lieu (boulangère, barbier, conseiller bancaire, recruteuse…) + 8 piétons, qui parlent l'anglais du pays : *line* et *apartment* à Maple City, *queue* et *flat* à Londres. L'IA adapte son langage à votre niveau (A1→C2), reste dans son personnage et **agit dans le monde** (vend, encaisse, loue, embauche) par des actions validées par le jeu. |
| 🧑‍🏫 **Coach invisible** | Chacune de vos phrases reçoit une note de 0 à 100, une version corrigée/naturelle, des conseils dans votre langue, des mots nouveaux (ajoutés au carnet) et des suggestions de réponse. Traduction automatique aux niveaux A1/A2. |
| 🏫 **École d'anglais** | Chaque ville a une école avec une salle de classe : le professeur écrit les phrases au tableau, vous les écoutez, les répétez au micro et vous entraînez avec de courts exercices, avant la mission qui en a besoin. Leçons A1 pour l'instant (premiers mots, taxi, logement, téléphone) ; après chaque mission un bilan montre quoi mieux dire, et le téléphone rappelle la prochaine leçon et les phrases à réviser (répétition espacée). Les leçons sont en YAML dans [`courses/english/`](courses/english/), pour que les enseignants en écrivent d'autres. |
| 🎤 **Voix** | Les PNJ parlent et vous répondez au micro : maintenez 🎤 pour parler et relâchez pour envoyer, comme un message vocal, ce qui laisse le temps de réfléchir. Avec une clé [Deepgram](https://deepgram.com), les personnages ont des voix naturelles avec l'accent de leur ville, votre parole est comprise dans tous les navigateurs, et un mode **mains libres** facultatif remarque quand vous avez fini de parler (il attend plus longtemps pour les débutants). Sans clé, ce sont les outils vocaux du navigateur (Chrome/Edge). |
| ❤️ **Survie** | La faim, l'énergie, le social et la santé baissent avec le temps. Mangez, dormez, discutez. Si vous vous évanouissez, vous payez l'hôpital ; 3 évanouissements = retour au pays (fin de partie). Le loyer est prélevé automatiquement — sans argent, vous êtes expulsé. |
| ⭐ **Histoire** | Taxi → logement → numéro de téléphone → compte bancaire → **entretien d'embauche dans votre domaine** → journées de travail avec salaire. Londres ajoute l'achat d'une carte Oyster à la station de métro. |
| 📅 **Missions quotidiennes** | Générées chaque jour : courses à la boulangerie, au supermarché ou au café, déjeuner au diner ou au pub, coupe de cheveux précise, parler aux piétons, parler à de vrais joueurs. |
| 👥 **Multijoueur** | Vous voyez les autres joueurs dans la ville, avec leur niveau CECRL, et parlez à ceux qui sont près de vous (chat de proximité + bulles). En option : l'IA corrige votre anglais dans le chat. |
| 📒 **Carnet** | Vocabulaire collecté automatiquement + cartes mémoire avec répétition espacée simple. |
| 🔌 **N'importe quelle IA** | Anthropic (Claude), OpenAI, Google Gemini, Groq, OpenRouter, **Ollama (100 % local et gratuit)**, tout serveur compatible OpenAI (LM Studio, vLLM…) ou un **mode hors ligne** sans IA pour tester. |
| 🧩 **City packs** | Chaque ville est un dossier de fichiers YAML que le jeu vérifie et compile au démarrage. Nouveaux lieux, personnages, missions et villes entières sans programmation : voir le [guide](docs/creating-a-city.md) (en anglais). |
| 🏙️ **Première personne et visionneuse** | Appuyez sur **V** dans le jeu pour parcourir les rues à la première personne, façon Wolfenstein (ray casting), avec les passants, les voitures, les portes et les missions ; appuyez à nouveau pour une vue 3D avec la caméra derrière vous (Three.js), puis encore pour la vue de dessus. La visionneuse montre n'importe quelle ville en plan, en 3D à faire tourner (Three.js), ou parcourez ses rues à la première personne, façon Wolfenstein (ray casting) : 🗺️ sur l'écran d'accueil, ou `viewer.html?city=london`. Pratique pendant la création d'une ville. |

![Multijoueur](docs/screenshot-multiplayer.png)

## 🔌 Configurer votre IA (choisissez UNE méthode)

**A) Dans le jeu (le plus simple) :** ⚙️ Paramètres → choisissez le fournisseur → collez votre clé API → *Tester la connexion* → *Enregistrer*.
La clé reste dans le `localStorage` de votre navigateur et n'est envoyée qu'au serveur local du jeu.

**B) Sur le serveur :** copiez `.env.example` vers `.env` et remplissez-le :

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

| Fournisseur | `LLM_PROVIDER` | Variable de la clé | Modèle par défaut* |
|---|---|---|---|
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| Groq | `groq` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct` |
| Ollama (local) | `ollama` | — | `llama3.1` |
| Autre compatible OpenAI | `custom` | `LLM_API_KEY` + `LLM_BASE_URL` | — |
| Sans IA (hors ligne) | `mock` | — | réponses par règles |

\* Les noms de modèles changent souvent : vous pouvez toujours en choisir un autre dans `LLM_MODEL` ou dans les Paramètres. Pour réduire les coûts, utilisez des modèles « mini/flash/haiku » ; chaque réplique de PNJ est un appel court (~1–2k tokens).

**Gratuit et privé :** installez [Ollama](https://ollama.com), lancez `ollama pull llama3.1` et choisissez `ollama` dans les Paramètres. Les petits modèles respectent moins bien les règles du JSON ; ≥ 8B est recommandé.

**Voix naturelles et meilleure écoute (facultatif) :** ajoutez `DEEPGRAM_API_KEY=...` à `.env`. Les personnages parlent alors avec des voix [Deepgram Aura-2](https://developers.deepgram.com/docs/tts-models) — américaines à Maple City, britanniques à Londres — et votre micro est transcrit par [Deepgram Flux](https://developers.deepgram.com/docs/flux/quickstart), qui permet aussi la conversation mains libres (⚙️ Paramètres). L'audio passe par le serveur du jeu : la clé n'arrive jamais dans le navigateur. Sans elle, ce sont les voix et la reconnaissance vocale du navigateur.

### Jouer avec des amis (LAN / même réseau)

Le serveur écoute sur `0.0.0.0:8787`. Vos amis ouvrent `http://<votre-IP>:8787`. Avec `ALLOW_CLIENT_KEYS=true` (par défaut), **chaque joueur utilise sa propre clé**, collée dans ses Paramètres.

> ⚠️ Si vous publiez le serveur sur Internet, définissez `ALLOW_CLIENT_KEYS=false` ou protégez-le : le serveur appelle l'IA au nom de quiconque y joue.

### Commandes

`WASD`/flèches se déplacer · `Shift` courir · `E` interagir · `V` changer de vue : de dessus, première personne, 3D (ou 🎥 ; W/S avancer, A/D ou la souris tourner) · `Enter` chat avec les joueurs · `M` missions · `I` inventaire · `N` carnet · `P` téléphone (taxi) · `Esc` fermer

L'interface du jeu est disponible en portugais et en anglais (pas encore en français) ; le français peut être choisi comme langue maternelle pour les conseils du coach. Les PNJ parlent toujours anglais et s'adaptent à votre niveau CECRL.

## 🧱 Comment ça marche

```
client/            Vite + Phaser 3 (monde) + DOM (HUD, dialogues, menus)
  src/scenes/      WorldScene : carte, physique, piétons, circulation, caméras, GPS
  src/ui/          hud, dialog (conversation avec l'IA), panels, screens
  src/state.js     état, survie, application des actions, XP, vocabulaire, sauvegarde (localStorage)
  src/flux.js      micro → serveur → Deepgram Flux ; speech.js : voix et solution de repli du navigateur
  src/viewer/      visionneuse de villes : 3D (Three.js) et première personne (ray casting)
server/            Node + Express + ws
  index.js         API : /api/packs, /api/npc/turn, /api/chat/check, /api/llm/test, /api/config, /api/save/:id
  packs.js         compile les villes de packs/ au démarrage du serveur
  db.js            sauvegardes des joueurs dans Postgres (facultatif, via DATABASE_URL)
  prompts.js       construit le prompt du PNJ (personnage, scène, niveau, règles, format)
  llm.js           client multi-fournisseur + analyse robuste du JSON
  mock.js          PNJ hors ligne par règles
  multiplayer.js   présence, positions, chat de proximité
  tts.js           voix des personnages avec Deepgram Aura-2 (facultatif)
  stt.js           relaie le micro vers Deepgram Flux, reconnaissance vocale (facultatif)
shared/            utilisé par le client ET le serveur
  engine.js        les règles : missions, validation des actions, effets, générateur quotidien
  pack.js          lire une ville : modèles de texte et conditions
  scene.js         une ville comme scène 3D, lue par toutes les vues
  data.js          identique dans toutes les villes : niveaux CECRL, professions
packs/             les villes, un dossier de YAML chacune
  maple-city/      ville, carte, lieux, passants, actions, missions
  london/
tools/pack/        le vérificateur/compilateur de city packs (npm run pack)
```

**Comment un PNJ « agit » :** le modèle renvoie toujours du JSON :

```json
{ "reply": "Two croissants, coming right up!", "actions": [{"type":"sell","item":"croissant","qty":2,"unitPrice":3.5}],
  "feedback": {"score": 72, "corrected": "Can I have two croissants, please?", "tips": ["..."], "newWords": [...]},
  "suggestions": ["To go, please."], "translation": "..." }
```

Le jeu **valide** chaque action (`shared/engine.js → validateAction`) par rapport au `actions.yaml` de la ville : uniquement les actions permises dans la scène, des prix conformes à la liste du lieu (±30 %), un marchandage du taxi dans les limites de la ville (35–100 $ à Maple City), un compte bancaire seulement avec une adresse et un téléphone, une embauche seulement au niveau A2 + conditions. Les paiements refusés reviennent au PNJ sous la forme `[GAME: Payment DECLINED…]` pour qu'il réagisse.

## 🤝 Contribuer

Le projet est jeune et il y a de la place pour tous les types de contribution — **pas besoin d'être développeur de jeux, ni même développeur.** Les enseignants, les traducteurs, les auteurs et les artistes sont aussi bienvenus que celles et ceux qui écrivent du code.

### Bonnes premières contributions

| Si vous aimez… | Vous pourriez… | Où |
|---|---|---|
| 🌍 Les langues | Traduire l'interface en français, en espagnol ou dans votre langue | `client/src/i18n.js` |
| ✍️ L'écriture | Créer un nouveau personnage, avec sa personnalité et sa façon de parler | `packs/<ville>/places.yaml`, `people.yaml` |
| 🎯 L'enseignement | Concevoir une mission autour d'une situation réelle (pharmacie, poste, appel du propriétaire…) | `packs/<ville>/missions.yaml` |
| 🏙️ La création de mondes | Ajouter un lieu à une ville, ou écrire une ville entière (Toronto ? Sydney ? Lagos ?) | `packs/` — [guide](docs/creating-a-city.md) |
| 🎨 Le pixel art | Dessiner des sprites et des tuiles CC0 pour remplacer les formes colorées | `client/src/scenes/WorldScene.js` |
| 🧠 Les sciences de l'apprentissage | Remplacer les cartes mémoire simples par une vraie répétition espacée (SM-2) | `client/src/ui/panels.js` |
| 🤖 Les prompts | Rendre les PNJ plus naturels ou plus fiables avec de petits modèles locaux | `server/prompts.js`, `server/mock.js` |
| 📱 Le front-end | Ajouter un joystick virtuel pour mobile | `client/src/` |

Ajouter du contenu, c'est écrire des fichiers texte, pas travailler sur le moteur. Le **[guide pour créer des lieux, des missions et des villes](docs/creating-a-city.md)** (en anglais, aussi [en portugais](docs/creating-a-city.pt.md)) l'explique pas à pas :

- **Nouveau lieu :** un bloc dans `packs/<ville>/places.yaml` — le bâtiment, qui y travaille, la liste des prix.
- **Nouvelle mission :** un bloc dans `packs/<ville>/missions.yaml` — ce que le joueur doit faire (`goal`), ce que l'IA sait (`brief`), ce qu'elle peut faire (`allow`) et quand c'est terminé (`complete`).
- **Nouvelle ville :** copiez un dossier de `packs/`, changez la carte, les lieux et l'histoire. `npm run pack` vous dit en mots simples ce qui ne va pas. Tous les champs sont dans la [spécification](docs/city-pack-spec.md).

### Flux de développement

```bash
npm run dev    # serveur avec rechargement + Vite sur http://localhost:5173
npm test       # tests (analyse, validation, prompts, mock)
npm run pack   # vérifie les city packs, dit quoi corriger et dessine chaque carte (packs/<ville>/preview.svg)
```

1. Forkez le dépôt et créez une branche pour votre modification.
2. Lancez `npm run dev`. Le mode mock permet de travailler sans dépenser de crédits d'API.
3. Lancez `npm test` (et `npm run pack` si vous avez touché à une ville) avant d'ouvrir la pull request.
4. Ouvrez une PR et décrivez ce qui a changé. Une capture d'écran aide pour tout ce qui est visuel.

Chaque pull request est vérifiée automatiquement (tests, city packs, images des cartes, build) par [GitHub Actions](.github/workflows/check.yml).

Vous ne savez pas par où commencer, ou vous avez une idée ? [Ouvrez une issue](https://github.com/Hudson512/Open-Course-ENGLISH-CITY/issues) — les questions et les suggestions sont les bienvenues, en anglais, en portugais ou en français.

### 🗺️ Feuille de route

- [ ] Intérieurs des bâtiments et sprites/tuiles en pixel art (CC0)
- [ ] Missions multijoueur coopératives (p. ex. un joueur demande son chemin, l'autre explique) et « jobs » partagés
- [ ] Test de placement initial avec l'IA
- [ ] Plus de villes : 🇨🇦 Toronto, 🇦🇺 Sydney… et d'autres langues (🇫🇷 🇪🇸)
- [ ] Transports en commun, voiture personnelle, factures (électricité, téléphone), achats en ligne
- [ ] Vraie répétition espacée (SM-2) et rapports de progression
- [x] Docker et sauvegardes côté serveur (Postgres)
- [x] City packs : des villes écrites en YAML, avec 🇺🇸 Maple City et 🇬🇧 Londres
- [ ] Comptes facultatifs et monde partagé persistant
- [ ] Mode mobile (joystick virtuel)

## ⭐ Soutenir le projet

Si vous pensez qu'apprendre une langue devrait ressembler à vivre quelque part plutôt qu'à remplir des exercices, mettez une étoile au dépôt et partagez-le avec quelqu'un qui apprend l'anglais. Cela aide d'autres contributeurs à trouver le projet.

## 📄 Licence

[MIT](LICENSE) — utilisez-le, forkez-le, enseignez avec.
