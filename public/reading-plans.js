/* KINGDOM BIBLE — deterministic reading-plan schedules.
   Each plan maps a day to real, parseable references. Keep this module DOM-free
   so coverage and sequence can be verified without a browser. */
(function (root, factory) {
  'use strict';
  const plans = factory();
  if (typeof module === 'object' && module.exports) module.exports = plans;
  else root.KingdomPlans = plans;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CURATED = {
    faith7: [
      'Hebrews 11:1', 'Romans 10:17', 'Ephesians 2:8-9', 'James 1:2-4',
      'Matthew 17:20', '2 Corinthians 5:7', 'Psalm 56:3'
    ],
    prayer7: [
      'Matthew 6:9-13', 'Philippians 4:6-7', 'Psalm 5:3', 'Luke 11:9-10',
      '1 Thessalonians 5:17-18', 'James 5:16', 'Romans 8:26'
    ],
    kingdom21: [
      'Matthew 5:3-12', 'Matthew 6:25-34', 'Matthew 13:31-33', 'Matthew 18:1-4',
      'Matthew 20:25-28', 'Matthew 22:34-40', 'Mark 1:14-15', 'Luke 4:16-21',
      'Luke 6:20-26', 'Luke 10:25-37', 'Luke 12:22-34', 'Luke 13:18-21',
      'Luke 14:7-11', 'Luke 15:11-24', 'Luke 17:20-21', 'John 3:1-8',
      'John 13:12-17', 'Acts 2:42-47', 'Romans 14:17-19', 'Colossians 1:13-20',
      'Revelation 11:15'
    ],
    jesus30: [
      'Matthew 1:18-25', 'Matthew 2:1-12', 'Matthew 3:13-17', 'Matthew 4:1-11',
      'Matthew 4:18-22', 'Matthew 5:1-12', 'Matthew 5:13-16', 'Matthew 5:17-20',
      'Matthew 6:5-15', 'Matthew 6:25-34', 'Matthew 7:24-29', 'Matthew 8:1-13',
      'Matthew 8:23-27', 'Matthew 9:9-13', 'Matthew 9:35-38', 'Matthew 11:25-30',
      'Matthew 13:1-9', 'Matthew 14:13-21', 'Matthew 16:13-20', 'Matthew 17:1-8',
      'Matthew 18:21-35', 'Matthew 20:25-28', 'Matthew 21:1-11', 'Matthew 22:34-40',
      'Matthew 26:36-46', 'Matthew 27:45-54', 'Matthew 28:1-10', 'Mark 1:21-28',
      'Luke 15:11-32', 'John 20:24-31'
    ]
  };

  const DAYS = { year: 365, nt90: 90, gospels30: 30, psalms30: 30, proverbs31: 31,
    faith7: 7, prayer7: 7, kingdom21: 21, jesus30: 30 };

  function chapterRefs(books, firstBook, endBook) {
    if (!Array.isArray(books)) return [];
    const refs = [];
    for (let book = firstBook; book < Math.min(endBook, books.length); book++) {
      const entry = books[book];
      const count = Math.max(0, Number(entry && entry.chapters) || 0);
      for (let chapter = 1; chapter <= count; chapter++) {
        refs.push(String(entry.name) + ' ' + chapter);
      }
    }
    return refs;
  }

  function spread(refs, days, day) {
    if (!days || !refs.length) return [];
    const n = Math.max(0, Math.min(days - 1, Math.floor(Number(day) || 0)));
    const start = Math.floor(n * refs.length / days);
    const end = Math.floor((n + 1) * refs.length / days);
    return refs.slice(start, end);
  }

  function readings(id, day, books, customPlans) {
    const n = Math.max(0, Math.floor(Number(day) || 0));
    const custom = Array.isArray(customPlans) && customPlans.find(plan => plan && plan.id === id);
    if (custom && Array.isArray(custom.refs) && custom.refs.length) {
      return [String(custom.refs[Math.min(n, custom.refs.length - 1)])];
    }
    const days = DAYS[id];
    if (!days) return [];
    const index = Math.min(n, days - 1);
    if (id === 'year') return spread(chapterRefs(books, 0, books.length), days, index);
    if (id === 'nt90') return spread(chapterRefs(books, 39, 66), days, index);
    if (id === 'gospels30') return spread(chapterRefs(books, 39, 43), days, index);
    if (id === 'psalms30') return spread(chapterRefs(books, 18, 19), days, index);
    if (id === 'proverbs31') return spread(chapterRefs(books, 19, 20), days, index);
    return CURATED[id] ? [CURATED[id][index]] : [];
  }

  return { DAYS, CURATED, chapterRefs, readings };
});
