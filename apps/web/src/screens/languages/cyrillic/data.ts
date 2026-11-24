/** A Cyrillic letter: `c` its form, `l` how it is written in Latin ("—" for a silent sign). */
export interface Letter {
  c: string;
  l: string;
  tip: string;
}

export interface Level {
  id: number;
  name: string;
  desc: string;
  letters: Letter[];
}

/** A word or place: `c` in Cyrillic, `l` in Latin letters. */
export interface Reading {
  c: string;
  l: string;
}

/* ============================================================
   Course content: letters (grouped by lesson), words, cities.
   c = Cyrillic, l = how it is written in the Latin alphabet.
   ============================================================ */

export const LEVELS: Level[] = [
  {
    id: 1,
    name: 'Familiar Faces',
    desc: 'Look the same, written the same',
    letters: [
      { c: 'А', l: 'a', tip: 'Same letter as Latin A.' },
      { c: 'Е', l: 'e', tip: 'Same shape — written as e.' },
      { c: 'К', l: 'k', tip: 'Same as Latin K.' },
      { c: 'М', l: 'm', tip: 'Same as Latin M.' },
      { c: 'О', l: 'o', tip: 'Same as Latin O.' },
      { c: 'Т', l: 't', tip: 'Same as Latin T.' },
    ],
  },
  {
    id: 2,
    name: 'Tricky Twins',
    desc: "Look like Latin letters — but they're not",
    letters: [
      { c: 'В', l: 'v', tip: "Looks like B, but it's written v." },
      { c: 'Н', l: 'n', tip: "Looks like H, but it's written n." },
      { c: 'Р', l: 'r', tip: "Looks like P, but it's written r." },
      { c: 'С', l: 's', tip: "Looks like C, but it's written s." },
      { c: 'У', l: 'u', tip: "Looks like y, but it's written u." },
      { c: 'Х', l: 'kh', tip: "Looks like X, but it's written kh." },
    ],
  },
  {
    id: 3,
    name: 'Brand New I',
    desc: 'New shapes to recognize',
    letters: [
      { c: 'Б', l: 'b', tip: 'A new shape — written b.' },
      { c: 'Г', l: 'g', tip: 'Like an upside-down L — written g.' },
      { c: 'Д', l: 'd', tip: 'A new shape — written d.' },
      { c: 'З', l: 'z', tip: 'Looks like a 3 — written z.' },
      { c: 'И', l: 'i', tip: 'A backwards N — written i.' },
    ],
  },
  {
    id: 4,
    name: 'Brand New II',
    desc: 'A few more shapes to recognize',
    letters: [
      { c: 'Л', l: 'l', tip: 'A new shape — written l.' },
      { c: 'П', l: 'p', tip: 'Like a table / π — written p.' },
      { c: 'Ф', l: 'f', tip: 'A new shape — written f.' },
      { c: 'Й', l: 'y', tip: 'И with a hat — written y.' },
      { c: 'Э', l: 'e', tip: 'A backwards C — written e.' },
    ],
  },
  {
    id: 5,
    name: 'Multi-Letter',
    desc: 'One Cyrillic letter → several Latin ones',
    letters: [
      { c: 'Ж', l: 'zh', tip: 'One letter, written as zh.' },
      { c: 'Ц', l: 'ts', tip: 'Written as ts.' },
      { c: 'Ч', l: 'ch', tip: 'Looks like a 4 — written ch.' },
      { c: 'Ш', l: 'sh', tip: 'Written as sh.' },
      { c: 'Щ', l: 'shch', tip: 'Ш with a tail — written shch.' },
    ],
  },
  {
    id: 6,
    name: 'Combos & Signs',
    desc: 'Y-letters, plus two silent signs',
    letters: [
      { c: 'Я', l: 'ya', tip: 'A backwards R — written ya.' },
      { c: 'Ю', l: 'yu', tip: 'Written as yu.' },
      { c: 'Ё', l: 'yo', tip: 'Е with two dots — written yo.' },
      { c: 'Ы', l: 'y', tip: 'Written as y.' },
      { c: 'Ь', l: '—', tip: 'Soft sign — usually dropped when written out.' },
      { c: 'Ъ', l: '—', tip: 'Hard sign — usually dropped when written out.' },
    ],
  },
  {
    id: 7,
    name: 'Ukrainian Extras',
    desc: 'Letters Ukrainian adds to the set',
    letters: [
      { c: 'І', l: 'i', tip: 'Ukrainian dotted I — written i (Russian writes И).' },
      { c: 'Ї', l: 'yi', tip: 'I with two dots — written yi.' },
      { c: 'Є', l: 'ye', tip: 'A reversed E — written ye.' },
      { c: 'Ґ', l: 'g', tip: 'G with a little hook — a hard g (rare).' },
    ],
  },
  {
    id: 8,
    name: 'Serbian Extras',
    desc: 'Letters Serbian & Montenegrin add',
    letters: [
      { c: 'Ј', l: 'j', tip: "A thin J — read as j (a soft 'y' glide)." },
      { c: 'Љ', l: 'lj', tip: 'Л tied to a soft sign — read as lj.' },
      { c: 'Њ', l: 'nj', tip: 'Н tied to a soft sign — read as nj.' },
      { c: 'Ђ', l: 'dj', tip: 'Read as dj (the Serbian đ).' },
      { c: 'Ћ', l: 'ch', tip: 'A soft ch (the Serbian ć).' },
      { c: 'Џ', l: 'dzh', tip: 'Like Ц with a tail — read as dzh.' },
    ],
  },
  {
    id: 9,
    name: 'Macedonian Extras',
    desc: 'Letters unique to Macedonian',
    letters: [
      { c: 'Ѕ', l: 'dz', tip: 'Looks like Latin S — read as dz.' },
      { c: 'Ѓ', l: 'gj', tip: 'Г with an accent — a soft g (gj).' },
      { c: 'Ќ', l: 'kj', tip: 'К with an accent — a soft k (kj).' },
    ],
  },
  {
    id: 10,
    name: 'Montenegrin Extras',
    desc: 'Two soft letters Montenegrin adds',
    letters: [
      { c: 'С\u0301', l: 's', tip: 'Montenegrin soft S (ś) — read as s.' },
      { c: 'З\u0301', l: 'z', tip: 'Montenegrin soft Z (ź) — read as z.' },
    ],
  },
];

