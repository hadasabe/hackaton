/* Lightweight Russian/English profanity masking. Words are replaced with asterisks. */
const EXACT = new Set([
  // Russian
  'бля',
  'сука', 'суки', 'суке', 'суку', 'сукой', 'сукою',
  'сучка', 'сучки', 'сучке', 'сучку', 'сучкой', 'сучкою',
  'сучий', 'сучья', 'сучье', 'сучьи', 'сучьего', 'сучьей', 'сучьему',
  'сучьим', 'сучьих', 'сучьими',
  'сукин', 'сукина', 'сукино', 'сукины', 'сукиного', 'сукиной', 'сукиных',
  'сучара', 'сучары', 'сучаре', 'сучару', 'сучарой', 'сучар', 'сучарами', 'сучарах',
  'сучонок', 'сученок', 'сученыш', 'сученыша', 'сученыши', 'сученышей',
  'хер', 'хера', 'херу', 'хером', 'хере', 'херы', 'херов', 'херова', 'херово',
  'херовый', 'херовая', 'херовое', 'херовые', 'херового', 'херовой', 'херовую',
  'херовых', 'херовым', 'херовыми',
  'манда', 'манды', 'манде', 'манду', 'мандой', 'мандою', 'манд',
  'мандам', 'мандами', 'мандах',
  'тварь', 'твари', 'тварью', 'тварей', 'тварям', 'тварями', 'тварях',
  'педик', 'педика', 'педику', 'педиком', 'педике', 'педики', 'педиков',
  'педикам', 'педиками', 'педиках',
  // Forms with a separate word boundary
  'сру', 'срешь', 'срет', 'срем', 'срете',
  'ссу', 'ссышь', 'ссешь', 'ссет', 'ссем', 'ссете', 'ссут',
  // English
  'fuck', 'fucking', 'fucked', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers',
  'motherfucking', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'bitchy',
  'cunt', 'cunts', 'asshole', 'assholes', 'dick', 'dicks', 'dickhead', 'dickheads',
  'pussy', 'pussies', 'whore', 'whores', 'slut', 'sluts', 'bastard', 'bastards',
]);

const CONTAINS = [
  // Distinctive roots: safe to match anywhere in a word.
  'хуй', 'хуя', 'хую', 'хуе', 'хуи',
  'пизд', 'бляд', 'блят',
  'муда', 'муди', 'мудозвон',
  'пидор', 'пидар', 'пидрил',
  'гандон', 'залуп', 'говн', 'жоп', 'дроч', 'шлюх', 'мраз', 'долбоеб',
  'херн', 'срак', 'сран', 'срал', 'срать', 'срущ', 'срут',
  'ссать', 'ссал', 'ссака', 'ссани', 'ссущ',
  'перд', 'сучар', 'сучон', 'сучен', 'мандавош', 'тварюг',
];

const STARTS = [
  // Words starting with these roots are abusive; this avoids matching innocent
  // words with the same letters inside (потребление, себя, уебать is intentionally caught).
  'еб', 'заеб', 'наеб', 'выеб', 'отъеб', 'уеб', 'разъеб', 'съеб',
  'поеб', 'проеб', 'приеб', 'подъеб', 'объеб', 'взъеб', 'изъеб',
  'перееб', 'доеб', 'недоеб', 'долбоеб',
  // English suffixes
  'fuck', 'motherfuck', 'shit', 'bitch', 'cunt', 'asshole', 'dickhead', 'whore', 'slut', 'bastard',
];

const WORD_RE = /[\p{L}\p{N}_]/u;

function normalize(word) {
  return word.toLowerCase().replace(/ё/g, 'е');
}

function isProfane(word) {
  const value = normalize(word);
  if (EXACT.has(value)) return true;
  if (CONTAINS.some((root) => value.includes(root))) return true;
  if (STARTS.some((root) => value.startsWith(root))) return true;
  return false;
}

export function maskProfanity(value) {
  return String(value ?? '').split(/([^\p{L}\p{N}_]+)/u).map((part) => {
    if (!WORD_RE.test(part) || !isProfane(part)) return part;
    return '*'.repeat([...part].length);
  }).join('');
}

export { isProfane };
