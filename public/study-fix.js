/* KINGDOM BIBLE — Study intent fix (local-first, offline-safe).
   Overrides the intent-blind answerStudy from app.js: prayer-point requests
   now return prayer points, verse requests return verses with text, and
   passage queries keep the verse-anchored study. No network, no new deps. */
(function () {
var VERSES = {
  faith: ['Hebrews 11:1', 'Romans 10:17', 'James 2:17', 'Mark 11:24'],
  prayer: ['Philippians 4:6', '1 Thessalonians 5:17', 'Matthew 6:6', 'Jeremiah 33:3'],
  love: ['1 Corinthians 13:4', 'John 3:16', '1 John 4:8'],
  grace: ['Ephesians 2:8', 'Titus 2:11', 'Romans 3:24'],
  peace: ['Philippians 4:7', 'John 14:27', 'Isaiah 26:3'],
  strength: ['Philippians 4:13', 'Isaiah 41:10', 'Psalm 46:1'],
  hope: ['Romans 15:13', 'Jeremiah 29:11', 'Psalm 42:11'],
  joy: ['Nehemiah 8:10', 'Philippians 4:4', 'Psalm 16:11'],
  forgiveness: ['1 John 1:9', 'Ephesians 4:32', 'Matthew 6:14'],
  healing: ['Jeremiah 17:14', 'Psalm 103:3', 'Isaiah 53:5'],
  wisdom: ['Proverbs 3:5', 'James 1:5', 'Proverbs 2:6'],
  protection: ['Psalm 91:1', 'Psalm 46:1', 'Proverbs 18:10'],
  provision: ['Philippians 4:19', 'Matthew 6:33', 'Psalm 23:1'],
  fear: ['Isaiah 41:10', '2 Timothy 1:7', 'Psalm 56:3'],
  anxiety: ['Philippians 4:6', '1 Peter 5:7', 'Matthew 6:34'],
  kingdom: ['Matthew 6:33', 'Mark 1:15', 'Revelation 11:15'],
  gospel: ['Mark 1:1', 'Romans 1:16', '1 Corinthians 15:1'],
  covenant: ['Genesis 17:7', 'Exodus 24:7', 'Luke 22:20']
};
function cleanTopic(s) {
  var x = String(s || '').toLowerCase().replace(/[?.!,"']/g, ' ').replace(/\s+/g, ' ').trim();
  x = x.replace(/^(please\s+|kindly\s+|give\s+me\s+|show\s+me\s+|create\s+(a\s+)?|make\s+(a\s+)?|write\s+(a\s+)?)/, '').trim();
  x = x.replace(/\s+(please|bible|scripture|study|today|now)\s*$/, '').trim();
  return x.slice(0, 42).trim();
}
function extractTopic(q) {
  q = String(q || '');
  var m = q.match(/(?:points?|verses?|scriptures?|study|devotional)\s*(?:on|about|for)\s+([A-Za-z][A-Za-z\s&'-]{1,48})/i);
  var raw = m ? m[1] : '';
  if (!raw) { m = q.match(/(?:about|on|for)\s+([A-Za-z][A-Za-z\s&'-]{1,40})[?.!]?\s*$/i); raw = m ? m[1] : ''; }
  return cleanTopic(raw);
}
function resolveKey(topic) {
  topic = String(topic || '').toLowerCase().trim();
  if (!topic) return '';
  if (VERSES[topic]) return topic;
  var alias = { worry: 'anxiety', afraid: 'fear', scared: 'fear', courage: 'strength', heal: 'healing', health: 'healing', money: 'provision', finances: 'provision', work: 'provision', thankful: 'peace', trust: 'faith', believe: 'faith' };
  if (alias[topic] && VERSES[alias[topic]]) return alias[topic];
  var ks = Object.keys(VERSES);
  for (var i = 0; i < ks.length; i++) { if (topic.indexOf(ks[i]) >= 0 || ks[i].indexOf(topic) >= 0) return ks[i]; }
  try {
    var dk = Object.keys(DICTIONARY);
    for (var j = 0; j < dk.length; j++) { if (topic.indexOf(dk[j]) >= 0) return dk[j]; }
  } catch (e) {}
  return topic;
}
async function refTexts(refs, tr) {
  var out = [], list = (refs || []).slice(0, 5);
  for (var i = 0; i < list.length; i++) {
    try {
      var v = await getVerse(list[i], tr || state.reader.translation);
      out.push(v && v.text ? v : { ref: list[i], text: '', translation: tr || state.reader.translation });
    } catch (e) { out.push({ ref: list[i], text: '', translation: state.reader.translation }); }
  }
  return out;
}

function verseCards(list) {
  return list.map(function (x) {
    var body = x.text ? '"'+esc(x.text)+'"' : 'Open this reference in the Bible reader.';
    return '<div style="margin:10px 0;padding:10px 12px;border-left:3px solid #c9a227;background:rgba(255,255,255,.03);border-radius:0 8px 8px 0"><div style="font-family:var(--scripture,Georgia,serif);font-size:16px">'+body+'</div>'
      + '<div style="margin-top:6px"><button class="citation" data-ref="'+esc(x.ref)+'">'+esc(x.ref)+'</button></div></div>';
  }).join('');
}
function prayerForVerse(v) {
  var R = v.ref;
  return [
    'Father, by '+R+' I receive what Your Word says and thank You for it.',
    'Lord, where '+R+' confronts my thinking, correct me and shape my actions today.',
    'Father, turn '+R+' into one obedient step through me.',
    'Lord, let '+R+' strengthen someone I love this week.',
    'Father, when feelings contradict '+R+', teach me to stand on Your Word.'
  ];
}
function prayerForTopic(topic, verses) {
  var V = verses || [];
  var c0 = V[0] ? V[0].ref : topic, c1 = V[1] ? V[1].ref : c0;
  var c2 = V[2] ? V[2].ref : c0, c3 = V[3] ? V[3].ref : c0;
  return [
    'Father, thank You for '+topic+' (see '+c0+') - I receive Your promise.',
    'Lord, grow my '+topic+' where it is weak (see '+c1+').',
    'Father, meet my needs around '+topic+' (see '+c2+').',
    'Lord, make my '+topic+' fruitful in love and good works (see '+c3+').',
    'Father, when '+topic+' is tested, keep me standing (see '+c0+').'
  ];
}
function citeBtn(r) { return '<button class="citation" data-ref="'+esc(r)+'">'+esc(r)+'</button>'; }

async function fixedAnswerStudy(q) {
  q = String(q || '').trim();
  if (!q) return;
  var box = document.querySelector('#aiMessages');
  var safeQ = esc(q);
  box.innerHTML = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><p>Studying...</p></div>';
  var v = null, refs = [];
  try { var pp = parseRef(q); if (pp && pp.verse != null) v = await getVerse(q); } catch (e) { v = null; }
  if (!v) { var refMatch = q.match(/([1-3]?\s?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\s+\d+\s*:\s*\d+)/i); if (refMatch) { try { v = await getVerse(refMatch[1]); } catch (e) { v = null; } } }
  if (!v && state.aiContext) v = state.aiContext;
  if (v) { try { var d = await loadXrefs(v.book); refs = (d[v.ref] || []).slice(0, 7); } catch (e) { refs = []; } }
  var low = q.toLowerCase();
  var isPrayer = /prayer\s*points?|\bpray\b|\bprayers?\b|intercess|declaration/i.test(low);
  var topic = extractTopic(q), key = resolveKey(topic), html = '';
  if (v && isPrayer) {
    html = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><div class="eyebrow">PRAYER POINTS</div>'
      + '<h3>Prayer points on '+esc(v.ref)+'</h3><ol>'
      + prayerForVerse(v).map(function (p) { return '<li>'+esc(p)+'</li>'; }).join('') + '</ol>'
      + '<h3>Anchor Scripture</h3><p>'+esc(v.text)+'</p><p>'+citeBtn(v.ref)+'</p></div>';
  } else if (v) {
    html = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><div class="eyebrow">SCRIPTURE STUDY</div>'
      + '<h3>Direct answer</h3><p>'+studySummary(v)+'</p>'
      + '<h3>Bible text</h3><p>'+esc(v.text)+'</p><p>'+citeBtn(v.ref)+'</p>'
      + '<h3>Relevant Scriptures</h3><p>'+(refs.length ? refs.map(function (r) { return citeBtn(r.split(',')[0]); }).join(' ') : 'None indexed.')+'</p></div>';
  } else if (isPrayer && (key || topic)) {
    var lbl = (key || topic || 'faith');
    var verses = await refTexts(VERSES[key] || []);
    html = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><div class="eyebrow">PRAYER POINTS</div>'
      + '<h3>Prayer points on '+esc(lbl)+'</h3><ol>'
      + prayerForTopic(lbl, verses).map(function (p) { return '<li>'+esc(p)+'</li>'; }).join('') + '</ol>'
      + '<h3>Anchor Scriptures</h3>'+verseCards(verses)+'</div>';
  } else if (key && (VERSES[key] || (typeof DICTIONARY !== 'undefined' && DICTIONARY[key]))) {
    var rl = VERSES[key] || DICTIONARY[key][1];
    var vs2 = await refTexts(rl);
    var df = (typeof DICTIONARY !== 'undefined' && DICTIONARY[key]) ? DICTIONARY[key][0] : ('Key passages about '+key+'.');
    html = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><div class="eyebrow">TOPICAL STUDY</div>'
      + '<h3>Direct answer</h3><p>'+esc(df)+'</p><h3>Relevant Scriptures</h3>'+verseCards(vs2)+'</div>';
  } else {
    html = '<div class="message user">'+safeQ+'</div><div class="ai-answer"><h3>Try a clearer reference or topic.</h3>'
      + '<p>Examples: Prayer points on faith, Bible verses about peace, Explain Romans 8:28.</p></div>';
  }
  box.innerHTML = html;
  var cs = box.querySelectorAll('.citation');
  for (var i = 0; i < cs.length; i++) { (function (b) { b.onclick = function () { openReference(b.dataset.ref); }; })(cs[i]); }
  var norm = q.toLowerCase();
  state.aiHistory = state.aiHistory.filter(function (x) { return String(x.question || '').toLowerCase() !== norm; });
  state.aiHistory.unshift({ question: q, html: html, date: today() });
  state.aiHistory = state.aiHistory.slice(0, 25);
  delete state.aiContext;
  save();
}
window.answerStudy = fixedAnswerStudy;
try { answerStudy = fixedAnswerStudy; } catch (e) {}
})();
