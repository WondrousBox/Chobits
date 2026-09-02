import { app } from 'electron';

import { getRealPath } from './env';

export function getResourcePath(binName: 'sherpa' | 'characters' | 'resources' | 'plugins' | 'providers' | 'logs' | 'html'): string | undefined {
  switch (binName) {
    case 'sherpa':
      return getRealPath(`../sherpa`, `./resources/sherpa`);
    case 'resources':
      return getRealPath(`../`, `./resources`);
    case 'plugins':
      return getRealPath(`../plugins/plugins.json`, `./resources/plugins/plugins.json`);
    case 'providers':
      return getRealPath(`../providers`, `./resources/providers`);
    case 'characters':
      return getRealPath(`../characters`, `./resources/characters`);
    case 'logs':
      return app.getPath('logs');
    case 'html':
      return getRealPath(`../html`, `./resources/html`);
  }
}
