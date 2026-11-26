# Clear Radius — a valley flight game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/adjcjh/makefun-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/adjcjh/makefun-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Entry for the make.fun bounty
["Make the best flight game"](https://make.fun/bounty/best-flight-game-20261126-0057)
($500 over 50 places; deadline 2026-11-28T00:57:00Z).

## The game

Thread ten gold rings over a seeded valley — lake, farmland, ridges and a
home runway — then bring the aircraft home and land gently before the
clock runs out. Centre hits, a full circuit and a soft touchdown earn the
big points; the terrain always wins ties.

- Chase and cockpit cameras (`C`), full instrument HUD: compass tape,
  speed and altitude tapes, artificial horizon, throttle, ring guidance.
- Keyboard and mouse: `W/S` pitch, `A/D` roll, `Shift/Ctrl` throttle,
  mouse steers, `P` pause, `M` sound.
- Synthesised WebAudio engine hum, ring chimes and touchdown chirps —
  no audio files, no network, no external assets.

## Run it

Serve `game/` with any static server, or:

```
node serve.ts   # then open http://localhost:8080
```

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `dossier.json` with
the vendored make.fun library, deterministically — two runs write the
same bytes. Screenshots are real renders of the game (`?shot=play`,
`?shot=start`, `?shot=cockpit`, `?shot=end`, see `shots.json`).

## License

MIT — see `LICENSE`.
