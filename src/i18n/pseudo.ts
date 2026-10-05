import { I18N } from '../../config/i18n';

const PSEUDO_CHARS: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ď', e: 'è', f: 'ƒ', g: 'ĝ', h: 'ħ',
  i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ḿ', n: 'ñ', o: 'ô', p: 'þ',
  q: 'զ', r: 'ř', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ж',
  y: 'ý', z: 'ź',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ď', E: 'È', F: 'Ƒ', G: 'Ĝ', H: 'Ħ',
  I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ḿ', N: 'Ñ', O: 'Ô', P: 'Þ',
  Q: 'Զ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ж',
  Y: 'Ý', Z: 'Ź',
};

export function pseudoLocalize(text: string): string {
  const mapped = [...text].map((char) => PSEUDO_CHARS[char] ?? char).join('');
  const padding = '~'.repeat(Math.ceil(text.length * I18N.PSEUDO_EXPANSION_RATIO));
  return `${I18N.PSEUDO_OPEN}${mapped}${padding}${I18N.PSEUDO_CLOSE}`;
}
