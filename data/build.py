#!/usr/bin/env python3
"""Kingdom Bible — data build pipeline.
Converts raw public-domain sources into the app's unified data format."""
import json, os, re, sys
from collections import OrderedDict

RAW = os.path.join(os.path.dirname(__file__), 'raw')
OUT = os.path.join(os.path.dirname(__file__))

# Canonical book order (names exactly per product spec)
BOOKS = [
    ("Genesis","OT","Gen",["gen","ge","gn"]), ("Exodus","OT","Exod",["ex","exo","exod"]),
    ("Leviticus","OT","Lev",["lev","lv"]), ("Numbers","OT","Num",["num","nu","nm"]),
    ("Deuteronomy","OT","Deut",["deut","dt","de"]), ("Joshua","OT","Josh",["josh","jos"]),
    ("Judges","OT","Judg",["judg","jdg","jud"]), ("Ruth","OT","Ruth",["ruth","ru"]),
    ("1 Samuel","OT","1 Sam",["1sam","1sa","1s","isam"]), ("2 Samuel","OT","2 Sam",["2sam","2sa","2s","iisam"]),
    ("1 Kings","OT","1 Kgs",["1kings","1kg","1ki","1kin"]), ("2 Kings","OT","2 Kgs",["2kings","2kg","2ki","2kin"]),
    ("1 Chronicles","OT","1 Chr",["1chron","1chr","1ch"]), ("2 Chronicles","OT","2 Chr",["2chron","2chr","2ch"]),
    ("Ezra","OT","Ezra",["ezra","ezr"]), ("Nehemiah","OT","Neh",["neh","ne"]),
    ("Esther","OT","Esth",["esther","est","esth"]), ("Job","OT","Job",["job","jb"]),
    ("Psalms","OT","Ps",["psalm","psalms","ps","psm","pss"]), ("Proverbs","OT","Prov",["prov","pr","proverbs"]),
    ("Ecclesiastes","OT","Eccl",["ecclesiastes","eccl","ecc"]), ("Song of Solomon","OT","Song",["songs","songofsolomon","songofsongs","sos","canticles","song"]),
    ("Isaiah","OT","Isa",["isa","is"]), ("Jeremiah","OT","Jer",["jer","jr"]),
    ("Lamentations","OT","Lam",["lam","lamentations"]), ("Ezekiel","OT","Ezek",["ezek","eze","ezk"]),
    ("Daniel","OT","Dan",["dan","dn"]), ("Hosea","OT","Hos",["hos","ho"]),
    ("Joel","OT","Joel",["joel","joe"]), ("Amos","OT","Amos",["amos","am"]),
    ("Obadiah","OT","Obad",["obad","ob"]), ("Jonah","OT","Jonah",["jonah","jon"]),
    ("Micah","OT","Mic",["mic","micah"]), ("Nahum","OT","Nah",["nah","nahum"]),
    ("Habakkuk","OT","Hab",["hab","habakkuk"]), ("Zephaniah","OT","Zeph",["zeph","zep"]),
    ("Haggai","OT","Hag",["hag","haggai"]), ("Zechariah","OT","Zech",["zech","zec"]),
    ("Malachi","OT","Mal",["mal","malachi"]),
    ("Matthew","NT","Matt",["matt","matthew","mt"]), ("Mark","NT","Mark",["mark","mk","mr"]),
    ("Luke","NT","Luke",["luke","lk","luk"]), ("John","NT","John",["john","jn","joh"]),
    ("Acts","NT","Acts",["acts","act","ac"]), ("Romans","NT","Rom",["rom","romans","ro"]),
    ("1 Corinthians","NT","1 Cor",["1cor","1co","1corinthians","icor"]), ("2 Corinthians","NT","2 Cor",["2cor","2co","2corinthians","iicor"]),
    ("Galatians","NT","Gal",["gal","galatians"]), ("Ephesians","NT","Eph",["eph","ephesians"]),
    ("Philippians","NT","Phil",["phil","php","philippians"]), ("Colossians","NT","Col",["col","colossians"]),
    ("1 Thessalonians","NT","1 Thess",["1thess","1th","1thessalonians"]), ("2 Thessalonians","NT","2 Thess",["2thess","2th","2thessalonians"]),
    ("1 Timothy","NT","1 Tim",["1tim","1ti","1timothy"]), ("2 Timothy","NT","2 Tim",["2tim","2ti","2timothy"]),
    ("Titus","NT","Titus",["titus","tit","ti"]), ("Philemon","NT","Phlm",["philemon","phlm","phm"]),
    ("Hebrews","NT","Heb",["heb","hebrews"]), ("James","NT","Jas",["james","jas","jm"]),
    ("1 Peter","NT","1 Pet",["1pet","1pe","1peter","ipet"]), ("2 Peter","NT","2 Pet",["2pet","2pe","2peter","iipet"]),
    ("1 John","NT","1 John",["1john","1jn","1jo","1jhn"]), ("2 John","NT","2 John",["2john","2jn","2jo"]),
    ("3 John","NT","3 John",["3john","3jn","3jo"]), ("Jude","NT","Jude",["jude","jud"]),
    ("Revelation","NT","Rev",["rev","revelation","re"]),
]