/* words: c = Cyrillic, l = how it's spelled in the Latin alphabet */
export const WORDS: Reading[] = [
  { c: 'кот', l: 'kot' },
  { c: 'ток', l: 'tok' },
  { c: 'мак', l: 'mak' },
  { c: 'мама', l: 'mama' },
  { c: 'атом', l: 'atom' },
  { c: 'такт', l: 'takt' },
  { c: 'нос', l: 'nos' },
  { c: 'сон', l: 'son' },
  { c: 'сам', l: 'sam' },
  { c: 'там', l: 'tam' },
  { c: 'вот', l: 'vot' },
  { c: 'сорт', l: 'sort' },
  { c: 'март', l: 'mart' },
  { c: 'урок', l: 'urok' },
  { c: 'рука', l: 'ruka' },
  { c: 'вкус', l: 'vkus' },
  { c: 'стена', l: 'stena' },
  { c: 'кран', l: 'kran' },
  { c: 'сестра', l: 'sestra' },
  { c: 'банк', l: 'bank' },
  { c: 'год', l: 'god' },
  { c: 'газ', l: 'gaz' },
  { c: 'зуб', l: 'zub' },
  { c: 'друг', l: 'drug' },
  { c: 'город', l: 'gorod' },
  { c: 'вода', l: 'voda' },
  { c: 'мир', l: 'mir' },
  { c: 'бар', l: 'bar' },
  { c: 'лампа', l: 'lampa' },
  { c: 'план', l: 'plan' },
  { c: 'флаг', l: 'flag' },
  { c: 'пол', l: 'pol' },
  { c: 'лимон', l: 'limon' },
  { c: 'эра', l: 'era' },
  { c: 'журнал', l: 'zhurnal' },
  { c: 'час', l: 'chas' },
  { c: 'душа', l: 'dusha' },
  { c: 'школа', l: 'shkola' },
  { c: 'чашка', l: 'chashka' },
  { c: 'щука', l: 'shchuka' },
  { c: 'маяк', l: 'mayak' },
  { c: 'меню', l: 'menyu' },
  { c: 'сын', l: 'syn' },
  { c: 'ёж', l: 'yozh' },
  { c: 'юг', l: 'yug' },
  { c: 'язык', l: 'yazyk' },
  { c: 'семья', l: 'semya' },
  { c: 'дочь', l: 'doch' },
  { c: 'ліс', l: 'lis' },
  { c: 'сік', l: 'sik' },
  { c: 'сіль', l: 'sil' },
  { c: 'їжа', l: 'yizha' },
  { c: 'євро', l: 'yevro' },
  { c: 'ґанок', l: 'ganok' },
  { c: 'ђак', l: 'djak' },
  { c: 'џеп', l: 'dzhep' },
  { c: 'ѕид', l: 'dzid' },
  { c: 'ѓон', l: 'gjon' },
  { c: 'ќерка', l: 'kjerka' },
];

