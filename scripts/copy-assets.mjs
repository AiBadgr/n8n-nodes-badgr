import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist/nodes/Badgr', { recursive: true });
mkdirSync('dist/credentials', { recursive: true });
for (const f of ['badgr.svg', 'badgr.dark.svg']) {
  copyFileSync(`nodes/Badgr/${f}`, `dist/nodes/Badgr/${f}`);
  copyFileSync(`credentials/${f}`, `dist/credentials/${f}`);
}
