// Clear Radius entry program (Node 22, standard library only). The game is
// this directory's game/ folder: plain static files a desktop browser loads
// offline. This program copies game/ and screenshots/ to /output and writes
// /output/dossier.json with the vendored make.fun library, deterministically:
// two runs write the same bytes.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly here rather than in the grader if the entry is incomplete:
// the game page must exist and screenshots/ must hold 3 or 4 images.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing');
}
const shots = readdirSync(join(here, 'screenshots')).filter((name) => /\.(png|jpe?g)$/i.test(name));
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 images, found ${shots.length}`);
}

// Clear the two output trees first so a reused output directory can never
// leak stale files into the dossier: two runs stay byte-identical.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
