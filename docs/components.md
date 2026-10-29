# Xia component catalog

Reference list of every physical component, with how (or whether) it shows up in the digital version.
Sources: retail box list (FOG 1700), the Embers of a Forsaken Star box list, and the reworked rulebook ("Slightly bent by murphzero", v1.35 / Captain's Manual v1.31).

**Digital column key**
- **Data**: needs a data catalog in `src/data/` (card text, tile layouts, stats).
- **State**: becomes a field or counter in game state, with no catalog of its own.
- **Art**: image only.
- **N/A**: physical only, not needed online.

**Scope:** base game + Embers, 2–5 players, no solo.

Expansion tags match the rulebook: **Base** = Legends of a Drift System, **Embers** = Embers of a Forsaken Star, **M&P** = Missions and Powers, **KS** = Kickstarter Missions / Sellsword Mk II.

## Base game: Legends of a Drift System

| Qty | Component | Notes | Digital |
|---|---|---|---|
| 52 | Mission cards | 6 Bounty Hunter, 10 Research, 12 Shuttle, 8 Assassin, 8 Smuggler, 8 Thief | Data |
| 18 | Ship Ability cards | One per player ship | Data |
| 18 | Title cards | Objective, Fame (1–3) and Skill | Data |
| 5 | How To Win cards | Player reference | N/A (help panel) |
| 3 | NPC cards | Enforcer, Merchant, Scoundrel | Data |
| 84 | Outfits | 7 of each of 3 tiers × Blaster, Engine, Missile, Shield (per the box list); 7 of each type per the rulebook | Data (catalog) + State (supply counts) |
| 80 | Damage markers (orange) | | State |
| 75 | Cargo cubes | 15 each: Spice (orange), Holo (pink), Terra (green), Plasma (teal), Cyber (purple) | State (supply / board / holds) |
| 40 | Credit tokens | 30 × 1,000 (silver), 10 × 5,000 (blue/gold) | State (single number) |
| 30 | Player markers | 6 per colour × 5 colours (fame, energy, 4 armed) | State |
| 21 | Sector tiles | 3 Asteroid, 3 Debris, 3 Gate, 3 Nebula, 7 Planet, 1 Star, 1 Void | Data (19-hex layouts, borders, special spaces, edge symbols) + Art |
| 21 | Exploration tokens | 7 × 1 Fame, 7 × 1,000 credits, 7 × nothing | Data + State |
| 18 | Player ship miniatures | 6 Tier I, 6 Tier II, 6 Tier III | Art |
| 18 | Ship Mats | Name, tier, price, hold grid, impulse value, energy meter | Data (hold grid shape is key) + Art |
| 7 | Outlaw tokens | Marks ships with a bounty | State (derived from bounty > 0) |
| 5 | Impulse tokens | Two-sided (ready / exhausted) | State |
| 5 | Colour tokens | Stand ring for each player's colour | N/A |
| 4 | Dice | d6, d8, d12, d20 | Server RNG |
| 3 | NPC miniatures | Enforcer, Merchant, Scoundrel | Art |
| 1 | Fame Point track | Purple Title spaces | Data (title thresholds) |
| 1 | Victory marker | Sets the fame target | State (setup option) |
| 1 | Replication token | Used by the Nightshade ability | State |
| 1 | Rulebook, 2 box inserts | | N/A |

## Embers of a Forsaken Star

| Qty | Component | Notes | Digital |
|---|---|---|---|
| 11 | Sector tiles | Adds Nyr (star, home of The Kiln), Ice Asteroid, Dead World, Anomaly sectors; planets Tig and Kei | Data + Art |
| 1 | Giant Comet tile | Rikishi event | Data + Art |
| 32 | Mission cards | 8 Cargo, 8 Private Eye, 8 Arms Dealer, 8 Coerce | Data |
| 22 (+3 blank) | Event cards | Drawn from pink spaces on the Event fame track | Data |
| 20 | Solo Variant cards | 10 Goals, 6 NPC Behaviour, NPC Stats, Solo Setup, Solo Round Summary, Solo Campaign Upgrades | Out of scope (no solo) |
| 10 (+3 blank) | Title cards | | Data |
| 5 | Replacement How To Win cards | | N/A |
| 3 | New Ship Ability cards | Vagabond: Batea Grid; Skimmer: Recall; Carriak: Absorption Shield | Data |
| 3 | Replacement (rebalanced) Ability cards | Long Haul: Shuttle Bay; Manchester: Hard Bargaining; Nightshade: Replication Drive | Data (replaces base versions) |
| 1 | NPC card | The Kiln (neutral starport, orbits Nyr) | Data |
| 30 | Replacement Exploration tokens | 5 Captain in Need, 5 Energy, 5 Ice, 5 Impulse +5 (Movement), 2 each of Cyber/Holo/Plasma/Spice/Terra | Data + State |
| 15 / 24 | Relic tokens | Rulebook says 15, box list says 24 (see below) | Data + State |
| 8 | Event tokens | Board reminders for active events | State |
| 1 | First Player token | | State |
| 45 | Mod tiles | 1×1: Piercer, Enviro-Shld, GTS, M-Comp (per rulebook) | Data + State |
| 20 | Outfit tiles | Armor Plating, Cargo Pod (per rulebook) | Data + State |
| 60 | Ice Damage markers (blue) | | State |
| 15 | Ember cargo cubes (white) | Sold at The Kiln for 2,000 | State |
| 10 | Metal coins (1,000) | | State |
| 7 | Miniatures | Vagabond, Skimmer, Carriak, The Kiln, 3 Comets | Art |
| 3 | Ship Mats | Vagabond, Skimmer, Carriak | Data + Art |
| 1 | Replacement Fame Point track | Adds pink Event spaces | Data |
| 1 | Economy board | Six cube sections, max 6 each, In Demand bonus | State |
| 1 | 8-page rulebook, 4-page solo rulebook | | N/A |

## Other expansions (listed in the rulebook; out of scope)

| Set | Contents | Digital |
|---|---|---|
| **M&P**: Missions and Powers | 21 Ship Ability cards (always active, never exhausted); 32 Missions (8 Assist, 8 Transport, 8 Boom!, 8 Counterfeit) | Out of scope |
| **KS**: Sellsword Mk II | 1 miniature, 1 NPC card, 1 Sellsword rules card, 1 Ship Mat, 1 Ship Ability card, 1 RKS Blaster outfit | Out of scope |
| **KS**: Kickstarter Missions | 8 Envoy missions | Out of scope |
| Metal 2,000 coins | 10 copper 2,000 credits | N/A |

## Discrepancies to resolve

- **Outfit types:** the base box lists 4 outfit types (Blaster, Engine, Missile, Shield). The rulebook names 6 (adding Armor Plating and Cargo Pod), and these appear to be the 20 Embers outfits.
- **Relic tokens:** the rulebook's Embers list says 15, the Embers box list says 24.
- **Base-game exploration tokens** are replaced entirely when the Embers tokens are used. They are never mixed.
- **Embers Ship Ability cards:** the rulebook lists "3 + 3 replacement", which matches the box list.
- **Player count:** decided as 2–5 (base 3–5 plus the 2-player variant), with no solo play.
