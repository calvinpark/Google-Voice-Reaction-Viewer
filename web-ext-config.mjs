// web-ext configuration (https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
// Option names are the camelCase form of the CLI flags.
export default {
  sourceDir: '.',
  artifactsDir: 'dist',
  ignoreFiles: [
    'dist',
    'test',
    'node_modules',
    'CLAUDE.md',
    'README.md',
    'package.json',
    'package-lock.json',
    'amo-metadata.json',
    'web-ext-config.mjs',
    'icons/icon.svg',
    'icons/icon-256.png',
    '.playwright-mcp',
  ],
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['https://voice.google.com/messages'],
  },
  sign: {
    // unlisted = signed for self-distribution (a .xpi you install yourself).
    // Switch to 'listed' to submit for public listing on addons.mozilla.org.
    channel: 'unlisted',
    amoMetadata: 'amo-metadata.json',
  },
};
