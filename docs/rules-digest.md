# Xia rules digest

A condensed summary of the reworked rulebook (v1.35, including Embers rule changes), written for implementing the game. Page numbers refer to that PDF, kept at `docs/Xia_Rulebook_mz.pdf` (not under `public/`, so the app never serves it).
Expansion tags: **[E]** Embers, **[MP]** Missions and Powers, **[KS]** Kickstarter/Sellsword. Untagged rules are base game.

## Scope decisions (2026-10-28)
- **Content:** base game + Embers of a Forsaken Star. Missions and Powers [MP], Kickstarter/Sellsword [KS] and the Embers solo variant are out of scope, so their rules below can be ignored for now.
- **Players:** 2–5. The 2-player variant applies at 2: NPCs count as players for mission targets, and the Lone Drifter auto-pilot gets +2 movement.
- **NPCs** (Enforcer, Scoundrel, Merchant) are run automatically by the server. When the rules leave a choice to the controlling captain (e.g. ties between equally direct paths), the game prompts the active player to choose. The Kiln is an NPC card, but it has no turns.
- **Starting sectors:** Nyr in the centre; starting sectors in the rulebook's "Setup using Nyr" positions (p3): 3 players W, NE, SE; 4 players W, NW, E, SE; 5 players W, NW, NE, E, SE. No 2-player diagram, so W and E for now. Starting sectors are dealt at random from tiles with a spawn point (tiles 1-19), in seat order.
- **Edge symbols:** every sector tile has the same six edge symbols in the same positions and order (as on Nyr): clockwise from E, bar, square, circle, arrow, cup, plain line (`EDGE_SYMBOLS` in sectors.ts). Each sits on the middle hex edge of its side. When a tile is placed, only the edge the ship left through has to match, with the same symbol on both sides. So a new tile always sits turned 180° from the tile it attaches to (`explorePlacement` / `matchedRotation` in board.ts), and tile data doesn't need per-tile edge symbols. For the symbols on touching tiles to meet on the same hex edge, neighbouring sector centres are offset (5, -3), not the mirror-image (5, -2).
- **During play (for now):** captains can move (impulse, engines) and explore: Scan Sector (standard action, 1 energy, ends movement, pick an unexplored side next to the ship) and Blind Jump (minor action, 1 movement, click an unexplored hex next to the ship; the ship must fly in). The sector deck is every tile not on the board (the 32 tiles in `SECTOR_TILES`, sectors.ts); a random one is drawn each time. Tile names, types, spawn points, counts and features come from the tile listing, and the 21 base game tiles have their real hex layouts (`data/tileLayouts.ts`, transcribed from photos; check them with `/dev/board?gallery=1`). Embers tiles other than Nyr still have placeholder layouts (exploration spaces near the centre). Borders (p10, p20) are enforced: planetary shields (entering or leaving, except by the entrance; outlaws can't enter a Lawful planet by its entrance; innocents using an Outlaw entrance get +1,000 bounty), asteroids and debris (each space entered), nebulae (crossing in from outside). A move follows the shortest path, avoiding borders when an equally short path exists (reachable spaces whose route crosses one show ⚠). When the shortest route crosses a planetary shield (entering or leaving) and a route through an entrance crosses fewer, the captain is asked whether to cross the shield or use the entrance (`moveShip(target, true)`, the route with the fewest shields); if the target is then out of reach, they can stop just past the entrance (inside or outside) instead. Bots take the shortest route. At a border the move pauses: the captain rolls the d20 or stops short (keeping their movement); a Blind Jump rolls straight away. After a 1-10 against an asteroid or nebula the captain may fire shields (Shields Up: armed marker, shield die, -1 per damage on it, Enviro-Shld rolls max) before taking the rest. Planetary shield 1-10: unblockable damage, the ship stays put and loses 1 movement. Nebula energy loss takes energy, then armed markers; with neither left the ship is stranded and its movement is lost. Bots always roll and take it. Mission points (p12): a ship that flies onto or over one (once per point per turn, with a free mission slot: limit 1, +2 per undamaged M-Comp) queues 3 mission cards to draw at the end of the turn, without using any movement; the draws are lost if the ship is destroyed. A ship that starts its turn on a mission point doesn't draw unless it moves onto one. At the end of the turn the cards are drawn (random from `missionDeck`, the discard reshuffled when it runs out) and the captain keeps 1 up to their free slots before the turn passes; the rest go to `missionDiscard`. Active missions show in a hand tray along the bottom (hidden from others only in the UI) and can be discarded at any time on the captain's turn. Mission cards are placeholders (`data/missions.ts`: 4 of each base/Embers type, type and side only) until the real card data arrives; revealing and delivering come with it. Trade (p15-16): on a Buy space, buyCargo buys up to 2 of the planet's cube type (any colour at Smugglers' Den) for 1,000 from the Economy Board, repeatable; on a Sell space, sellCargo sells chosen cubes it buys (any colour at Loath) for 1,000 each, and a Big Shipment (2+ and every cube it buys) earns 1 fame. Both are standard actions that end movement. Cubes bought go through cube placement. Economy Board (`G.economy`): d6 cubes per type at setup, max 6; a planet that buys cubes from a captain produces its own Buy type (Loath never), and producing into a section with In Demand credits pays them to the seller; at each Status Phase empty sections get 1,000 In Demand. Starport Phase (p18): on any planet space a captain can dock (enterStarport), which ends the Action Phase (no more movement, actions or trading). Docked: recharge energy (free), repair all normal damage (1,000; 2,000 at Tier III), thaw ice (free), throw credits around (5,000 for 1 fame, never the winning point), and the outfitters: buy, move and sell outfits (sold for half, rounded up to the next 1,000), and move cubes in the hold. Damaged outfits can't be moved or sold, and outfits can't go on damage or cargo. Arming markers at the end of the turn is free at a starport (docked or not). Buy New Ship: docked, pick a ship exactly one tier up that nobody owns or traded in (5,000 / 8,000) and its ability, place every outfit in its hold (or sell it), then pay: +1 fame, damage and bounty stay with the old ship (which leaves the game, G.retiredShips), ability cards are kept (keptAbilities), energy and markers carry over, and cubes go back through cube placement. Not yet: The Kiln. Gates (p10): Use Gate (minor, 1 movement) from a gate space jumps to any free space on another gate (never the Tigris gate); movement carries on. The Tigris gate sends the ship to the free spawn point closest to a d20 roll (on a 20 it takes the closest too; choosing comes later). The first captain to use a gate, and the first to use Tigris, each earn 1 fame (G.gateFameTaken). Samara Gate (Embers) has no layout yet. Harvest, salvage and mining spaces are drawn but have no rules yet, and planetary entrances are recorded as the side they face (`PLANET_ENTRANCES`; the entrance is the shield edge furthest out that way). Special cases: Xia (the whole tile is star: nothing can enter it, and a Blind Jump into it destroys the ship) and Nyr (inner 7 hexes star). Destroyed ships leave the board, lose cargo and bounty, and respawn at the start of their next turn at the unoccupied spawn point closest to a d20 roll. Exploration tokens: always the 30 Embers tokens (`data/exploration.ts`), never the core ones. A face-down token goes on each exploration space when a tile is placed (starting tiles included); a token's face is drawn from the remaining pool when it's flipped. The first ship to fly onto the space resolves it without stopping (a minor action; a move follows a shortest path, through as many face-down tokens as it can, and they're flipped on the way) (+5 movement, energy refill, 1 ice damage, a cargo cube; Captain in Need just sits on the mat until missions exist and doesn't pair). Two face-up tokens must be cashed in at once for 1 fame or 2,000 credits; bots take fame. Exploration space positions are placeholders (next to the centre). Damage (p14): every damage waits in the captain's `pendingDamage` until they click where it goes (any undamaged hold space or outfit section, exterior ones included); nothing else can be done first. A cube there is jettisoned (removed for now), and a marker on a use space there goes to Disarmed. If pending plus placed damage reaches the hold size (+3 per Armor Plating, p27) the ship is destroyed at once. Cargo cubes gained (exploration tokens now, buying later) wait in `pendingCargo` until the captain clicks an empty hold space or Cargo Pod section, or jettisons the cube; with no room it's jettisoned at once. Respawned ships take damage equal to their tier this way. Bots place damage in the first free space. Luck (p6): a natural 20 on any captain d20 roll (borders, respawn, d20 outfits) gives 1 fame, once per turn. Not yet: ice asteroids (Embers tiles), jettisoned cubes left on the board, choosing the spawn point on a 20, planetary shields blocking Scan. Buying, selling and everything else waits until real sectors with planets exist.
- **Open question:** at 2 players there are 3 NPC cards but only 2 captains. Which captain's turn does the third NPC's turn follow? Proposed: deal NPCs to seats in order, wrapping around, so seat 0 runs 2 NPCs.

## Core rule changes from Embers (always on, p2)
- Missions are **drawn** during the Action Phase but **selected** at the end of the turn (Status step 7).
- A **Big Shipment** must sell *all* cubes the location can buy (and at least 2) to earn 1 Fame.
- **Respawn:** a ship comes back with unblockable damage equal to its tier and no longer loses a turn.

## Winning (p1, p3)
- Every captain starts at 0 fame. The Victory token is placed on the track at an agreed number (variable length). Reaching that number wins immediately.
- Ways to earn fame:
  - Exploration token: 1
  - Rescue: 1
  - Sift a relic [E]: 1
  - Deliver a mission: 1
  - Destroy a ship: its tier
  - Big Shipment: 1
  - Buy a new ship: 1
  - Pay 5,000 credits: 1, but never the final point
  - Titles: 1–3
  - Natural 20 on your own d20 (Luck): 1, max once per turn
  - First use of any Gate (except Tigris): 1
  - First use of the Tigris Gate: 1
  - [E] Holding 2 face-up exploration tokens: discard both for 1 fame or 2,000 credits

## Setup (p3)
1. Deal one sector tile per captain face up, each new tile edge-matching the previous one. Re-draw any tile without a Spawn Point. [E] With Nyr: Nyr goes in the centre and the others surround it.
2. Shuffle relic [E] and exploration tokens, and place an exploration token face down on each Exploration Space.
3. Shuffle the mission, title and [E] event decks.
4. Put out the supply: cubes, damage, ice damage, outfits, mods, credits.
5. Each captain gets 4,000 credits.
6. Deal the 3 NPC cards (Enforcer, Merchant, Scoundrel), one each to the first captains. [E] The Kiln goes on Nyr.
7. Place the fame track and Victory token. [E] Economy board: roll a d6 for each cube type to set its starting cubes.
8. Each captain rolls a d20. Starting with the highest roll and going counter-clockwise, each picks a Tier I ship. Ships start on the spawn point closest to their owner.
9. Each captain gets an impulse token (face up), 6 markers (fame 0, energy at max, 4 armed) and a colour token.
10. In ship-pick order, each captain buys outfits with their starting credits (they must fit in the hold). The captain who picked last goes first ([E] and takes the First Player token).

## Turn structure (p1)
1. **Action Phase**: any number of actions until done.
2. **Starport Phase**: only if the Action Phase ended at a starport (any planet space or [E] The Kiln; not Dead Worlds).
3. **Status Phase**.

Play then passes clockwise. After each captain's turn, they also take a turn for the NPC they control (p24).

## Ship anatomy (p4)
- **Ship mat:** name, tier (I/II/III), price, hold size, impulse value, hold grid and energy meter.
- **Markers:** 4 that cycle between armed, use spaces and disarmed. Using an outfit moves an armed marker onto one of the outfit's free use spaces.
- **Arming (Status Phase):** costs 1 energy per marker, up to 4. It's free at a starport.
- **Stranded:** a ship with 0 energy and 0 armed markers. It can only use impulse and minor actions, and stops being stranded when it gains energy or armed markers.

## Outfits and mods (p5, p26–28)
- Outfits are polyomino tiles placed in the hold grid. Each section takes one space. Most are double-sided, so they can be flipped as well as rotated.
- Each outfit has a die, use spaces and a price.
- Damage on an outfit section:
  - −1 to that outfit's rolls (minimum 1)
  - a damaged use space can't be used
  - damaged outfits can't be sold or moved
  - a marker sitting on a damaged space goes to disarmed.
- **Engine:** Fire Main Engine gives movement equal to the roll. Ram: range 1, line of sight required; the roll is dealt to both ships, unblockable for the attacker.
- **Blaster:** range 1. **Missile:** range 2–6. Both need line of sight and deal damage equal to the roll.
- **Shield:** a minor action. It reduces incoming damage by the roll. It works against blasters, missiles, ramming (target only), asteroids, nebula energy loss, ice asteroids and excavating; not against planetary shields, debris, stars or unblockable damage. Combat re-arm costs 1 energy per shield marker.
- **[E] Armor Plating:** 1 connecting section inside the hold and 3 outside; each section holds 1 damage, so it adds 3 effective hull.
- **[E] Cargo Pod:** 1 connecting section inside and 3 outside, adding 3 cargo spaces. Damage to the connecting section disables the whole pod and jettisons its contents.
- **[E] Mods** (1×1):
  - **Piercer:** placed over a blaster or missile use space; −4 to the defender's shield roll.
  - **Enviro-Shld:** placed over a shield use space; that shield rolls its maximum against non-combat damage and energy loss.
  - **GTS:** +2 to each orthogonally adjacent engine, capped at the die's maximum.
  - **M-Comp:** +2 active mission limit.

## Action Phase (p6, p8)
- **Minor actions** don't end movement:
  - Impulse (once per turn)
  - Blind Jump
  - Draw Missions
  - Collect cargo
  - Jettison cargo or a mission
  - Collect an exploration token
  - Resolve a border or path effect
  - Shields Up
  - Use a Gate (1 movement point).
- **Standard actions** end movement; unspent movement is lost:
  - Fire Main Engine
  - Scan Sector (1 energy)
  - Rescue (needs ≥3 energy; give 2 to an adjacent stranded ship; +1 fame)
  - Reveal Objective
  - Deliver
  - Attack
  - Buy
  - Sell
  - Mine, Harvest, Salvage, Quarry [E]
  - Excavate [E]
  - Sift [E]
  - Ship ability actions.
- **Ship occupancy:** ships can pass through other ships but can't end movement on them. To act on an occupied space, spend 2 movement from an adjacent hex; that ends movement.
- **Movement:** 1 movement point per hex.

## Exploring (p9)
- **Scan** (standard, 1 energy) or **Blind Jump** (minor, 1 movement point; you must move into the declared hex, even if it's a star).
- A new tile's edge symbol must match the symbol on the edge of the explorer's current tile.
- New exploration spaces get a face-down token. The first ship to enter one flips it and resolves it:
  - Base tokens: 1,000 credits, 1 fame or nothing
  - [E] tokens: a cube, refill energy, 1 ice damage, +5 movement, or Captain in Need.

## Borders (p10, p20)
All of these roll a d20.
- **Planetary shield** (enter or exit):
  - 1–10: unblockable damage equal to the roll; the ship doesn't move but still spends 1 movement point
  - 11–17: move, +1,000 bounty
  - 18–20: move, no effect.
- **Asteroid** (on entering): 1–10 damage equal to the roll (shields help); 11–20 safe.
- **[E] Ice Asteroid:** the same, but the damage is ice damage.
- **Debris:** 1–3 the ship is destroyed; 4–20 safe.
- **Nebula:** 1–10 lose energy equal to the roll (shields help); if energy runs out, disarm markers; if both run out, the ship is stranded and movement ends. 11–20 safe.
- **Star:** the ship is destroyed.
- **Line of sight:** blocked by planetary shields, asteroids, ice asteroids, debris, stars and unexplored space.
- **Adjacency:** blocked by planetary shields.
- **Double traversal:** one move that crosses two borders resolves each in order.
- **Gates:** spend 1 movement point to move from any gate space to any other gate. The Tigris gate instead sends you to a random spawn point (d20).
- **[E] Gravity paths:** entering one forces movement down the path by a die roll; no actions are allowed during it, and NPCs are unaffected.
- **[E] Comet paths:** entering one moves the comet d6 spaces; a ship or cube where it ends is destroyed. A ship that moves into the comet is destroyed.

## Planets and bounties (p9)
- **Lawful (blue):** outlaws can't use the entrance.
- **Outlaw (red):** an innocent ship using the entrance gains +1,000 bounty.
- **Neutral (green):** no special rules.
- Planets:
  - Lawful: Lunari, Kemplar II
  - Neutral: Azure, Doravin V, Neo Damascus, [E] Tig
  - Outlaw: Loath, Smugglers' Den, [E] Kei
- **Gaining a bounty:**
  - +1,000 for destroying an innocent ship
  - +1,000 for being detected crossing a planetary shield
  - some outlaw missions add a bounty
  - +1,000 for using an outlaw planet's entrance.
- **Claiming a bounty:** destroying a ship collects its bounty. If the attacker also dies, the bounty is discarded. A bounty is removed when the ship is destroyed or upgraded.

## Missions (p12, p22–24)
- **Active mission limit:** 1, plus 2 per M-Comp.
- **Draw** (minor, on a Mission Point, below the limit): take 3 face down. This can be done once per Mission Point per turn.
- **Select:** at the end of the Status Phase, keep at least 1 and discard down to the limit.
- **Steps:** Reveal Objective (standard), then Deliver at the delivery Mission Point (standard) for the card's payment + 1 fame. Completed missions go under the ship mat.
- **Experience:** after a mission d20 roll, discard a completed mission of the same type to re-roll.
- **Destroyed ship:** discards all its missions.
- **Shortest flyable distance:** counted in sectors, ignoring unexplored space, stars and gates.
- **Lawful types:** Bounty Hunter, Research, Shuttle, [E] Cargo, [E] Private Eye, [MP] Assist, [MP] Transport, [KS] Envoy.
- **Outlaw types:** Assassin, Smuggler, Thief, [E] Arms Dealer, [E] Coerce, [MP] Boom!, [MP] Counterfeit.
- Per-type steps are on p22–24; they get encoded with the mission data.

## Combat (p13–14)
1. **Acquire target:** within range and line of sight.
2. **Declare attack:** outfits or abilities, spending markers and energy. Attacks can be combined or split.
3. **Declare defence:** shields or abilities.
4. **Roll:** the attacker rolls, then the defender.
5. **Damage** = attack − defence. The defender places that many damage markers in their own hold.
6. **Re-arm:** the defender may re-arm shield markers at 1 energy each.

## Damage and destruction (p14–15)
- **Placement:** the damaged player places each damage marker on any hold space.
- **Effects by space:**
  - empty space: no effect
  - cube: jettisoned
  - relic: destroyed
  - outfit: as in the Outfits section above.
- **Destruction:** a ship is destroyed when its damage (normal + ice) is at least its hold size, or on an instant-death result.
  - Kept: outfits, mods, credits and fame.
  - Lost: all missions; all cargo is jettisoned (relics destroyed); the bounty goes to the killer or is discarded.
  - If it was the ship's own turn, the turn ends.
  - Killer reward: fame equal to the destroyed ship's tier, plus its bounty. Nothing if both ships die in a ram.
- **Respawn** (on the ship's next turn):
  - Placement: roll a d20 and take the nearest free spawn point; ties go to the higher number; a 20 lets you choose.
  - Restored: full energy, all markers armed, tokens and abilities refreshed, all damage cleared.
  - Then take unblockable damage equal to tier.
- **[E] Ice damage:** freezes in the Status Phase, spreading orthogonally into undamaged spaces. Thawing at a starport is free.

## Trade (p15–16, p21)
- **Buy:** 1,000 for up to 2 of the planet's cube type, repeatable. Smugglers' Den sells any colour. [E] Limited by the economy board.
- **Sell:** 1,000 per matching cube ([E] Ember: 2,000 at The Kiln). Loath buys any colour.
- **Cube routes:**

  | Cube | Buy | Get by | Sell |
  |---|---|---|---|
  | Spice | Kemplar II | Mine at Outpost 338 | Neo Damascus |
  | Holo | Azure | Harvest at Burning Horse | Kemplar II |
  | Terra | Doravin V | Mine at Red Gulch | Azure |
  | Plasma | Neo Damascus | Harvest at Lower Stratus | Lunari |
  | Cyber | Lunari | Salvage at Pelmont, Kreller IV | Doravin V |
  | [E] Ember | — | Quarry at Blench, The Grinder | The Kiln |

- **Extraction** (standard, needs a free hold space, d20):
  - Mine: 1–10 damage equal to the roll; 11–20 one cube.
  - Harvest: 1–10 lose energy equal to the roll; 11–20 one cube.
  - Salvage: 1–3 the ship is destroyed (unblockable); 4–20 one cube.
  - [E] Quarry: 1–10 ice damage; 11–20 an Ember cube.
- **Collect** (minor): pick up jettisoned cubes, but not ones you jettisoned this turn.
- **[E] Economy board:**
  - Buying draws cubes from the board.
  - Selling consumes cubes; the planet then produces its own cube type onto the board (max 6 per type).
  - In Demand: an empty section gets +1,000 credits during the Status Phase, claimed by the next player whose sale produces that type.
  - Loath never produces. Kei swaps cubes with the board.

## [E] Dead Worlds, relics and The Kiln (p11, p25, p29)
- **Dead Worlds:** no shields, not a starport. Place 3–4 relics when the tile is discovered.
- **Excavate** (standard, needs 2 adjacent free spaces, d20): 1–10 ice damage; 11–20 one relic.
- **Relics:** take 2 hold spaces. A relic is destroyed if jettisoned or damaged.
- **The Kiln:**
  - A neutral starport orbiting Nyr. Docking costs 1 movement point, after which The Kiln moves d6 along its path.
  - Moving inside costs 1 movement point per space; exiting costs 1 movement point.
  - Sift (standard): 1 fame, or the reward shown (3,000 / 2,000 + 2 cubes / 2,000 + a mod).
  - Sells Ember for 2,000.

## Starport Phase (p7, p18)
- **Buy ship:** exactly 1 tier up. Tier II costs 5,000, Tier III costs 8,000.
  - Gain 1 fame.
  - Damage is cleared; everything else transfers, but the bounty is lost.
  - Ship ability cards accumulate.
- **Buy, sell or rearrange outfits:** damaged outfits can't be sold or moved. Selling refunds half the price, rounded up: Tier I and II return 1,000, Tier III returns 2,000.
- **Recharge:** energy to max for free.
- **Repair:** all normal damage. Tier I or II costs 1,000; Tier III costs 2,000.
- **[E] Thaw:** remove ice damage for free.
- **Wealth:** 5,000 credits for 1 fame, never the winning point.

## Status Phase (p7, p18)
1. [E] Freeze: ice spreads.
2. Claim existing titles: the first captain to meet a title's objective claims it.
3. Draw a new title: the first captain to reach each purple space on the fame track draws one; it can't be claimed in the same phase.
4. Refresh ability cards and the impulse token.
5. Arm markers: 1 energy each, free at a starport.
6. [E] In Demand: add credits to empty economy sections (max 1,000 per section).
7. Select active missions.

[E] Events: the first captain to reach or pass a pink Event space draws an event card and resolves it (p21).

## Ship abilities (p29)
- Spend the energy shown on the card, usually roll a d20, then exhaust the card. It refreshes in the Status Phase.
- [MP] abilities are always active and never exhausted.

## NPCs (p17, p24–25)
- **Turns:** the captain holding an NPC card runs its turn right after their own. A captain can't make choices that benefit themselves, except breaking path ties.
- **Spawn:** when its trigger sector is placed. Respawns the next turn at a random spawn point.
- **Movement:** uses gates; ignores nebulae and gravity paths; avoids other borders where possible (preference order asteroids → debris → shields).
- **Combat:** defends automatically. Destroyed at its To Kill damage.
- **Enforcer** (Lawful, Tier II; spawns at Kemplar II):
  - Target: its most recent attacker, else the nearest outlaw within 1 sector, else the most distant Lawful planet.
  - Move: 6, or until 2–6 spaces from a ship target.
  - Attack: d8 missile. Defence: d8. To Kill: 12.
  - On kill: 2 fame, +2,000 bounty.
- **Scoundrel** (Outlaw, Tier I; spawns at Loath; starts with a 2,000 bounty):
  - Target: its most recent attacker, else the nearest innocent, else Loath.
  - Move: 5. Attack: d8 blaster, then flee 8 toward Loath.
  - Defence: d6. To Kill: 10. On kill: 1 fame.
- **Merchant** (Neutral, Tier I; spawns when the second planet on its route appears):
  - Route: Doravin V → Azure → Kemplar II → Neo Damascus → Lunari.
  - Moves 8 per turn, gaining 1,000 credits at each sell space.
  - Defence: d8. To Kill: 15. On kill: 1 fame, +1,000 bounty.
- **2-player:** NPCs count as players for mission targets; the Lone Drifter auto-pilot gets +2 movement (p19).

## Data still needed (not in the rulebook)
- Sector tiles: names, 19-hex layouts, borders, special spaces, edge symbols, spawn and mission points (32 tiles + Giant Comet).
- Ship mats: tier, price, hold grid, impulse value, energy max (21 mats).
- Ship ability cards (base, Embers, [MP]).
- Outfits: name, type, tier, price, die, shape, use spaces. Mods.
- Mission cards: type, targets, pickup and delivery points, payment tables.
- Title cards and event cards.
- The fame track's title and event space positions.
