# Creating places, missions and cities

**English** · [Português](creating-a-city.pt.md)

Everything you see in the game — streets, shops, characters, prices, missions — is written in text files,
not in code. A city is a folder in [`packs/`](../packs/) with six YAML files. If you can edit a text file
you can add a pharmacy, write a mission about calling a landlord, or build a whole new city.

This guide is the practical part. Every field and rule is listed in the
[city pack specification](city-pack-spec.md).

- [Before you start](#before-you-start)
- [Add a place in ten minutes](#add-a-place-in-ten-minutes)
- [Add a mission](#add-a-mission)
- [Create a new city](#create-a-new-city)
- [When the checker complains](#when-the-checker-complains)
- [Writing good characters and missions](#writing-good-characters-and-missions)
- [Before you open a pull request](#before-you-open-a-pull-request)

## Before you start

```bash
npm install
npm run pack      # checks every city in packs/ and tells you what is wrong
npm start         # builds and runs the game at http://localhost:8787
```

You do not need an AI key: without one the game runs in offline mode, where characters answer with
simple rules. That is enough to check that your place opens, sells and charges correctly.

A city folder looks like this:

| File | What is in it |
|---|---|
| `city.yaml` | name, country, language, currency, starting money, story order, daily missions, jobs |
| `map.yaml` | size of the map, roads, the park, buildings you cannot enter, where the player lands |
| `places.yaml` | every place you can enter: the building, who works there, what it sells |
| `people.yaml` | people walking in the street, for small talk |
| `actions.yaml` | what characters are allowed to do (sell, rent, hire…) and their limits |
| `missions.yaml` | story, job and daily missions |

Two cities ship with the game. Read them side by side to see what changes from one city to the next:
[`packs/maple-city/`](../packs/maple-city/) (US English, dollars) and [`packs/london/`](../packs/london/)
(British English, pounds, an extra step in the story).

## Add a place in ten minutes

Let us add a pharmacy to Maple City.

**1. Find a free spot.** The map is a grid of cells; positions are `[column, row]` counted from the top-left
corner. A building may not sit on a road or on another building, and its door must be free and within
2 cells of a road. In
[`packs/maple-city/map.yaml`](../packs/maple-city/map.yaml) the roads are 5 cells wide, at rows 15, 45, 75
and columns 15, 50, 85, so each block is the space between them. There is room next to the barbershop, at
column 43, row 35.

**2. Add the place** at the end of `packs/maple-city/places.yaml`:

```yaml
pharmacy:                                  # the id: lower case, no spaces, unique in the city
  name: "Greenleaf Pharmacy"
  short: "Pharmacy"                        # label on the map
  icon: 💊
  building: { at: [43, 35], size: [6, 8], door: bottom, color: "#81ecec", roof: "#00a8a8" }
  character:
    id: pharmacist
    name: "Nora"
    emoji: 💊
    voice: { gender: female, rate: 1 }
    role: "Pharmacist at Greenleaf Pharmacy"
    persona: >
      Nora Kim, 36, careful and friendly pharmacist. Always asks who the medicine is for,
      what the symptoms are and about allergies before recommending anything.
  sells:
    painkillers: { price: 6.50 }
    cough syrup: { price: 8.99, health: 10, consume: now }
    plasters:    { price: 3.25 }
    vitamin C:   { price: 9.50 }
  vocabulary: ["painkillers", "cough", "over the counter", "twice a day", "side effects", "allergic to"]
```

- `door` is the side of the building the door is on (`top`, `bottom`, `left`, `right`). Point it at a street.
- `persona` is what the AI reads to play the character: age, mood, how they talk, what they always ask.
- `voice` is how they sound: `gender`, `rate` (1 = normal speed) and, if you want a particular
  [Deepgram voice](https://developers.deepgram.com/docs/tts-models), `deepgram: aura-2-draco-en`. Without it the game
  picks a voice with the city's accent.
- `sells` is the price list. The AI can only sell what is here, at about this price (±30%).
  `food`, `energy` and `health` are what the item gives the player; `consume: now` means it is used on the
  spot instead of going to the inventory.
- `vocabulary` is shown to the player as hints; using one of these in a sentence earns XP.

**3. Check it.**

```bash
npm run pack -- maple-city
```

`✓ maple-city: 14 places…` means it is valid. Otherwise you get a sentence telling you the file, the entry
and what to fix.

**4. Play it.** Run `npm start`, fly to Maple City and walk in. With no mission there the player gets the
general "visit" conversation: the character serves them and can sell from the list.

## Add a mission

A mission is a situation in a place: what the player must do, what the character knows, and when it counts
as done. Add this at the end of `packs/maple-city/missions.yaml`:

```yaml
sore_throat:
  kind: daily                              # story, daily, job, social or free
  at: pharmacy                             # where it happens (a place id)
  title: { en: Something for a sore throat, pt: Algo para a dor de garganta }
  goal:                                    # what the player reads
    en: Explain your symptoms at {{place.name}} and buy cough syrup.
    pt: Explica os teus sintomas na {{place.name}} e compra xarope para a tosse.
  brief: >                                 # what the AI reads; the player never sees this
    The customer has had a sore throat and a cough for two days. Do not guess: ask about the
    symptoms, how long, and allergies. Recommend the cough syrup and explain how to take it
    (twice a day, after meals). {{price_list}}
  allow: [sell, end]                       # what the character may do (actions.yaml)
  complete: { did: sell, item: [cough syrup] }
  reward: { xp: 50, social: 4 }
```

Then tell the city when the mission appears. For a daily mission, add it to the pool in `city.yaml`:

```yaml
daily:
  count: 3
  pool:
    - { mission: sore_throat }
```

For a story mission, use `kind: story` and put its id in the `story:` list in `city.yaml`, in the position
where it should happen.

Things worth knowing:

- **`{{…}}` inserts a value**, so texts never go out of date: `{{place.name}}`, `{{money place.hotel.lodging.price}}`,
  `{{city.name}}`, `{{price_list}}` (the place's whole price list, for the AI). A name that does not exist is
  reported by the checker.
- **`complete`** decides when the mission is done. The common ones: `{ did: sell }` (the character performed
  that action), `{ flag: phone }` (something set that flag), `{ bought: with.items }` (a shopping list),
  `{ turns: 4 }` (the player sent four messages).
- **`requires`** keeps a mission closed until the player is ready: `{ has: home }`, `{ flag: bank }`,
  `{ level: A2 }`.
- **The AI only asks; the game decides.** A character can only perform actions listed in `allow`, and each
  action has limits in `actions.yaml`. A character cannot give away money, however nicely the player asks.

### Flags: things the player has

An item or an action can set a flag, and missions can wait for it. This is how London adds a step to its
story without any code — in `places.yaml`:

```yaml
    Oyster card: { price: 7.00, effects: [{ set_flag: oyster }] }
```

and in `missions.yaml`:

```yaml
get_oyster:
  kind: story
  at: tube
  ...
  complete: { flag: oyster }
```

## Create a new city

**1. Copy a city and rename it.**

```bash
cp -r packs/london packs/my-city
```

In `packs/my-city/city.yaml` change `id` (it must be the folder name), `name`, `country`, `flag`,
`language` (for example `en-AU`; it sets the accent of the voices) and `currency`.

**2. Draw the map** in `map.yaml`: the size in cells, the roads (each one crosses the whole map), the park,
the buildings that are only decoration, where the player lands (`spawn`) and where the taxi waits
(`taxi_stand`). A sketch on squared paper helps: mark the roads first, then fit the buildings in the blocks
between them, with each door on the side next to a street.

**3. Write the places** in `places.yaml`. A city needs at least: where the player arrives, somewhere to live
(a place with a `lodging` block), and the places the story and the jobs point to.

**4. Write the people** in `people.yaml`: a name, an emoji, a colour and a persona each. Four is enough;
eight makes the street feel alive.

**5. Adapt the actions** in `actions.yaml`. The copy already has everything a city needs. Change the taxi
prices (`agree_price`), the names in `set_destination` and the texts.

**6. Write the missions** in `missions.yaml` and put the story in order in `city.yaml`. Mission ids are
yours to choose. Keep one mission with `with_person: true` (talking to people in the street) and one with
`at: any` (walking into a place with no mission there).

**7. Set the jobs** in `city.yaml`: for each profession the player can choose, where they work in your city,
the job title and the pay per shift. The list of professions belongs to the game; `other` must be there.

**8. Check and play.**

```bash
npm run pack -- my-city
npm start
```

Your city appears on the departures board as an open flight. Restart the server after changing a pack:
cities are read when it starts.

## When the checker complains

Messages name the file, the entry and the problem. Some real ones:

```
places.yaml › barber › character: missing "role" (their job, in a few words)
places.yaml › barber › building: "barber" overlaps the road at row 45. Move it off the road
city.yaml › jobs › chef: workplace "restaurant" is not a place. Known: airport, phone_store, hotel, …
missions.yaml › get_phone › goal › en: {{place.nam}} does not exist for place "phone_store"
missions.yaml › barber_cut › allow: unknown action "shave". Known: agree_price, set_destination, rent, …
missions.yaml › barber_cut › complete: waits for "service", which is not in "allow" — the mission could never be finished
```

A message such as `All mapping items must start at the same column at line 291` means the YAML itself is
broken, almost always the indentation: use spaces (never tabs) and line fields up under each other.
Texts with `:` or `{{` at the start need quotes: `title: { en: "Shopping: {{list with.items}}" }`.

A city with mistakes is left out when the game starts (the reason is printed in the server log); the
other cities keep working.

## Writing good characters and missions

- **Give characters a voice.** Where they are from, their mood, two or three expressions they use, what they
  always ask. "Calls customers *love*, proud of her sausage rolls, asks *eat in or take away?*" plays far
  better than "a friendly baker".
- **Teach the local language.** A London pack says *queue*, *till*, *flat*, *cheers*; a US one says *line*,
  *checkout*, *apartment*. Put those words in `vocabulary`.
- **Make the player do the talking.** In a brief, tell the character what the customer needs but add "they
  must ask for it themselves" — otherwise the AI helpfully says everything for them.
- **One situation per mission**, something a newcomer really faces: registering with a doctor, returning a
  faulty phone, asking a neighbour to keep the noise down.
- **Use realistic prices** for the city and currency. The player starts with little money, and budgeting is
  part of the game.
- **Invent the names.** Use made-up shops and people, not real brands or real persons.
- **Write `title` and `goal` in every interface language** you can. `en` is required; a language you leave
  out (`pt`) falls back to English.

## Before you open a pull request

- [ ] `npm run pack` shows a ✓ for your city.
- [ ] `npm test` passes (`make check` runs both).
- [ ] You played it: the place opens, the mission can be finished, the prices charged are the ones you wrote.
- [ ] Names of places and people are invented.
- [ ] The pull request says what you added and, for anything visible, includes a screenshot.

Stuck, or missing something the format cannot express yet?
[Open an issue](https://github.com/Hudson512/Open-Course-ENGLISH-CITY/issues) — in English, Portuguese or French.