WEB_FILES = ["genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth","1samuel","2samuel",
"1kings","2kings","1chronicles","2chronicles","ezra","nehemiah","esther","job","psalms","proverbs","ecclesiastes",
"songofsolomon","isaiah","jeremiah","lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah",
"nahum","habakkuk","zephaniah","haggai","zechariah","malachi","matthew","mark","luke","john","acts","romans",
"1corinthians","2corinthians","galatians","ephesians","philippians","colossians","1thessalonians","2thessalonians",
"1timothy","2timothy","titus","philemon","hebrews","james","1peter","2peter","1john","2john","3john","jude","revelation"]

def norm_ws(s):
    return re.sub(r'\s+', ' ', s).strip()

def build_books_meta():
    meta = []
    for i,(name,test,abbr,aliases) in enumerate(BOOKS):
        meta.append({"id": i, "name": name, "abbr": abbr, "t": test, "aliases": aliases})
    return meta

def convert_thiago(fname):
    d = json.load(open(os.path.join(RAW,fname), encoding='utf-8'))
    assert len(d)==66, fname
    books=[]
    for bi,b in enumerate(d):
        expected = BOOKS[bi][0]
        chapters=[]
        for ch in b['chapters']:
            chapters.append([norm_ws(v) for v in ch])
        books.append(chapters)
    return books

def convert_web():
    books=[]
    for f in WEB_FILES:
        d = json.load(open(os.path.join(RAW,'web',f+'.json'), encoding='utf-8'))
        chapters=[]
        for ck in sorted(d.keys(), key=lambda x:int(x)):
            verses = d[ck]
            arr=[]
            for vk in sorted(verses.keys(), key=lambda x:int(x)):
                arr.append(norm_ws(verses[vk]))
            chapters.append(arr)
        books.append(chapters)
    return books

def write_bible(key, books, name, license_note):
    doc = {"key":key,"name":name,"license":license_note,"books":books}
    with open(os.path.join(OUT, f'bible_{key}.json'),'w',encoding='utf-8') as f:
        json.dump(doc,f,ensure_ascii=False,separators=(',',':'))
    total_v = sum(len(c) for b in books for c in b)
    total_c = sum(len(b) for b in books)
    print(key, name, 'chapters', total_c, 'verses', total_v)