/* city names from countries that use Cyrillic, with their Latin reading */
export const CITIES: Reading[] = [
  { c: 'Москва', l: 'Moskva' },
  { c: 'Санкт-Петербург', l: 'Sankt-Peterburg' },
  { c: 'Новосибирск', l: 'Novosibirsk' },
  { c: 'Екатеринбург', l: 'Ekaterinburg' },
  { c: 'Казань', l: 'Kazan' },
  { c: 'Нижний Новгород', l: 'Nizhniy Novgorod' },
  { c: 'Челябинск', l: 'Chelyabinsk' },
  { c: 'Самара', l: 'Samara' },
  { c: 'Омск', l: 'Omsk' },
  { c: 'Ростов-на-Дону', l: 'Rostov-na-Donu' },
  { c: 'Уфа', l: 'Ufa' },
  { c: 'Красноярск', l: 'Krasnoyarsk' },
  { c: 'Воронеж', l: 'Voronezh' },
  { c: 'Пермь', l: 'Perm' },
  { c: 'Волгоград', l: 'Volgograd' },
  { c: 'Сочи', l: 'Sochi' },
  { c: 'Владивосток', l: 'Vladivostok' },
  { c: 'Ярославль', l: 'Yaroslavl' },
  { c: 'Тула', l: 'Tula' },
  { c: 'Иркутск', l: 'Irkutsk' },
  { c: 'Киев', l: 'Kiev' },
  { c: 'Харьков', l: 'Kharkov' },
  { c: 'Одесса', l: 'Odessa' },
  { c: 'Львов', l: 'Lvov' },
  { c: 'Донецк', l: 'Donetsk' },
  { c: 'Минск', l: 'Minsk' },
  { c: 'Гомель', l: 'Gomel' },
  { c: 'Брест', l: 'Brest' },
  { c: 'София', l: 'Sofiya' },
  { c: 'Пловдив', l: 'Plovdiv' },
  { c: 'Варна', l: 'Varna' },
  { c: 'Бургас', l: 'Burgas' },
  { c: 'Београд', l: 'Beograd' },
  { c: 'Нови Сад', l: 'Novi Sad' },
  { c: 'Ниш', l: 'Nish' },
  { c: 'Алматы', l: 'Almaty' },
  { c: 'Астана', l: 'Astana' },
  { c: 'Караганда', l: 'Karaganda' },
  { c: 'Улан-Батор', l: 'Ulan-Bator' },
  { c: 'Бишкек', l: 'Bishkek' },
  { c: 'Львів', l: 'Lviv' },
  { c: 'Дніпро', l: 'Dnipro' },
  { c: 'Тернопіль', l: 'Ternopil' },
  { c: 'Скопје', l: 'Skopje' },
  { c: 'Подгорица', l: 'Podgoritsa' },
  { c: 'Никшић', l: 'Nikshich' },
  { c: 'Ваљево', l: 'Valjevo' },
  { c: 'Врање', l: 'Vranje' },
];
