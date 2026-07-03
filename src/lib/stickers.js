/**
 * Curated starter sticker set (per build plan §6) — emoji artwork served
 * from the jsDelivr Twemoji CDN, so it works with zero API keys.
 */
const twemoji = (code) =>
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`

const SET = [
  ['1f602', 'crying laughing'],
  ['1f923', 'rofl'],
  ['1f60d', 'heart eyes'],
  ['1f525', 'fire'],
  ['1f4af', '100'],
  ['1f44d', 'thumbs up'],
  ['1f44f', 'clap'],
  ['1f62e', 'wow'],
  ['1f631', 'scream'],
  ['1f621', 'angry'],
  ['1f622', 'crying'],
  ['1f974', 'woozy'],
  ['1f921', 'clown'],
  ['1f480', 'skull'],
  ['1f47b', 'ghost'],
  ['1f4a9', 'poop'],
  ['1f680', 'rocket'],
  ['1f389', 'party'],
  ['1f37f', 'popcorn'],
  ['1f3ac', 'clapper board'],
  ['1f3b8', 'guitar'],
  ['1f451', 'crown'],
  ['1f9e0', 'big brain'],
  ['1f440', 'eyes'],
  ['1f64f', 'pray'],
  ['1f91d', 'handshake'],
  ['1f4a5', 'boom'],
  ['26a1', 'lightning'],
  ['2764', 'red heart'],
  ['1f494', 'broken heart'],
  ['1f9ca', 'ice cold'],
  ['1f3c6', 'trophy'],
]

export const curatedStickers = SET.map(([code, title]) => ({
  id: `curated-${code}`,
  title,
  preview_url: twemoji(code),
  media_url: twemoji(code),
  source: 'sticker-library',
}))