# ---- xrefs ----
def build_xrefs():
    # Map TSV abbrev -> canonical index
    tsv_books = json.load(open(os.path.join(RAW,'bible_books.json'),encoding='utf-8'))
    abbr2idx = {}
    for b in tsv_books:
        eng = b['abbreviation_eng']
        nm = b['name_eng']
        idx = None
        for i,(name,test,abbr,aliases) in enumerate(BOOKS):
            if name.lower()==nm.lower() or abbr.lower()==eng.lower():
                idx=i; break
        if idx is None:
            print('WARN unmatched tsv book', eng, nm)
        abbr2idx[eng]=idx
    # ref abbreviations used inside references: build from full names too
    idx2name = {i:BOOKS[i][0] for i in range(66)}
    # Build lookup for parsing ref book tokens
    token2name = {}
    for i,(name,test,abbr,aliases) in enumerate(BOOKS):
        low = name.lower()
        token2name[low]=name
        token2name[abbr.lower()]=name
        for a in aliases: token2name[a]=name
        # "1 Samuel" -> "1 samuel", "1samuel"
        token2name[name.lower().replace(' ','')]=name
        token2name[name.lower().replace(' ','')]=name
    # extra historical abbrevs that appear in TSK data
    extra = {"ps":"Psalms","psalm":"Psalms","psalms":"Psalms","psa":"Psalms","pro":"Proverbs","pr":"Proverbs",
    "eccles":"Ecclesiastes","song":"Song of Solomon","cant":"Song of Solomon","isa":"Isaiah","jer":"Jeremiah",
    "lam":"Lamentations","eze":"Ezekiel","dan":"Daniel","hos":"Hosea","joe":"Joel","amo":"Amos","oba":"Obadiah",
    "jon":"Jonah","mic":"Micah","nah":"Nahum","hab":"Habakkuk","zep":"Zephaniah","hag":"Haggai","zec":"Zechariah",
    "mal":"Malachi","mat":"Matthew","mar":"Mark","mrk":"Mark","luk":"Luke","joh":"John","act":"Acts","actsoftheapostles":"Acts",
    "rom":"Romans","1co":"1 Corinthians","2co":"2 Corinthians","gal":"Galatians","eph":"Ephesians","php":"Philippians",
    "col":"Colossians","1th":"1 Thessalonians","2th":"2 Thessalonians","1ti":"1 Timothy","2ti":"2 Timothy","tit":"Titus",
    "phm":"Philemon","heb":"Hebrews","jas":"James","jam":"James","1pe":"1 Peter","2pe":"2 Peter","1jn":"1 John",
    "2jn":"2 John","3jn":"3 John","jud":"Jude","jude":"Jude","rev":"Revelation","gen":"Genesis","exo":"Exodus",
    "ex":"Exodus","lev":"Leviticus","num":"Numbers","deu":"Deuteronomy","jos":"Joshua","jdg":"Judges","rut":"Ruth",
    "1sa":"1 Samuel","2sa":"2 Samuel","1ki":"1 Kings","2ki":"2 Kings","1ch":"1 Chronicles","2ch":"2 Chronicles",
    "ezr":"Ezra","neh":"Nehemiah","est":"Esther","job":"Job","chr":"1 Chronicles"}
    token2name.update({k.lower():v for k,v in extra.items()})

    xrefs = {}
    total_refs=0
    with open(os.path.join(RAW,'xrefs_kjv.tsv'),encoding='utf-8') as f:
        header = f.readline()
        for line in f:
            parts = line.rstrip('\n').split('\t')
            if len(parts)<5: continue
            book,ch,vv,anchor,refs = parts[0],parts[1],parts[2],parts[3],parts[4]
            idx = abbr2idx.get(book)
            if idx is None: continue
            key = f"{idx2name[idx]} {ch}:{vv}"
            lst = xrefs.setdefault(key, [])
            for r in refs.split('|'):
                r=r.strip()
                if not r: continue
                m = re.match(r'^([1-3]?\s?[A-Za-z]+\.?)\s+(\d+.*)$', r)
                if m:
                    tok = m.group(1).lower().replace('.','')
                    rest = m.group(2)
                    bn = token2name.get(tok)
                    if bn:
                        pretty = f"{bn} {rest}"
                        if pretty not in lst:
                            lst.append(pretty); total_refs+=1
    # cap refs per verse at 16, keep order
    capped = {}
    for k,v in xrefs.items():
        capped[k]=v[:16]
    with open(os.path.join(OUT,'xrefs.json'),'w',encoding='utf-8') as f:
        json.dump(capped,f,ensure_ascii=False,separators=(',',':'))
    print('xrefs verses:', len(capped), 'total refs (kept):', sum(len(v) for v in capped.values()))

if __name__=='__main__':
    meta = build_books_meta()
    # attach chapter counts from KJV
    kjv_books = convert_thiago('en_kjv.json')
    for i,b in enumerate(meta):
        b['chapters'] = len(kjv_books[i])
    with open(os.path.join(OUT,'books.json'),'w',encoding='utf-8') as f:
        json.dump({"books":meta},f,ensure_ascii=False,separators=(',',':'))
    print('books.json written,', sum(b['chapters'] for b in meta), 'chapters')
    write_bible('kjv', kjv_books, 'King James Version', 'Public Domain (1611, Cambridge tradition)')
    asv_books = convert_thiago('en_asv.json')
    # The ASV critical-text edition omits these traditional verse numbers.
    # Preserve canonical numbering with empty slots; the UI labels them editorially.
    asv_omissions = {
        39:{17:[21],18:[11],23:[14]}, 40:{7:[16],9:[44,46],11:[26],15:[28]},
        41:{17:[36],23:[17]}, 42:{5:[4]}, 43:{8:[37],15:[34],24:[7],28:[29]}, 44:{16:[24]}
    }
    for bi, chapters in asv_omissions.items():
        for ch, verses in chapters.items():
            for verse in verses:
                asv_books[bi][ch-1].insert(verse-1, '')
    write_bible('asv', asv_books, 'American Standard Version', 'Public Domain (1901)')
    write_bible('web', convert_web(), 'World English Bible', 'Public Domain / CC0 (modern English)')
    build_xrefs()
