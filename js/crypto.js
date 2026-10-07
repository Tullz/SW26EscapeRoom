/* crypto.js — Encryption room: "The Courier's Case" (Cyber Escape Rooms)

   Story: a criminal crew stole Harbourline Insurance's customer records. Police caught one
   of their couriers; DS Kemi Adeyemi asks the team to crack the codes in his briefcase.

   The codes (STEPS below, in order):
     1. book    — a text on the burner phone is a list of page.line.word numbers into the
                  paperback. The format is written in invisible ink inside the book's cover;
                  the pen in the case has a UV torch in its cap.
     2. stencil — the punched coffee loyalty card, laid over the newspaper word search, shows
                  half a sentence; turned upside down it shows the rest (the key is the dog's name).
     3. disk    — a second text holds a 5-letter password scrambled with a keyword cipher (each
                  letter shifted by the matching key letter). The key is the dog's name on the
                  courier's keyring; the brass cipher disk turns it back into the real word.
   The room's code word is never written in this file: it is computed by decoding FINAL.

   To add or reorder a code: add an entry to STEPS (isDone / hintSet / lesson / onDone),
   a HINTS set, and a gadget renderer in GADGETS if it needs a new tool on the workbench.

   Storage: localStorage `<team>_crypto_state` (an admin reset clears <team>_crypto_*).
   Completion: window.vault.completeRoom('crypto', word), once, when first solved.
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function announce(msg) { try { window.a11y?.announce?.(msg); } catch (_) {} }

  if (!$('#ccRoom') || !$('#ccScene')) return;

  // ---------- Constants ----------
  const ROOM = 'crypto';
  const STATE_VERSION = 1;
  const COST = { wrong: 2, hint: 5 };
  const points = window.utils?.points;

  function teamId() {
    try {
      const u = window.utils?.getUser?.() || JSON.parse(localStorage.getItem('user') || 'null');
      return String(u?.username || 'team').toLowerCase();
    } catch (_) { return 'team'; }
  }
  const STATE_KEY = teamId() + '_crypto_state';

  // ---------- Ciphers ----------
  const A = 65;
  const lettersOnly = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
  const mod = (n, m) => ((n % m) + m) % m;
  function shiftLetter(ch, by) { return String.fromCharCode(mod(ch.charCodeAt(0) - A + by, 26) + A); }
  // Keyword cipher: letter i is shifted by key letter (i mod key length). dir -1 decodes.
  function keyword(text, key, dir) {
    return text.split('').map(function (ch, i) { return shiftLetter(ch, dir * (key.charCodeAt(i % key.length) - A)); }).join('');
  }
  const FINAL = { cipher: 'MCUYJ', key: 'RUFUS' };
  const WORD = keyword(FINAL.cipher, FINAL.key, -1);

  // ---------- Content: the paperback (fixed line breaks so line counting is reliable) ----------
  const BOOK = {
    title: 'The Lighthouse Keeper',
    author: 'Mara Quill',
    code: [[3, 5, 9], [6, 5, 4], [8, 4, 3], [9, 7, 9]],   // page.line.word
    pages: [
      ['Elsie Marsh had kept the light on Gull', 'Rock for thirty years, and in all that', 'time no boat had ever come in a storm.', 'So when the knock came at midnight, she', 'thought at first it was the wind. It', 'came again, three slow taps, then two', 'quick ones. She lit the lamp, took the', 'poker from beside the stove, and went', 'down the iron stairs to the door.'],
      ['A man stood on the step, soaked to the', 'skin, holding a small leather case to', 'his chest as if it were a sleeping', 'child. His boat, he said, had lost its', 'engine off the point. He had rowed the', 'last mile. Elsie looked at his hands,', 'which were soft, and at his shoes,', 'which were new, and said nothing at', 'all. She stepped aside and let him in.'],
      ['The kitchen was the warmest room in the', 'tower. Elsie set the kettle on the stove', 'and pulled a chair close to the fire.', 'The stranger sat, but he did not let go', 'of the case. She made a pot of coffee,', 'strong and black, the way her father', 'had made it, and poured two cups. He', 'drank his in one go and asked for more.', 'Outside, the waves beat on the rock.'],
      ['"Who are you?" Elsie asked at last.', '"Nobody," he said. "A traveller. I', 'will be gone when the storm is over."', 'He smiled, but the smile stopped well', 'short of his eyes. Elsie had seen that', 'kind of smile before, on the faces of', 'men who sold things that were not', 'theirs to sell. She topped up his cup', 'and sat down across the table from him.'],
      ['For an hour they talked about nothing:', 'the weather, the fishing, the price of', 'bread on the mainland. The stranger', 'kept glancing at the clock. At one, his', 'phone buzzed. He read the message,', 'frowned, and took a thin book from his', 'coat. He turned the pages quickly,', 'counting under his breath, and wrote', 'a few words on the back of his hand.'],
      ['Elsie pretended not to notice. She', 'fetched a pack of cards from the drawer', 'and dealt two hands of rummy. He played', 'badly, his mind elsewhere. When he laid', 'down his last card, she saw the ink on', 'his hand: three short words, already', 'smudging. She could not read them. But', 'she noticed which page he had folded', 'down before he slipped the book away.'],
      ['At two the wind dropped, and the rain', 'eased to a drizzle. The stranger stood,', 'thanked her for the coffee, and said he', 'would wait for the tide in his boat.', 'Elsie walked him to the door and', 'watched his torch bob away down the', 'path to the landing. Then she climbed', 'the stairs to the lamp room, where she', 'could see the whole bay at once.'],
      ['There was no boat at the landing. There', 'never had been. Instead, a second light', 'was blinking out on the water, short', 'and long, over and over, from a ship', 'that showed no other lights at all.', 'Elsie knew a signal when she saw one.', 'She also knew that the stranger had', 'left something behind: his thin book', 'lay open on the kitchen table.'],
      ['She sat down with it and the lamp.', 'Page after page of dull sea stories,', 'except that some words had tiny pencil', 'dots beneath them. She copied them out', 'in order, and slowly the message grew,', 'like a picture coming out of a fog.', 'It was not a story. It was a puzzle,', 'and she had just found the first piece.', 'Elsie reached for the telephone.'],
      ['The coastguard answered on the first', 'ring. "Gull Rock," she said. "I have a', 'visitor you will want to meet, and a', 'ship in the bay that does not want to', 'be seen. Bring a fast boat. And bring', 'someone who is good with codes."', 'She put down the receiver, made a fresh', 'pot of coffee, and settled in to wait.', 'It was going to be a long night.']
    ]
  };
  const normWord = (w) => String(w || '').toLowerCase().replace(/[^a-z]/g, '');
  function bookWord(p, l, w) {
    const line = BOOK.pages[p - 1] && BOOK.pages[p - 1][l - 1];
    return line ? normWord(line.split(' ')[w - 1]) : '';
  }
  const BOOK_ANSWER = BOOK.code.map(function (c) { return bookWord(c[0], c[1], c[2]); });
  const BOOK_CODES_TEXT = BOOK.code.map(function (c) { return c.join('.'); });
  // Reader leaves: 0 = inside front cover, 1 = title page, 2.. = story pages 1..n
  const LEAVES = BOOK.pages.length + 2;

  // ---------- Content: the word search + coffee-card stencil ----------
  const GRID = {
    cols: 9, rows: 6,
    letters: 'SKHDSHELLTDRYBOATISCRABTOINAKHGULLDSNNCYWAVEGDDMATPIER',
    holes: [[0, 1], [0, 6], [1, 3], [1, 8], [2, 0], [2, 5], [3, 2], [4, 7]],  // card face up
    words: ['GULL', 'TIDE', 'PIER', 'WAVE', 'SAND', 'SHELL', 'CRAB', 'BOAT'],
    halves: { up: 'KEY IS THE…', down: '…DOGS NAME' }
  };
  function holeCells(rot, flip) {
    return GRID.holes.map(function (p) {
      let r = p[0], c = p[1];
      if (flip) c = GRID.cols - 1 - c;
      if (rot === 180) { r = GRID.rows - 1 - r; c = GRID.cols - 1 - c; }
      return r * GRID.cols + c;
    }).sort(function (a, b) { return a - b; });
  }
  function readThrough(rot, flip) { return holeCells(rot, flip).map(function (i) { return GRID.letters[i]; }).join(''); }

  const LIGHTHOUSE_SVG = '<svg viewBox="0 0 60 70" width="64" height="74" aria-hidden="true" style="margin:0 auto;display:block">' +
    '<path d="M24 22 L36 22 L40 62 L20 62 Z" fill="#f4e9c8"/><path d="M22.5 36 L37.5 36 L38.6 46 L21.4 46 Z" fill="#c0392b"/>' +
    '<rect x="23" y="14" width="14" height="8" fill="#ffd27a"/><path d="M22 14 L30 7 L38 14 Z" fill="#c0392b"/>' +
    '<path d="M37 16 L58 9 L58 25 Z M23 16 L2 9 L2 25 Z" fill="#ffd27a" opacity=".45"/><path d="M8 62 Q30 56 52 62 L52 66 L8 66 Z" fill="#163152"/></svg>';
  const CUP_SVG = '<svg viewBox="0 0 40 40" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 15h20v9a10 10 0 0 1-20 0z"/><path d="M27 17h3a5 5 0 0 1 0 10h-3"/><path d="M12 5c-2 3 2 4 0 7M18 4c-2 3 2 4 0 7M24 5c-2 3 2 4 0 7"/></svg>';
  // Small snake icon for the unnamed contact (emoji fonts are not on every machine).
  const SNAKE = '<svg class="cc-snake" viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true" focusable="false">' +
    '<path d="M17 8.6c0 4.2-10.5 2.4-10.5 6.9 0 3.6 8.6 3.1 12.6 4.6" fill="none" stroke="#3fb950" stroke-width="2.8" stroke-linecap="round"/>' +
    '<ellipse cx="17.2" cy="6" rx="3.6" ry="2.9" fill="#3fb950"/><circle cx="18.4" cy="5.2" r=".85" fill="#0b0f14"/>' +
    '<path d="M20.6 6.4l2 .5-1.9.9" stroke="#ff6b6b" stroke-width="1" fill="none"/></svg>';

  // ---------- Content: the burner phone's texts ----------
  const TEXTS = {
    t1: { time: '07:12', html: function () { return 'Tonight\'s instructions. You know where to look.<span class="cc-codes">' + BOOK_CODES_TEXT.join('&nbsp;&nbsp; ') + '</span>'; } },
    t2: { time: 'Just now', html: function () { return 'Change of plan. The buyer meets you at Pier 4, 9pm. He\'ll ask for the password: <span class="cc-scramble">' + FINAL.cipher + '</span>. Decode it with the usual key, then delete this.'; } }
  };

  // ---------- Content: the radio ----------
  const MSGS = {
    intro_kemi: { who: 'kemi', text: 'Thanks for coming in. Last night this crew stole Harbourline\'s customer records, and tonight they\'re selling them. We stopped their courier at Central Station. He won\'t talk, and everything in his case is written in code. Crack it and we can catch the buyer.' },
    intro_courier: { who: 'courier', text: 'Go on then, have a look. It\'s all encrypted, mate. You\'ll never read a word of it.' },
    phone_t1: { who: 'kemi', text: 'A text from a contact saved as a snake. Groups of three numbers, and "you know where to look". Whatever those numbers point to, I bet it\'s in this case.' },
    pen: { who: 'kemi', text: 'A spy pen! It writes in invisible ink, and that little purple torch makes the ink glow. I\'ve switched the torch on for you: look at things up close and move your pointer over them. (Use the UV torch button to turn it off and on.)' },
    ink_book: { who: 'kemi', tone: 'good', text: 'Page, line, word! So every group of three numbers is one word in this book.' },
    ink_paper: { who: 'kemi', text: 'Someone has drawn round that word search in invisible ink. The outline is exactly the size of a card.' },
    ink_ticket: { who: 'kemi', text: '"P4, 9pm." So he was heading somewhere tonight. Pier 4, maybe?' },
    wrong_book: { who: 'courier', text: 'Ha! Gibberish. Told you.' },
    book_done: { who: 'courier', tone: 'warn', text: '...Lucky guess.' },
    book_done2: { who: 'kemi', tone: 'good', text: '"Coffee card over puzzle." That isn\'t a sentence, it\'s an instruction.' },
    stencil_half: { who: 'kemi', text: '"Key is the..." the what? That\'s only half a sentence.' },
    stencil_half2: { who: 'kemi', text: '"...dogs name"? That sounds like the end of a sentence. Where\'s the start?' },
    stencil_done: { who: 'courier', tone: 'warn', text: 'It\'s a word search. It doesn\'t mean anything.' },
    text2: { who: 'kemi', tone: 'warn', text: 'His phone just buzzed again! Another message from the snake.' },
    phone_t2: { who: 'kemi', text: 'Five scrambled letters, and the buyer will ask for them tonight. I ran them through our code-breaking laptop: it tried every simple shift of the alphabet in under a second, and none of them made a word. Each letter has been moved by a different amount. We need their key.' },
    phone_t2b: { who: 'courier', text: 'Told you. Unbreakable.' },
    dog: { who: 'courier', tone: 'warn', text: 'Oi. Leave my dog out of this.' },
    wrong_disk: { who: 'courier', text: 'Nope. Keep spinning.' },
    solved: { who: 'kemi', tone: 'good', text: function () { return '<strong>' + WORD + '</strong>. That\'s the handover password! We\'ll be waiting at Pier 4 when the buyer asks for it.'; } },
    solved2: { who: 'courier', tone: 'warn', text: 'You cracked it with my DOG\'S NAME?' },
    solved3: { who: 'kemi', tone: 'good', text: 'Brilliant work, team. The crew picked a key anyone could guess, and that\'s what sank them.' }
  };
  const WHO = { kemi: 'DS Kemi Adeyemi', courier: 'Courier (interview room)' };

  // ---------- Content: notebook clues ----------
  const CLUES = {
    t1: function () { return '<b>Text from ' + SNAKE + ':</b> "Tonight\'s instructions. You know where to look." <b>' + BOOK_CODES_TEXT.join(' &middot; ') + '</b>'; },
    wallpaper: '<b>Phone lock screen:</b> a photo of a scruffy brown dog.',
    paper: '<b>Newspaper:</b> folded open at the puzzles page. Nobody has started the word search.',
    receipt: '<b>Receipt:</b> Paws &amp; Claws Pet Supplies: a chew toy, dog shampoo and tennis balls.',
    card: '<b>Coffee loyalty card:</b> 8 holes punched in odd places, not in the stamp boxes.',
    pen: '<b>Pen:</b> the cap has a tiny UV torch for reading invisible ink.',
    ink_book: { uv: true, html: '<b>Invisible ink inside the book\'s cover:</b> page &middot; line &middot; word' },
    ink_paper: { uv: true, html: '<b>Invisible ink on the word search:</b> a card-shaped outline drawn around the grid, with a coffee cup.' },
    ink_ticket: { uv: true, html: '<b>Invisible ink on the back of the ticket:</b> "P4, 9pm"' },
    book_msg: function () { return '<b>Book code cracked:</b> ' + BOOK_ANSWER.join(' ').toUpperCase(); },
    stencil_up: '<b>Card over the word search:</b> ' + GRID.halves.up,
    stencil_down: '<b>Card upside down:</b> ' + GRID.halves.down,
    t2: '<b>Second text from ' + SNAKE + ':</b> buyer at Pier 4, 9pm. Password <b>' + FINAL.cipher + '</b>: "decode it with the usual key".',
    tag: '<b>Keyring tag:</b> a bone-shaped dog tag that says <b>' + FINAL.key + '</b>.',
    disk_back: '<b>Back of the brass disk:</b> 1. Turn the key letter to the arrow. 2. Find the code letter on the inner ring. 3. The real letter is on the outer ring beside it.'
  };

  // ---------- Content: hints (each set gets more specific) ----------
  const HINTS = {
    book: [
      'The courier\'s phone has a text full of numbers in groups of three. What in the case has numbered pages?',
      'The numbers point to words in the paperback. The pen in the case has a UV torch in its cap: switch it on and look inside the book\'s front cover.',
      'Each group is page . line . word: 3.5.9 means page 3, line 5, word 9 (count lines from the top of the page). Open the book and tap each word to drop it into your notepad. The first word is COFFEE.'
    ],
    stencil: [
      'The book code says COFFEE CARD OVER PUZZLE. Is there a coffee card in the case? And a puzzle?',
      'The holes in the coffee card aren\'t stamps. Keep the card in your hand, open the newspaper\'s puzzle page and lay the card over the word search.',
      'With the card on the word search, read the letters showing through the holes from left to right, top to bottom. Then turn the card upside down and read again.'
    ],
    key: [
      'The stencil says the key is the dog\'s name. Does the courier have a dog? Look at his phone\'s lock screen and the receipt in the lid.',
      'The dog\'s name is written on something he carries every day. Have a look at his keys.',
      'The bone-shaped tag on the keyring says ' + FINAL.key + '. Open the brass disk and type ' + FINAL.key + ' into the Key box.'
    ],
    text2: [
      'The courier\'s phone just buzzed. Has anyone read the new message?',
      'Look at the phone in your hands and tap the new message notification. The scrambled password will be copied onto the brass disk\'s worksheet.'
    ],
    disk: [
      'Open the brass disk and turn it over: the instructions are engraved on the back. Work on one letter at a time.',
      'For each letter: turn the inner ring until that letter\'s key letter is under the arrow. Then find the code letter on the inner ring: the real letter is on the outer ring right beside it. (Tap a letter on the inner ring to light up its partner.)',
      'First letter: turn the inner ring until ' + FINAL.key[0] + ' is under the arrow, then find ' + FINAL.cipher[0] + ' on the inner ring: the outer letter beside it is ' + WORD[0] + '. Next, put ' + FINAL.key[1] + ' under the arrow and look for ' + FINAL.cipher[1] + ', and so on.'
    ]
  };

  // ---------- The codes, in order ----------
  const STEPS = [
    {
      id: 'book', name: 'The book code', gadget: 'book',
      hintSet: function () { return 'book'; },
      isDone: function (s) { return !!s.bookSolved; },
      lesson: { title: 'The book was the key', text: 'Anyone with the same book could read every message, so the book is the key, and it has to stay secret. This courier carried the key in the same bag as the messages. That\'s like emailing a locked file with its password in the same email: always send the password a different way, like a text or a phone call.' },
      onDone: function () { say('book_done'); later(function () { say('book_done2'); }, 1500); }
    },
    {
      id: 'stencil', name: 'The coffee card stencil', gadget: 'stencil',
      hintSet: function () { return 'stencil'; },
      isDone: function (s) { return !!(s.stencil.seenUp && s.stencil.seenDown); },
      lesson: { title: 'Hiding isn\'t locking', text: 'To anyone else this was just a word search. But hidden isn\'t the same as protected: once someone knows the trick, the secret is wide open. A file in a folder called "Old stuff", or passwords in a spreadsheet called "Recipes", fools nobody who looks properly. Real encryption scrambles information so it\'s useless without the key.' },
      onDone: function () { say('stencil_done'); later(function () { deliverText('t2'); }, 2200); }
    },
    {
      id: 'disk', name: 'The keyword cipher disk', gadget: 'disk', final: true,
      hintSet: function (s) { if (s.texts.includes('t2') && !s.read.t2) return 'text2'; return keyIsRight(s) ? 'disk' : 'key'; },
      isDone: function (s) { return !!s.diskSolved; },
      lesson: { title: 'Strong keys and weak keys', text: 'A single shift has only 26 possible keys, so a laptop can try them all in a blink. A keyword moves every letter a different amount, and real encryption uses keys so long that no computer could ever try them all. So criminals go after the key instead. This crew picked their dog\'s name.' }
    }
  ];

  // ---------- State ----------
  function freshState() {
    return {
      version: STATE_VERSION,
      step: 0, done: {}, lesson: null,
      seen: {}, flipped: {}, focus: null,
      clues: [], msgs: [],
      uvFound: false, uvOn: false, ink: {},
      phoneTaken: false, phoneView: 'lock', texts: ['t1'], read: {},
      cardHeld: false,
      bench: null, benches: [],
      page: 0, slots: BOOK.code.map(function () { return ''; }), activeSlot: 0, bookSolved: false,
      stencil: { placed: false, rot: 0, flip: false, seenUp: false, seenDown: false },
      disk: { angle: 0, key: '', out: FINAL.cipher.split('').map(function () { return ''; }), spot: '' },
      diskSolved: false, bruteShown: false,
      hints: {}, wrongs: 0, hintsUsed: 0, warned: {},
      completed: false, completedAt: 0
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s && s.version === STATE_VERSION) {
        const f = freshState();
        const merged = Object.assign(f, s);
        merged.stencil = Object.assign(freshState().stencil, s.stencil || {});
        merged.disk = Object.assign(freshState().disk, s.disk || {});
        return merged;
      }
    } catch (_) {}
    return freshState();
  }
  function save() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) {} }

  let state = loadState();

  function vaultSaysComplete() {
    try { return !!window.vault?.isRoomComplete?.(ROOM); } catch (_) { return false; }
  }
  // Solved on another device (or local room state lost): show the finished room.
  function adoptSolved() {
    state.completed = true;
    state.step = STEPS.length;
    STEPS.forEach(function (s) { state.done[s.id] = true; });
    state.bookSolved = true;
    state.stencil.seenUp = true; state.stencil.seenDown = true;
    state.diskSolved = true;
    if (!state.texts.includes('t2')) state.texts.push('t2');
    state.read = { t1: true, t2: true };
    state.slots = BOOK_ANSWER.slice();
    state.disk.key = FINAL.key;
    state.disk.out = WORD.split('');
    state.lesson = null;
    if (!state.msgs.includes('solved')) state.msgs = ['intro_kemi', 'solved', 'solved2', 'solved3'];
    save();
  }
  if (!state.completed && vaultSaysComplete()) adoptSolved();

  function keyIsRight(s) { return lettersOnly(s.disk.key) === FINAL.key; }

  // ---------- DOM refs ----------
  const els = {
    room: $('#ccRoom'),
    feed: $('#ccFeed'),
    scene: $('#ccScene'),
    closeup: $('#ccCloseup'),
    hands: $('#ccHands'),
    phone: $('#ccPhone'),
    bench: $('#ccBench'),
    benchTitle: $('#ccBenchTitle'),
    tabs: $('#ccTabs'),
    lesson: $('#ccLesson'),
    benchBody: $('#ccBenchBody'),
    pill: $('#ccPill'),
    pillTitle: $('#ccStageTitle'),
    hintBtn: $('#ccHintBtn'),
    hintText: $('#ccHintText'),
    uvBtn: $('#ccUvBtn'),
    codes: $('#ccCodes'),
    codesCount: $('#ccCodesCount'),
    clues: $('#ccClues'),
    callout: $('#cryptoVaultValue'),
    complete: $('#cryptoComplete')
  };

  // ---------- Helpers ----------
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(function () { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }

  function h(tag, attrs, html) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    if (html != null) el.innerHTML = html;
    return el;
  }
  function button(cls, label, onClick) {
    const b = h('button', { class: cls, type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function spend(amount, reason) { try { points?.spend?.(amount, reason); } catch (_) {} }
  const isNarrow = () => !!(window.matchMedia && window.matchMedia('(max-width: 700px)').matches);
  const isStacked = () => !!(window.matchMedia && window.matchMedia('(max-width: 960px)').matches);
  function scrollTo(el, block) { try { el.scrollIntoView({ behavior: 'smooth', block: block || 'start' }); } catch (_) {} }
  let svgUid = 0;

  // ---------- Progress ----------
  function computePct() {
    let pct = 0;
    if (Object.keys(state.seen).length) pct = 5;
    if (state.read.t1) pct = 10;
    if (state.ink.book) pct = 15;
    if (state.done.book) pct = 35;
    if (state.done.book && state.stencil.seenUp) pct = 45;
    if (state.done.stencil) pct = 60;
    if (state.read.t2) pct = 65;
    if (state.done.stencil && keyIsRight(state)) pct = 75;
    return Math.min(pct, 95);
  }
  function setProgress() {
    if (state.completed) return;
    const pct = computePct();
    if (!pct) return;
    try {
      const cur = window.utils?.getProgressPercent?.(ROOM) || 0;
      if (pct <= cur) return;
      window.utils?.setProgressPercent?.(ROOM, pct);
    } catch (_) {}
  }

  // ---------- Radio feed ----------
  function msgText(m) { return typeof m.text === 'function' ? m.text() : m.text; }
  function renderFeed(newId) {
    els.feed.innerHTML = '';
    state.msgs.forEach(function (id, i) {
      const m = MSGS[id];
      if (!m) return;
      const isNew = id === newId && i === state.msgs.length - 1;
      const el = h('div', { class: 'cc-msg cc-msg--' + m.who + (m.tone ? ' is-' + m.tone : '') + (isNew ? ' is-new' : '') });
      el.appendChild(h('span', { class: 'cc-who cc-who--' + m.who, text: WHO[m.who] }));
      el.appendChild(h('span', null, msgText(m)));
      els.feed.appendChild(el);
    });
    els.feed.scrollTop = els.feed.scrollHeight;
  }
  const REPEATABLE = { wrong_book: true, wrong_disk: true };
  function say(id) {
    const m = MSGS[id];
    if (!m) return;
    if (!REPEATABLE[id] && state.msgs.includes(id)) return;
    state.msgs.push(id);
    if (state.msgs.length > 60) state.msgs = state.msgs.slice(-60);
    save();
    renderFeed(id);
    announce(WHO[m.who] + ': ' + h('div', null, msgText(m)).textContent);
  }

  // ---------- Notebook + codes cracked ----------
  function clueHtml(id) {
    const c = CLUES[id];
    if (!c) return '';
    if (typeof c === 'function') return c();
    if (typeof c === 'object') return c.html;
    return c;
  }
  function addClue(id) {
    if (!CLUES[id] || state.clues.includes(id)) return;
    state.clues.push(id);
    save();
    renderClues();
  }
  function renderClues() {
    els.clues.innerHTML = '';
    if (!state.clues.length) {
      els.clues.appendChild(h('li', { style: 'background:none;border:0;padding:0;color:var(--muted)' }, 'Nothing yet. Look at things in the briefcase: anything useful gets written down here.'));
      return;
    }
    state.clues.forEach(function (id) {
      const c = CLUES[id];
      els.clues.appendChild(h('li', { class: c && c.uv ? 'is-uv' : '' }, clueHtml(id)));
    });
  }
  function renderCodes() {
    els.codes.innerHTML = '';
    let n = 0;
    STEPS.forEach(function (st, i) {
      if (state.done[st.id]) {
        n++;
        const t = h('div', { class: 'cc-codetile is-done' });
        t.appendChild(h('span', { class: 'n', 'aria-hidden': 'true', text: '✓' }));
        t.appendChild(h('span', null, '<b>' + st.name + '</b>Lesson: ' + st.lesson.title));
        els.codes.appendChild(t);
      } else if (i === state.step && !state.completed) {
        const t = h('div', { class: 'cc-codetile' });
        t.appendChild(h('span', { class: 'n', 'aria-hidden': 'true', text: '?' }));
        t.appendChild(h('span', null, '<b>Code ' + (i + 1) + '</b>Not cracked yet.'));
        els.codes.appendChild(t);
      }
    });
    els.codesCount.textContent = n ? n + ' cracked' : 'none yet';
  }

  // ---------- Hints + chrome ----------
  function currentHintSet() {
    if (state.completed) return null;
    const st = STEPS[state.step];
    return st ? st.hintSet(state) : null;
  }
  function renderHint() {
    const set = currentHintSet();
    if (!set || !HINTS[set]) { els.hintBtn.hidden = true; els.hintText.hidden = true; return; }
    const list = HINTS[set];
    const shown = Math.min(state.hints[set] || 0, list.length);
    els.hintBtn.hidden = false;
    if (shown) {
      els.hintText.innerHTML = '';
      list.slice(0, shown).forEach(function (t, i) { els.hintText.appendChild(h('div', { text: 'Hint ' + (i + 1) + ': ' + t })); });
      els.hintText.hidden = false;
    } else {
      els.hintText.hidden = true;
    }
    if (shown >= list.length) {
      els.hintBtn.disabled = true;
      els.hintBtn.textContent = 'No more hints for this code';
    } else {
      els.hintBtn.disabled = false;
      els.hintBtn.textContent = 'Hint ' + (shown + 1) + ' of ' + list.length + ' (-' + COST.hint + ' pts)';
    }
  }
  els.hintBtn.addEventListener('click', function () {
    const set = currentHintSet();
    if (!set || !HINTS[set]) return;
    const shown = state.hints[set] || 0;
    if (shown >= HINTS[set].length) return;
    state.hints[set] = shown + 1;
    state.hintsUsed += 1;
    spend(COST.hint, 'Encryption room hint');
    save();
    renderHint();
    announce('Hint: ' + HINTS[set][shown]);
  });

  function renderChrome() {
    els.pill.classList.toggle('is-done', !!state.completed);
    els.pillTitle.textContent = state.completed ? 'Case closed' : 'Code ' + (state.step + 1);
    els.uvBtn.hidden = !state.uvFound;
    els.uvBtn.setAttribute('aria-pressed', state.uvOn ? 'true' : 'false');
    els.uvBtn.textContent = state.uvOn ? 'UV torch: on' : 'UV torch: off';
    document.body.classList.toggle('cc-uv-on', !!state.uvOn);
    renderHint();
  }

  // ---------- Step engine ----------
  function advance() {
    let moved = false;
    while (state.step < STEPS.length && STEPS[state.step].isDone(state)) {
      const st = STEPS[state.step];
      state.done[st.id] = true;
      state.step += 1;
      moved = true;
      if (st.final) { solveRoom(); return; }
      state.lesson = st.id;
      save();
      if (st.onDone) st.onDone();
    }
    if (moved) {
      save();
      setProgress();
      renderAll();
      announce('Code cracked.');
    }
  }

  function deliverText(id) {
    if (!TEXTS[id] || state.texts.includes(id)) return;
    state.texts.push(id);
    state.phoneView = 'lock';
    save();
    if (id === 't2') say('text2');
    renderHotspots();
    renderPhone(true);
    renderHint();
  }

  // =====================================================================
  //  UV TORCH + INVISIBLE INK
  // =====================================================================
  function setUv(on) {
    state.uvOn = !!on;
    save();
    renderChrome();
    announce(state.uvOn ? 'UV torch on. Move over things up close to reveal invisible ink.' : 'UV torch off.');
  }
  els.uvBtn.addEventListener('click', function () { setUv(!state.uvOn); });

  function inkEl(id, html, cls) {
    return h('div', { class: 'cc-ink' + (cls ? ' ' + cls : '') + (state.ink[id] ? ' is-found' : ''), 'data-ink': id, 'aria-hidden': 'true' }, html);
  }
  function inkVisibleNow(ink) {
    const face = ink.closest('.cc-face');
    if (!face) return true;
    const flipped = !!face.closest('.cc-flip.is-flipped');
    return face.classList.contains('cc-face--back') === flipped;
  }
  function inkFound(id, el) {
    if (el) el.classList.add('is-found');
    if (state.ink[id]) return;
    state.ink[id] = true;
    save();
    addClue('ink_' + id);
    if (MSGS['ink_' + id]) say('ink_' + id);
    setProgress();
    renderHint();
    announce('Invisible ink revealed.');
  }
  function onUvPointer(e) {
    if (!state.uvOn || !e.target || !e.target.closest) return;
    const zone = e.target.closest('.cc-uvzone');
    if (!zone) return;
    if (zone === els.scene) {
      const r = zone.getBoundingClientRect();
      zone.style.setProperty('--uvx', (e.clientX - r.left) + 'px');
      zone.style.setProperty('--uvy', (e.clientY - r.top) + 'px');
    }
    $$('.cc-ink', zone).forEach(function (ink) {
      const r = ink.getBoundingClientRect();
      ink.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      ink.style.setProperty('--my', (e.clientY - r.top) + 'px');
      const pad = 18;
      const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
      if (inside && r.width > 0 && inkVisibleNow(ink)) inkFound(ink.dataset.ink, ink);
    });
  }
  document.addEventListener('pointermove', onUvPointer, { passive: true });
  document.addEventListener('pointerdown', onUvPointer, { passive: true });

  // Keyboard / touch friendly: sweep the torch over a whole area.
  function sweepButton(zoneGetter, label) {
    const b = button('btn ghost sm cc-sweep cc-uvbtn', label || 'Sweep the UV torch over it', function () {
      const zone = zoneGetter();
      if (!zone) return;
      let found = 0;
      $$('.cc-ink', zone).forEach(function (ink) {
        if (!inkVisibleNow(ink)) return;
        found++;
        inkFound(ink.dataset.ink, ink);
      });
      if (!found) announce('The torch shows nothing hidden here.');
      const fb = zone.querySelector('.cc-sweepfb');
      if (fb) fb.textContent = found ? '' : 'Nothing glows here.';
    });
    return b;
  }

  // =====================================================================
  //  THE BRIEFCASE (scene + close-ups)
  // =====================================================================
  function renderHotspots() {
    const unread = state.texts.some(function (t) { return !state.read[t]; });
    $$('.cc-hs').forEach(function (b) {
      const item = b.dataset.item;
      b.classList.toggle('is-seen', !!state.seen[item]);
      b.classList.toggle('is-active', state.focus === item);
      if (item === 'phone') {
        const buzzing = unread && !state.completed;
        b.classList.toggle('is-buzzing', buzzing);
        b.classList.toggle('is-held', !!state.phoneTaken);
        b.setAttribute('aria-label', 'Burner phone' + (buzzing ? ', buzzing' : '') + (state.phoneTaken ? ' (in your hands)' : ''));
      }
      if (item === 'card') b.classList.toggle('is-held', !!state.cardHeld);
    });
    const light = $('.cc-penlight');
    if (light) light.setAttribute('opacity', state.uvFound ? '.95' : '0');
  }

  $$('.cc-hs').forEach(function (btn) {
    btn.addEventListener('click', function () { inspect(btn.dataset.item, true); });
  });

  function inspect(item, userAction) {
    state.focus = item;
    state.seen[item] = true;
    save();
    renderHotspots();
    renderCloseup();
    setProgress();
    if (userAction) {
      try { els.closeup.focus({ preventScroll: true }); } catch (_) {}
      if (isStacked()) scrollTo(els.closeup, 'start');
    }
  }

  function shell(eyebrow, title) {
    els.closeup.innerHTML = '';
    els.closeup.appendChild(h('p', { class: 'cc-eyebrow' }, eyebrow));
    els.closeup.appendChild(h('h3', null, title));
    return els.closeup;
  }
  function flipProp(item, front, back, onFlip) {
    const wrap = h('div', { class: 'cc-flip' + (state.flipped[item] ? ' is-flipped' : '') });
    const inner = h('div', { class: 'cc-flip__inner' });
    const f = h('div', { class: 'cc-face' }); f.appendChild(front);
    const b = h('div', { class: 'cc-face cc-face--back' }); b.appendChild(back);
    f.setAttribute('aria-hidden', state.flipped[item] ? 'true' : 'false');
    b.setAttribute('aria-hidden', state.flipped[item] ? 'false' : 'true');
    inner.appendChild(f); inner.appendChild(b); wrap.appendChild(inner);
    const btn = button('btn ghost sm', 'Turn it over', function () {
      state.flipped[item] = !state.flipped[item];
      save();
      wrap.classList.toggle('is-flipped', !!state.flipped[item]);
      f.setAttribute('aria-hidden', state.flipped[item] ? 'true' : 'false');
      b.setAttribute('aria-hidden', state.flipped[item] ? 'false' : 'true');
      announce(state.flipped[item] ? 'Turned over. Now showing the back.' : 'Turned back to the front.');
      if (onFlip) onFlip(!!state.flipped[item]);
    });
    return { wrap: wrap, btn: btn };
  }
  function addSweep(c) {
    if (!c.querySelector('.cc-ink')) return;
    const row = h('div', { class: 'cc-actions' });
    row.appendChild(sweepButton(function () { return els.closeup; }));
    c.appendChild(row);
    c.appendChild(h('p', { class: 'cc-feedback is-info cc-sweepfb', role: 'status' }));
  }

  const CLOSEUPS = {
    paper: function () {
      const c = shell('In the lid', 'A folded newspaper');
      c.appendChild(h('div', { class: 'cc-paper' },
        '<div class="cc-news__mast">THE HARBOUR HERALD</div><div class="cc-news__head">Pier 4 redevelopment delayed again</div>' +
        '<div class="cc-news__lines" aria-hidden="true"></div><div style="font-size:.8rem;font-weight:700">PUZZLES &middot; Word search: at the coast</div>'));
      c.appendChild(h('p', null, 'It\'s folded open at the puzzles page. Nobody has started the word search.'));
      c.appendChild(button('btn primary', 'Open the puzzle page', function () { openBench('stencil'); }));
      addClue('paper');
    },
    ticket: function () {
      const c = shell('Tucked in the lid pocket', 'A train ticket');
      const front = h('div', { class: 'cc-ticket' }, '<b>CENTRAL &rarr; HARBOUR ROAD</b><br>SINGLE &middot; ADULT &middot; OFF-PEAK<br>Valid today only<br>$4.80');
      const back = h('div', { class: 'cc-ticket' }, 'Keep your ticket until the end of your journey.<br>Not valid after midnight.');
      back.appendChild(inkEl('ticket', 'P4, 9pm', '') );
      back.lastChild.style.cssText = 'font-size:1.4rem;margin-top:.4rem;transform:rotate(-4deg)';
      const fp = flipProp('ticket', front, back);
      c.appendChild(fp.wrap);
      c.appendChild(h('p', null, 'A one-way ticket to Harbour Road. He wasn\'t planning to come back this way.'));
      const row = h('div', { class: 'cc-actions' }); row.appendChild(fp.btn); c.appendChild(row);
      addSweep(c);
    },
    receipt: function () {
      const c = shell('Tucked in the lid pocket', 'A crumpled receipt');
      c.appendChild(h('div', { class: 'cc-receipt' },
        '<div style="text-align:center;font-weight:700">PAWS &amp; CLAWS<br>PET SUPPLIES</div><div style="text-align:center">14 Station St</div><br>' +
        '<div class="r"><span>Chew toy (bone)</span><span>6.50</span></div><div class="r"><span>Dog shampoo</span><span>12.00</span></div>' +
        '<div class="r"><span>Tennis balls x3</span><span>5.00</span></div><div class="r" style="font-weight:700;margin-top:.3rem"><span>TOTAL</span><span>23.50</span></div><br>' +
        '<div style="text-align:center">Thanks! See you and<br>your pup next time!</div>'));
      c.appendChild(h('p', null, 'A receipt from a pet shop, dated last week.'));
      addClue('receipt');
    },
    book: function () {
      const c = shell('In the case', 'A paperback novel');
      c.appendChild(h('div', { class: 'cc-cover' }, '<div class="cc-cover__t">THE LIGHTHOUSE KEEPER</div>' + LIGHTHOUSE_SVG + '<div class="cc-cover__a">' + BOOK.author + '</div>'));
      c.appendChild(h('p', null, 'A slim, well-thumbed paperback. The spine is cracked in a few places, as if it gets opened a lot.'));
      c.appendChild(button('btn primary', 'Open the book', function () { openBench('book'); }));
    },
    phone: function () {
      const c = shell('In the case', 'A cheap burner phone');
      c.appendChild(h('p', null, 'A pay-as-you-go phone with no name on it. Criminals buy "burner" phones like this for cash and throw them away after a job.'));
      if (state.phoneTaken) {
        c.appendChild(h('p', null, '<strong>The phone is in your hands.</strong>' + (isStacked() ? ' It\'s shown below.' : ' It\'s shown next to the briefcase.')));
        return;
      }
      c.appendChild(button('btn primary', 'Pick up the phone', function () {
        state.phoneTaken = true;
        state.phoneView = 'lock';
        save();
        renderPhone();
        renderHotspots();
        renderCloseup();
        announce('You picked up the courier\'s phone.');
        if (isStacked()) scrollTo(els.hands, 'center');
      }));
    },
    card: function () {
      const c = shell('In the case', 'A coffee loyalty card');
      const front = h('div', { class: 'cc-cardprop' }, cardSvg(false));
      const back = h('div', { class: 'cc-cardprop' }, cardSvg(true, true));
      const fp = flipProp('card', front, back);
      c.appendChild(fp.wrap);
      c.appendChild(h('p', null, 'From a coffee shop: buy 9 coffees, get the 10th free. Someone has punched 8 holes in it&hellip; but not in the stamp boxes.'));
      const row = h('div', { class: 'cc-actions' });
      row.appendChild(fp.btn);
      if (!state.cardHeld) {
        row.appendChild(button('btn primary', 'Keep the card in your hand', function () {
          state.cardHeld = true;
          save();
          renderHotspots();
          renderCloseup();
          if (state.bench === 'stencil') renderBench();
          announce('The coffee card is in your hand. You can use it on the workbench.');
        }));
      }
      c.appendChild(row);
      if (state.cardHeld) c.appendChild(h('p', { class: 'cc-feedback is-good' }, 'The card is in your hand. You can lay it over things on the workbench.'));
      addClue('card');
    },
    disk: function () {
      const c = shell('In the case', 'A brass disk');
      const front = h('div', { class: 'cc-engrave', style: 'padding:0;overflow:hidden' }, diskSvg({ small: true }));
      const back = h('div', { class: 'cc-engrave' }, 'TO READ A MESSAGE<br><br>1. Turn the KEY letter to the arrow<br>2. Find the CODE letter on the inner ring<br>3. The real letter is on the outer ring beside it');
      const fp = flipProp('disk', front, back, function (flipped) { if (flipped) addClue('disk_back'); });
      if (state.flipped.disk) addClue('disk_back');
      c.appendChild(fp.wrap);
      c.appendChild(h('p', null, 'A heavy brass disk with two rings of letters, one inside the other. The inner ring turns. Something is engraved on the back.'));
      const row = h('div', { class: 'cc-actions' });
      row.appendChild(fp.btn);
      row.appendChild(button('btn primary', 'Use the disk', function () { openBench('disk'); }));
      c.appendChild(row);
    },
    pen: function () {
      const c = shell('In the case', 'A chunky black pen');
      if (!state.uvFound) {
        c.appendChild(h('p', null, 'Heavier than it looks. There\'s a tiny button on the end of the cap.'));
        c.appendChild(button('btn primary', 'Press the button', function () {
          state.uvFound = true;
          save();
          addClue('pen');
          renderHotspots();
          setUv(true);
          renderCloseup();
          say('pen');
        }));
        return;
      }
      c.appendChild(h('p', null, 'A purple light glows from the cap: it\'s a <strong>UV torch</strong>. Spies use pens like this to write in invisible ink that only shows up under UV light.'));
      c.appendChild(h('p', null, 'With the torch on, look at things up close (and inside them) and move your pointer over them. On a phone or with a keyboard, use the "Sweep the UV torch" buttons.'));
      c.appendChild(button('btn ghost cc-uvbtn', state.uvOn ? 'Switch the UV torch off' : 'Switch the UV torch on', function () { setUv(!state.uvOn); renderCloseup(); }));
    },
    keys: function () {
      const c = shell('In the case', 'A keyring');
      const front = h('div', { class: 'cc-tag' }, '<div><div aria-hidden="true">&#128062;</div><div class="cc-tag__name">' + FINAL.key + '</div></div>');
      const back = h('div', { class: 'cc-tag' }, 'If I\'m lost, please call my human: 0400 555 017');
      const fp = flipProp('keys', front, back);
      c.appendChild(fp.wrap);
      c.appendChild(h('p', null, 'Two door keys and a bone-shaped dog tag.'));
      const row = h('div', { class: 'cc-actions' }); row.appendChild(fp.btn); c.appendChild(row);
      addClue('tag');
      if (state.texts.includes('t2') && !state.completed) say('dog');
    },
    mints: function () {
      const c = shell('In the case', 'A tin of mints');
      c.appendChild(h('p', null, 'Extra strong mints. Three left, and nothing hidden under them. You checked twice.'));
    },
    glasses: function () {
      const c = shell('In the case', 'Sunglasses');
      c.appendChild(h('p', null, 'Cheap mirrored sunglasses, in the middle of winter. Not exactly a master of disguise.'));
    }
  };

  function renderCloseup() {
    const item = state.focus;
    if (!item || !CLOSEUPS[item]) {
      els.closeup.innerHTML = '<p class="cc-empty">Nothing picked up yet. Click something in the briefcase to look at it up close.</p>';
      return;
    }
    CLOSEUPS[item]();
  }

  // ---------- The coffee card (SVG, holes cut with a mask) ----------
  // backSide: show the back print. mirrored: true when the card is NOT mirrored by CSS
  // (close-up back face), so the holes are drawn mirrored and the print reads normally.
  function cardSvg(backSide, mirrored) {
    const id = 'ccCardMask' + (++svgUid);
    let holes = '';
    const hx = function (p) { return (mirrored ? (GRID.cols - 1 - p[1]) : p[1]) * 100 + 50; };
    GRID.holes.forEach(function (p) { holes += '<circle cx="' + hx(p) + '" cy="' + (p[0] * 100 + 50) + '" r="33" fill="#000"/>'; });
    let stamps = '';
    for (let i = 0; i < 10; i++) stamps += '<circle cx="' + (110 + i * 76) + '" cy="548" r="25" fill="none" stroke="#9c7a45" stroke-width="4" stroke-dasharray="7 6"/>';
    const front =
      '<text x="40" y="80" font-size="58" font-weight="900" fill="#5b3a1e" font-family="Georgia, serif">THE DAILY GRIND</text>' +
      '<path d="M720 40 h90 v60 a45 45 0 0 1 -90 0 z" fill="#5b3a1e"/><path d="M810 55 a22 22 0 0 1 0 40" stroke="#5b3a1e" stroke-width="12" fill="none"/>' +
      '<text x="40" y="150" font-size="34" font-weight="700" fill="#7a5530" font-family="Georgia, serif">LOYALTY CARD</text>' +
      '<text x="40" y="470" font-size="32" fill="#7a5530" font-family="Georgia, serif">Buy 9 coffees, get your 10th FREE!</text>' + stamps;
    const backTxt =
      '<text x="450" y="230" font-size="52" font-weight="900" fill="#5b3a1e" text-anchor="middle" font-family="Georgia, serif">THE DAILY GRIND</text>' +
      '<text x="450" y="300" font-size="32" fill="#7a5530" text-anchor="middle" font-family="Georgia, serif">12 Harbour Road &#183; Open 7am to 3pm</text>' +
      '<text x="450" y="360" font-size="28" fill="#7a5530" text-anchor="middle" font-family="Georgia, serif">Card no. 0047</text>';
    const print = backSide ? (mirrored ? '<g>' + backTxt + '</g>' : '<g transform="translate(900 0) scale(-1 1)">' + backTxt + '</g>') : front;
    return '<svg viewBox="0 0 900 600" role="img" aria-label="' + (backSide ? 'Back of the coffee card' : 'Coffee loyalty card with 8 punched holes') + '">' +
      '<defs><mask id="' + id + '"><rect width="900" height="600" fill="#fff"/>' + holes + '</mask></defs>' +
      '<g mask="url(#' + id + ')">' +
      '<rect x="3" y="3" width="894" height="594" rx="40" fill="#e3cfa6" stroke="#9c7a45" stroke-width="6"/>' +
      '<rect x="18" y="18" width="864" height="564" rx="30" fill="none" stroke="#c8ae7e" stroke-width="3"/>' + print +
      '</g>' + GRID.holes.map(function (p) { return '<circle cx="' + hx(p) + '" cy="' + (p[0] * 100 + 50) + '" r="33" fill="none" stroke="rgba(60,40,20,.55)" stroke-width="4"/>'; }).join('') +
      '</svg>';
  }

  // =====================================================================
  //  THE PHONE IN YOUR HANDS
  // =====================================================================
  function clockText() { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
  const DOG_SVG =
    '<svg viewBox="0 0 200 380" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    '<defs><linearGradient id="ccSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5f96"/><stop offset=".7" stop-color="#8fc0e8"/><stop offset="1" stop-color="#cfe6c0"/></linearGradient></defs>' +
    '<rect width="200" height="380" fill="url(#ccSky)"/><rect y="300" width="200" height="80" fill="#5f9a4a"/>' +
    '<ellipse cx="100" cy="330" rx="62" ry="40" fill="#8a6440"/>' +
    '<path d="M48 210 C30 240 34 290 52 300 L70 250 Z" fill="#6b4a2c"/><path d="M152 210 C170 240 166 290 148 300 L130 250 Z" fill="#6b4a2c"/>' +
    '<ellipse cx="100" cy="245" rx="58" ry="62" fill="#a37a52"/>' +
    '<path d="M60 205 l8 -14 l8 12 l8 -16 l8 14 l8 -16 l8 14 l8 -16 l8 14 l8 -12 l6 20 Z" fill="#a37a52"/>' +
    '<ellipse cx="100" cy="275" rx="32" ry="24" fill="#d9bc93"/>' +
    '<circle cx="78" cy="235" r="8" fill="#20140a"/><circle cx="122" cy="235" r="8" fill="#20140a"/><circle cx="80" cy="232" r="2.5" fill="#fff"/><circle cx="124" cy="232" r="2.5" fill="#fff"/>' +
    '<ellipse cx="100" cy="262" rx="11" ry="8" fill="#20140a"/><path d="M100 270 v10 M88 284 q12 10 24 0" stroke="#20140a" stroke-width="3" fill="none"/>' +
    '<path d="M94 286 q6 18 12 0 z" fill="#e8677a"/>' +
    '<rect x="62" y="300" width="76" height="12" rx="6" fill="#c62f3f"/><circle cx="100" cy="320" r="7" fill="#dfe5ec"/>' +
    '</svg>';

  let buzzTimer = null;
  function renderPhone(buzz) {
    const show = !!state.phoneTaken;
    els.hands.hidden = !show;
    if (!show) return;
    els.phone.innerHTML = '';
    const screen = h('div', { class: 'cc-phone__screen' });
    const unread = state.texts.filter(function (t) { return !state.read[t]; });
    if (state.phoneView === 'lock') screen.appendChild(h('div', { class: 'cc-wall' }, DOG_SVG));
    screen.appendChild(h('div', { class: 'cc-phone__status', 'aria-hidden': 'true' }, '<span>' + clockText() + '</span><span>4G &#9646;&#9646;&#9647;</span>'));
    const body = h('div', { class: 'cc-phone__body' });
    screen.appendChild(body);
    els.phone.appendChild(screen);

    if (state.phoneView === 'lock') {
      body.appendChild(h('div', { class: 'cc-lock__clock', text: clockText() }));
      body.appendChild(h('div', { class: 'cc-lock__date', text: 'Locked screen photo: a scruffy dog' }));
      if (unread.length) {
        const n = h('button', { class: 'cc-notif', type: 'button', 'aria-label': unread.length + ' new message' + (unread.length > 1 ? 's' : '') + ' from the snake contact. Open messages.' });
        n.innerHTML = '<div class="cc-notif__app">Messages &middot; now</div><div class="cc-notif__text">' + SNAKE + ' ' + unread.length + ' new message' + (unread.length > 1 ? 's' : '') + '</div>';
        n.addEventListener('click', openThread);
        body.appendChild(n);
      } else {
        const row = h('div', { style: 'margin-top:auto;display:flex;justify-content:center' });
        row.appendChild(button('cc-pbtn', 'Open messages', openThread));
        body.appendChild(row);
      }
      addClue('wallpaper');
    } else {
      const head = h('div', { class: 'cc-thread__head' });
      const back = button('cc-pbtn', '&lsaquo; Lock screen', function () { state.phoneView = 'lock'; save(); renderPhone(); });
      back.setAttribute('aria-label', 'Back to the lock screen');
      head.appendChild(back);
      head.appendChild(h('span', { class: 'cc-thread__who' }, '<b>' + SNAKE + '</b> <span>No name saved</span>'));
      body.appendChild(head);
      const newly = [];
      state.texts.forEach(function (id) {
        const t = TEXTS[id];
        if (!t) return;
        const b = h('div', { class: 'cc-bubble' }, t.html());
        if (id === 't2' && state.completed) {
          b.appendChild(h('div', { style: 'margin-top:.35rem' }, 'Decoded: <span class="cc-scramble is-solved" data-solve="1">' + WORD + '</span>'));
        }
        b.appendChild(h('span', { class: 'cc-bubble__time', text: t.time }));
        body.appendChild(b);
        if (!state.read[id]) { state.read[id] = true; newly.push(id); }
      });
      if (newly.length) {
        save();
        newly.forEach(function (id) {
          addClue(id);
          if (id === 't1') say('phone_t1');
          if (id === 't2') { say('phone_t2'); later(function () { say('phone_t2b'); }, 1800); }
        });
        renderHotspots();
        setProgress();
        renderHint();
        if (state.bench) renderBench();
      }
      body.scrollTop = body.scrollHeight;
    }
    if (buzz) {
      els.phone.classList.remove('is-buzzing');
      void els.phone.offsetWidth;
      els.phone.classList.add('is-buzzing');
      clearTimeout(buzzTimer);
      buzzTimer = setTimeout(function () { els.phone.classList.remove('is-buzzing'); }, 2300);
    }
  }
  function openThread() {
    state.phoneView = 'msgs';
    save();
    renderPhone();
    announce('Messages open.');
  }

  // =====================================================================
  //  THE WORKBENCH
  // =====================================================================
  const GADGETS = {
    book: { label: 'The paperback', render: renderBook },
    stencil: { label: 'Puzzle page', render: renderStencil },
    disk: { label: 'Brass disk', render: renderDisk }
  };
  function openBench(id) {
    if (!GADGETS[id]) return;
    if (!state.benches.includes(id)) state.benches.push(id);
    state.bench = id;
    save();
    renderBench();
    try { els.bench.focus({ preventScroll: true }); } catch (_) {}
    scrollTo(els.bench, 'start');
    announce(GADGETS[id].label + ' is open on the workbench.');
  }
  function renderBench() {
    stopBrute();
    if (!state.bench || !GADGETS[state.bench]) { els.bench.hidden = true; return; }
    els.bench.hidden = false;
    els.benchTitle.textContent = 'Workbench: ' + GADGETS[state.bench].label.toLowerCase();
    els.tabs.innerHTML = '';
    if (state.benches.length > 1) {
      state.benches.forEach(function (id) {
        const t = button('cc-tab', GADGETS[id].label, function () { state.bench = id; save(); renderBench(); });
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', id === state.bench ? 'true' : 'false');
        els.tabs.appendChild(t);
      });
    }
    renderLesson();
    els.benchBody.innerHTML = '';
    GADGETS[state.bench].render(els.benchBody);
  }
  function renderLesson() {
    els.lesson.innerHTML = '';
    const st = STEPS.find(function (s) { return s.id === state.lesson; });
    if (!st || state.completed) return;
    const box = h('div', { class: 'cc-lesson', tabindex: '-1', role: 'status' });
    box.appendChild(h('p', { class: 'cc-lesson__title', text: 'Code cracked! Lesson: ' + st.lesson.title }));
    box.appendChild(h('p', null, st.lesson.text));
    box.appendChild(button('btn primary sm', 'Got it', function () { state.lesson = null; save(); renderLesson(); }));
    els.lesson.appendChild(box);
  }

  // ---------- Gadget 1: the paperback + notepad ----------
  const book = { spreadEl: null, label: null, prev: null, next: null, slots: [], fb: null, bookEl: null };
  function leavesInView() {
    if (isNarrow()) return [state.page];
    const first = state.page - (state.page % 2);
    return [first, first + 1];
  }
  function leafLabel(i) {
    if (i === 0) return 'Inside cover';
    if (i === 1) return 'Title page';
    return 'Page ' + (i - 1);
  }
  function renderLeaf(i) {
    const page = h('div', { class: 'cc-page' });
    if (i === 0) {
      page.classList.add('cc-uvzone', 'cc-uvpaper');
      const inside = h('div', { class: 'cc-inside' });
      inside.appendChild(h('div', null, 'This book belongs to:<br>________________'));
      inside.appendChild(inkEl('book', 'page &middot; line &middot; word'));
      inside.appendChild(h('div', { style: 'font-size:.75rem' }, 'Gull Rock Press &middot; pocket edition &middot; $9.99'));
      page.appendChild(inside);
      return page;
    }
    if (i === 1) {
      page.appendChild(h('div', { class: 'cc-titlepage' }, '<b>THE LIGHTHOUSE KEEPER</b><span>a novel</span><i>' + BOOK.author + '</i><span style="font-size:.8rem">Gull Rock Press</span>'));
      return page;
    }
    const pn = i - 1;
    BOOK.pages[pn - 1].forEach(function (line) {
      const row = h('div', { class: 'cc-line' });
      line.split(' ').forEach(function (w, wi) {
        if (wi) row.appendChild(document.createTextNode(' '));
        const span = h('span', { class: 'cc-w', text: w });
        span.dataset.word = w;
        if (state.slots.some(function (s) { return normWord(s) && normWord(s) === normWord(w); })) span.classList.add('is-picked');
        row.appendChild(span);
      });
      page.appendChild(row);
    });
    page.appendChild(h('div', { class: 'cc-pageno', text: String(pn) }));
    return page;
  }
  function drawSpread() {
    if (!book.spreadEl) return;
    book.spreadEl.innerHTML = '';
    leavesInView().forEach(function (i) { book.spreadEl.appendChild(renderLeaf(i)); });
    const v = leavesInView();
    book.label.textContent = v.map(leafLabel).join(' / ');
    book.prev.disabled = v[0] <= 0;
    book.next.disabled = v[v.length - 1] >= LEAVES - 1;
  }
  function turn(dir) {
    const stepBy = isNarrow() ? 1 : 2;
    const target = state.page - (isNarrow() ? 0 : state.page % 2) + dir * stepBy;
    if (target < 0 || target > LEAVES - 1) return;
    state.page = target;
    save();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && book.bookEl) {
      const leaf = h('div', { class: 'cc-leaf' + (dir < 0 ? ' is-prev' : ''), 'aria-hidden': 'true' });
      book.bookEl.appendChild(leaf);
      setTimeout(drawSpread, 230);
      setTimeout(function () { leaf.remove(); }, 520);
    } else {
      drawSpread();
    }
    announce(leavesInView().map(leafLabel).join(' and '));
  }

  function renderBook(body) {
    const wrap = h('div', { class: 'cc-bookwrap' });
    const col = h('div');
    const bookEl = h('div', { class: 'cc-book' });
    const spread = h('div', { class: 'cc-spread', role: 'group', 'aria-label': 'The open paperback. Tap a word to copy it into your notepad.' });
    spread.addEventListener('click', function (e) {
      const w = e.target.closest && e.target.closest('.cc-w');
      if (!w) return;
      pickWord(w.dataset.word, w);
    });
    bookEl.appendChild(spread);
    col.appendChild(bookEl);
    const nav = h('div', { class: 'cc-booknav' });
    const prev = button('btn ghost sm', '&larr; Previous', function () { turn(-1); });
    const label = h('span', { 'aria-live': 'polite' });
    const next = button('btn ghost sm', 'Next &rarr;', function () { turn(1); });
    nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
    nav.appendChild(sweepButton(function () { return bookEl.querySelector('.cc-page.cc-uvzone') || bookEl; }, 'Sweep the UV torch over the page'));
    col.appendChild(nav);
    col.appendChild(h('p', { class: 'cc-feedback is-info cc-sweepfb', role: 'status', style: 'text-align:center' }));
    const copied = h('p', { class: 'cc-feedback is-good', role: 'status', style: 'text-align:center' });
    col.appendChild(copied);
    wrap.appendChild(col);
    Object.assign(book, { spreadEl: spread, label: label, prev: prev, next: next, bookEl: bookEl, copied: copied });
    drawSpread();
    // The sweep feedback lives next to the nav, not inside the page zone.
    const sweepFb = col.querySelector('.cc-sweepfb');
    nav.querySelector('.cc-sweep').addEventListener('click', function () {
      const zone = bookEl.querySelector('.cc-page.cc-uvzone');
      sweepFb.textContent = zone ? '' : 'Nothing glows on these pages.';
    });

    // Notepad
    const pad = h('div', { class: 'cc-notepad' });
    pad.appendChild(h('h4', null, 'Your notepad'));
    if (!state.read.t1) {
      pad.appendChild(h('p', null, 'Nothing written here yet. If you find anything that needs looking up, it will be copied here.'));
      wrap.appendChild(pad);
      body.appendChild(wrap);
      return;
    }
    pad.appendChild(h('p', null, state.bookSolved ? 'Decoded!' : 'The numbers from the courier\'s phone. Tap a word in the book to copy it next to the selected number, or type it.'));
    book.slots = [];
    BOOK.code.forEach(function (c, i) {
      const row = h('div', { class: 'cc-slot' });
      const id = 'ccSlot' + i;
      row.appendChild(h('label', { for: id }, '<code>' + BOOK_CODES_TEXT[i] + '</code>'));
      const input = h('input', { id: id, type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'data-sanitize': 'off', maxlength: '24' });
      input.value = state.slots[i] || '';
      if (state.bookSolved) { input.disabled = true; row.classList.add('is-right'); }
      input.addEventListener('focus', function () { state.activeSlot = i; save(); markActiveSlot(); });
      input.addEventListener('input', function () {
        state.slots[i] = input.value.replace(/[^A-Za-z'’-]/g, '').slice(0, 24);
        if (input.value !== state.slots[i]) input.value = state.slots[i];
        save();
        refreshPicked();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkBook(); } });
      row.appendChild(input);
      pad.appendChild(row);
      book.slots.push(row);
    });
    if (state.bookSolved) {
      pad.appendChild(h('p', null, 'Message: <span class="cc-decoded">' + BOOK_ANSWER.join(' ').toUpperCase() + '</span>'));
    } else {
      pad.appendChild(button('btn primary sm', 'Read the message', checkBook));
      book.fb = h('p', { class: 'cc-feedback', role: 'status' });
      pad.appendChild(book.fb);
    }
    wrap.appendChild(pad);
    body.appendChild(wrap);
    markActiveSlot();
  }
  function markActiveSlot() {
    book.slots.forEach(function (row, i) { row.classList.toggle('is-active', i === state.activeSlot && !state.bookSolved); });
  }
  function refreshPicked() {
    if (!book.spreadEl) return;
    $$('.cc-w', book.spreadEl).forEach(function (sp) {
      const w = normWord(sp.dataset.word);
      sp.classList.toggle('is-picked', state.slots.some(function (s) { return normWord(s) && normWord(s) === w; }));
    });
  }
  function pickWord(raw, el) {
    if (state.bookSolved) return;
    if (!state.read.t1) {
      if (book.copied) book.copied.textContent = 'Your notepad is empty: there\'s nothing to look up yet.';
      announce('Nothing to look up yet.');
      return;
    }
    const word = String(raw || '').replace(/[^A-Za-z'’-]/g, '');
    let i = state.activeSlot;
    if (i == null || i < 0 || i >= state.slots.length) i = 0;
    state.slots[i] = word;
    // Move to the next empty slot, if any.
    const nextEmpty = state.slots.findIndex(function (s, j) { return j > i && !s; });
    const anyEmpty = state.slots.findIndex(function (s) { return !s; });
    state.activeSlot = nextEmpty >= 0 ? nextEmpty : (anyEmpty >= 0 ? anyEmpty : i);
    save();
    const input = $('#ccSlot' + i);
    if (input) input.value = word;
    markActiveSlot();
    refreshPicked();
    if (el) { el.classList.add('is-picked'); }
    if (book.copied) book.copied.textContent = 'Copied "' + word + '" next to ' + BOOK_CODES_TEXT[i] + ' in your notepad.';
    announce('Copied ' + word + ' next to ' + BOOK_CODES_TEXT[i]);
  }
  function checkBook() {
    if (state.bookSolved || !book.fb) return;
    const guesses = state.slots.map(normWord);
    if (guesses.some(function (g) { return !g; })) {
      book.fb.className = 'cc-feedback is-info';
      book.fb.textContent = 'Fill in a word for every group of numbers first.';
      return;
    }
    const right = guesses.filter(function (g, i) { return g === BOOK_ANSWER[i]; }).length;
    if (right === BOOK_ANSWER.length) {
      state.bookSolved = true;
      save();
      addClue('book_msg');
      advance();
      return;
    }
    spend(COST.wrong, 'Encryption room: book code wrong');
    state.wrongs += 1;
    save();
    book.fb.className = 'cc-feedback is-bad';
    book.fb.textContent = 'That doesn\'t make sense yet (-2 pts). ' + right + ' of ' + BOOK_ANSWER.length + ' words are right. ' +
      (state.ink.book ? 'Remember: page, then line, then word.' : 'How should those three numbers be read?');
    if (!state.warned.book) { state.warned.book = true; save(); say('wrong_book'); }
  }

  // ---------- Gadget 2: the puzzle page + coffee card stencil ----------
  const sten = { cells: [], card: null, gridwrap: null, traySlot: null, readout: null, btns: {} };
  function renderStencil(body) {
    const wrap = h('div', { class: 'cc-stencil' });
    const page = h('div', { class: 'cc-newspage cc-uvzone cc-uvpaper' });
    page.appendChild(h('h4', { class: '' }, 'Word search: at the coast'));
    page.appendChild(h('p', { class: '' }, 'Can you find all 8 seaside words? Answers in Saturday\'s Herald.'));
    const gw = h('div', { class: 'cc-gridwrap' });
    const grid = h('div', { class: 'cc-grid', role: 'img', 'aria-label': 'Word search grid, 9 letters across and 6 rows down' });
    sten.cells = [];
    GRID.letters.split('').forEach(function (ch) {
      const cell = h('div', { class: 'cc-cell', text: ch });
      grid.appendChild(cell);
      sten.cells.push(cell);
    });
    gw.appendChild(grid);
    const ink = inkEl('paper', '<span class="cc-cupink" aria-hidden="true">' + CUP_SVG + '</span>', 'cc-gridink');
    ink.style.borderColor = '#d9b8ff';
    gw.appendChild(ink);
    page.appendChild(gw);
    page.appendChild(h('div', { class: 'cc-wordlist' }, GRID.words.join(' &middot; ')));
    const pageCol = h('div');
    pageCol.appendChild(page);
    const prow = h('div', { class: 'cc-actions', style: 'justify-content:center;margin-top:.6rem' });
    const pfb = h('p', { class: 'cc-feedback is-info', role: 'status', style: 'text-align:center' });
    const sweep = sweepButton(function () { return page; }, 'Sweep the UV torch over the page');
    sweep.addEventListener('click', function () { pfb.textContent = page.querySelector('.cc-ink') ? '' : 'Nothing glows here.'; });
    prow.appendChild(sweep);
    pageCol.appendChild(prow);
    pageCol.appendChild(pfb);
    sten.gridwrap = gw;

    const tray = h('div', { class: 'cc-tray' });
    tray.appendChild(h('h4', null, 'In your hand'));
    const slot = h('div', { class: 'cc-tray__slot' });
    sten.traySlot = slot;
    tray.appendChild(slot);
    const ctl = h('div', { class: 'cc-actions', style: 'justify-content:center' });
    sten.btns.place = button('btn primary sm', 'Lay it on the puzzle', function () { placeCard(!state.stencil.placed); });
    sten.btns.rot = button('btn ghost sm', 'Turn it upside down', function () { orientCard(state.stencil.rot === 180 ? 0 : 180, state.stencil.flip); });
    sten.btns.flip = button('btn ghost sm', 'Turn it over', function () { orientCard(state.stencil.rot, !state.stencil.flip); });
    ctl.appendChild(sten.btns.place); ctl.appendChild(sten.btns.rot); ctl.appendChild(sten.btns.flip);
    tray.appendChild(ctl);
    sten.readout = h('div', { class: 'cc-readout', role: 'status', 'aria-live': 'polite' });

    if (state.cardHeld) {
      sten.card = h('div', { class: 'cc-card', role: 'img', 'aria-label': 'The coffee card. Drag it onto the word search, or use the buttons.' }, '');
      drawCardFace();
      attachCardDrag(sten.card);
      tray.appendChild(h('p', { style: 'font-size:.8rem;color:var(--muted);margin:0' }, 'Drag the card, or use the buttons.'));
    } else {
      sten.card = null;
      slot.textContent = 'Your hands are empty.';
      ctl.hidden = true;
    }
    wrap.appendChild(pageCol);
    const side = h('div');
    side.appendChild(tray);
    side.appendChild(sten.readout);
    wrap.appendChild(side);
    body.appendChild(wrap);
    syncCard(false);
  }
  function drawCardFace() {
    if (!sten.card) return;
    sten.card.innerHTML = cardSvg(!!state.stencil.flip);
  }
  function cardTransform() { return 'rotate(' + state.stencil.rot + 'deg) rotateY(' + (state.stencil.flip ? 180 : 0) + 'deg)'; }
  function syncCard(checkSeen) {
    if (!sten.card) { updateLit(); return; }
    const parent = state.stencil.placed ? sten.gridwrap : sten.traySlot;
    if (sten.card.parentNode !== parent) parent.appendChild(sten.card);
    sten.card.classList.toggle('is-placed', !!state.stencil.placed);
    sten.traySlot.classList.toggle('is-empty', !!state.stencil.placed);
    sten.card.style.transform = cardTransform();
    sten.btns.place.textContent = state.stencil.placed ? 'Pick the card back up' : 'Lay it on the puzzle';
    updateLit();
    if (checkSeen) later(checkStencilSeen, 650);
  }
  function updateLit() {
    const lit = state.stencil.placed && sten.card ? holeCells(state.stencil.rot, state.stencil.flip) : [];
    sten.cells.forEach(function (cell, i) { cell.classList.toggle('is-lit', lit.includes(i)); });
    if (!sten.readout) return;
    if (!lit.length) {
      sten.readout.className = 'cc-readout';
      sten.readout.innerHTML = state.stencil.seenUp || state.stencil.seenDown
        ? '<small>Seen so far: ' + [state.stencil.seenUp ? GRID.halves.up : '', state.stencil.seenDown ? GRID.halves.down : ''].filter(Boolean).join(' ') + '</small>'
        : '';
      return;
    }
    const txt = readThrough(state.stencil.rot, state.stencil.flip);
    const good = !state.stencil.flip;
    sten.readout.className = 'cc-readout' + (good ? ' is-good' : '');
    sten.readout.innerHTML = '<small>Letters showing through the holes (left to right, top to bottom)</small>' + txt.split('').join(' ');
  }
  function checkStencilSeen() {
    if (!state.stencil.placed || state.stencil.flip) return;
    let changed = false;
    if (state.stencil.rot === 0 && !state.stencil.seenUp) { state.stencil.seenUp = true; addClue('stencil_up'); changed = true; }
    if (state.stencil.rot === 180 && !state.stencil.seenDown) { state.stencil.seenDown = true; addClue('stencil_down'); changed = true; }
    if (!changed) return;
    save();
    setProgress();
    if (state.stencil.seenUp && !state.stencil.seenDown) say('stencil_half');
    if (state.stencil.seenDown && !state.stencil.seenUp) say('stencil_half2');
    if (state.step < STEPS.length && STEPS[state.step].id === 'stencil') advance();
  }
  function placeCard(on) {
    if (!sten.card) return;
    state.stencil.placed = !!on;
    save();
    syncCard(true);
    announce(on ? 'You lay the card over the word search. ' + readoutSpeech() : 'You pick the card back up.');
  }
  function orientCard(rot, flip) {
    if (!sten.card) return;
    const flipping = flip !== state.stencil.flip;
    state.stencil.rot = rot;
    state.stencil.flip = flip;
    save();
    sten.card.style.transform = cardTransform();
    if (flipping) setTimeout(drawCardFace, 260);
    updateLit();
    later(checkStencilSeen, 650);
    announce((flipping ? (flip ? 'Card turned over to its back.' : 'Card turned back to its front.') : 'Card turned ' + (rot === 180 ? 'upside down.' : 'the right way up.')) + (state.stencil.placed ? ' ' + readoutSpeech() : ''));
  }
  function readoutSpeech() {
    return 'Through the holes: ' + readThrough(state.stencil.rot, state.stencil.flip).split('').join(' ');
  }
  function attachCardDrag(card) {
    let drag = null;
    card.addEventListener('pointerdown', function (e) {
      if (state.stencil.placed) return;
      if (e.button != null && e.button !== 0) return;
      const r = card.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, x0: e.clientX, y0: e.clientY, moved: false };
      e.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    function overGrid(x, y) {
      const g = sten.gridwrap.getBoundingClientRect();
      return x > g.left && x < g.right && y > g.top && y < g.bottom;
    }
    function onMove(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        card.classList.add('is-dragging');
        card.style.width = drag.w + 'px';
        card.style.height = drag.h + 'px';
      }
      card.style.left = (e.clientX - drag.dx) + 'px';
      card.style.top = (e.clientY - drag.dy) + 'px';
      const cx = e.clientX - drag.dx + drag.w / 2, cy = e.clientY - drag.dy + drag.h / 2;
      sten.gridwrap.classList.toggle('cc-dropglow', overGrid(cx, cy));
    }
    function onUp(e) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!drag) return;
      const d = drag; drag = null;
      sten.gridwrap.classList.remove('cc-dropglow');
      if (!d.moved) return;
      card.classList.remove('is-dragging');
      card.style.left = card.style.top = card.style.width = card.style.height = '';
      const cx = e.clientX - d.dx + d.w / 2, cy = e.clientY - d.dy + d.h / 2;
      if (overGrid(cx, cy)) placeCard(true);
      else syncCard(false);
    }
  }

  // ---------- Gadget 3: the brass cipher disk + worksheet ----------
  const STEP_DEG = 360 / 26;
  const disk = { svg: null, ring: null, read: null, wrap: null, keyBoxes: [], outInputs: [], fb: null, hiIn: null, hiOut: null };
  const diskK = () => mod(Math.round(-state.disk.angle / STEP_DEG), 26);
  function polar(r, deg) { const a = deg * Math.PI / 180; return [200 + r * Math.sin(a), 200 - r * Math.cos(a)]; }
  function diskSvg(opts) {
    opts = opts || {};
    const uid = ++svgUid;
    let outer = '', inner = '', ticksO = '', ticksI = '', hits = '';
    for (let i = 0; i < 26; i++) {
      const deg = i * STEP_DEG;
      const p = polar(171, deg);
      outer += '<text class="cc-dl cc-dl--out" data-out="' + i + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" transform="rotate(' + deg.toFixed(2) + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')">' + String.fromCharCode(A + i) + '</text>';
      const q = polar(127, deg);
      inner += '<text class="cc-dl cc-dl--in" data-in="' + i + '" x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '" transform="rotate(' + deg.toFixed(2) + ' ' + q[0].toFixed(1) + ' ' + q[1].toFixed(1) + ')">' + String.fromCharCode(A + i) + '</text>';
      hits += '<circle class="cc-hit" data-letter="' + i + '" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="17"/>';
      const t1 = polar(150, deg + STEP_DEG / 2), t2 = polar(192, deg + STEP_DEG / 2);
      ticksO += '<line x1="' + t1[0].toFixed(1) + '" y1="' + t1[1].toFixed(1) + '" x2="' + t2[0].toFixed(1) + '" y2="' + t2[1].toFixed(1) + '"/>';
      const u1 = polar(106, deg + STEP_DEG / 2), u2 = polar(148, deg + STEP_DEG / 2);
      ticksI += '<line x1="' + u1[0].toFixed(1) + '" y1="' + u1[1].toFixed(1) + '" x2="' + u2[0].toFixed(1) + '" y2="' + u2[1].toFixed(1) + '"/>';
    }
    const w1 = polar(196, -STEP_DEG / 2), w2 = polar(196, STEP_DEG / 2), w3 = polar(104, STEP_DEG / 2), w4 = polar(104, -STEP_DEG / 2);
    const wedge = 'M' + w1.join(' ') + ' A196 196 0 0 1 ' + w2.join(' ') + ' L' + w3.join(' ') + ' A104 104 0 0 0 ' + w4.join(' ') + ' Z';
    const vb = opts.small ? '0 0 400 400' : '-10 -34 420 444';
    return '<svg viewBox="' + vb + '" ' + (opts.small ? 'aria-hidden="true"' : 'role="presentation"') + '>' +
      '<defs>' +
      '<radialGradient id="ccBrO' + uid + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f7dc84"/><stop offset=".6" stop-color="#c9971f"/><stop offset="1" stop-color="#7a5a0e"/></radialGradient>' +
      '<radialGradient id="ccBrI' + uid + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#9b7516"/><stop offset="1" stop-color="#4a3606"/></radialGradient>' +
      '<radialGradient id="ccBrH' + uid + '" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f3d36c"/><stop offset="1" stop-color="#8a6512"/></radialGradient>' +
      '</defs>' +
      '<circle cx="200" cy="200" r="194" fill="url(#ccBrO' + uid + ')" stroke="#4a3606" stroke-width="3"/>' +
      '<g stroke="#5f4509" stroke-width="1.5" opacity=".55">' + ticksO + '</g>' + outer +
      (opts.small ? '' : '<g class="cc-hi-out"></g>') +
      '<g class="' + (opts.small ? 'cc-disk__static' : 'cc-disk__inner') + '"' + (opts.small ? '' : ' tabindex="0" role="slider" aria-label="Inner ring of the brass disk. Use the arrow keys to turn it, or type a letter to turn that letter to the arrow." aria-valuemin="0" aria-valuemax="25"') + '>' +
      '<g class="cc-ringrot" style="transform: rotate(' + (opts.small ? 0 : state.disk.angle) + 'deg)">' +
      '<circle class="cc-ringhalo" cx="200" cy="200" r="149" fill="url(#ccBrI' + uid + ')" stroke="#2e2104" stroke-width="2"/>' +
      '<g stroke="#e6c35c" stroke-width="1" opacity=".35">' + ticksI + '</g>' +
      '<g class="cc-hi-in"></g>' + inner + hits +
      '<circle cx="200" cy="200" r="104" fill="url(#ccBrH' + uid + ')" stroke="#5f4509" stroke-width="2"/>' +
      '<g stroke="#8a6512" stroke-width="3" opacity=".7"><circle cx="200" cy="200" r="70" fill="none"/><circle cx="200" cy="200" r="40" fill="none"/>' +
      '<path d="M200 130 L200 160 M200 240 L200 270 M130 200 L160 200 M240 200 L270 200 M150 150 L171 171 M229 229 L250 250 M250 150 L229 171 M150 250 L171 229"/></g>' +
      '<circle cx="200" cy="200" r="12" fill="#5f4509"/>' +
      '</g></g>' +
      (opts.small ? '' : '<path d="' + wedge + '" fill="rgba(255,255,255,.12)" stroke="#ff6b6b" stroke-width="3" pointer-events="none"/>' +
        '<path d="M184 -30 L216 -30 L200 -6 Z" fill="#ff6b6b" stroke="#5a1010" stroke-width="2" pointer-events="none"/>') +
      '</svg>';
  }

  function renderDisk(body) {
    const wrap = h('div', { class: 'cc-diskwrap' });
    const left = h('div');
    const dwrap = h('div', { class: 'cc-disk' }, diskSvg());
    disk.wrap = dwrap;
    disk.svg = $('svg', dwrap);
    disk.ring = $('.cc-ringrot', dwrap);
    disk.slider = $('.cc-disk__inner', dwrap);
    left.appendChild(dwrap);
    const ctl = h('div', { class: 'cc-diskctl' });
    const l = button('btn ghost sm', '&#9664; Turn', function () { turnDisk(-1); });
    l.setAttribute('aria-label', 'Turn the inner ring back one letter');
    const r = button('btn ghost sm', 'Turn &#9654;', function () { turnDisk(1); });
    r.setAttribute('aria-label', 'Turn the inner ring forward one letter');
    const spot = h('label', { class: 'cc-spot' }, 'Light up inner letter:');
    const spotIn = h('input', { type: 'text', maxlength: '1', 'aria-label': 'Light up a letter on the inner ring', 'data-sanitize': 'off', autocomplete: 'off' });
    spotIn.value = state.disk.spot || '';
    spotIn.addEventListener('input', function () {
      const L = lettersOnly(spotIn.value).slice(-1);
      spotIn.value = L;
      setSpot(L);
    });
    spot.appendChild(spotIn);
    ctl.appendChild(l); ctl.appendChild(r); ctl.appendChild(spot);
    left.appendChild(ctl);
    disk.read = h('div', { class: 'cc-diskread', 'aria-live': 'polite' });
    left.appendChild(disk.read);
    wrap.appendChild(left);

    const right = h('div');
    right.appendChild(renderWorksheet());
    if (state.read.t2) right.appendChild(renderLaptop());
    wrap.appendChild(right);
    body.appendChild(wrap);
    attachDiskDrag();
    updateDisk();
  }

  function renderWorksheet() {
    const ws = h('div', { class: 'cc-ws' });
    ws.appendChild(h('h4', null, 'Worksheet'));
    disk.keyBoxes = []; disk.outInputs = []; disk.fb = null;
    if (!state.read.t2) {
      ws.appendChild(h('p', null, 'Nothing to decode yet. Any message for this disk will be copied here.'));
      return ws;
    }
    ws.appendChild(h('p', null, 'The password from the courier\'s phone. Each code letter has its own key letter underneath.'));
    const keyrow = h('div', { class: 'cc-keyrow' });
    keyrow.appendChild(h('label', { for: 'ccKeyIn' }, 'Key word:'));
    const keyIn = h('input', { id: 'ccKeyIn', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', maxlength: '12', 'data-sanitize': 'off' });
    keyIn.value = state.disk.key || '';
    if (state.diskSolved) keyIn.disabled = true;
    keyIn.addEventListener('input', function () {
      const before = keyIsRight(state);
      state.disk.key = lettersOnly(keyIn.value).slice(0, 12);
      keyIn.value = state.disk.key;
      save();
      drawKeyBoxes();
      if (before !== keyIsRight(state)) { renderHint(); setProgress(); }
    });
    keyrow.appendChild(keyIn);
    ws.appendChild(keyrow);

    const grid = h('div', { class: 'cc-wsgrid' });
    grid.appendChild(h('span', { class: 'lab', text: 'Code' }));
    FINAL.cipher.split('').forEach(function (ch) { grid.appendChild(h('span', { class: 'box box--code', text: ch })); });
    grid.appendChild(h('span', { class: 'lab', text: 'Key letter' }));
    FINAL.cipher.split('').forEach(function () { const b = h('span', { class: 'box box--key', text: '' }); disk.keyBoxes.push(b); grid.appendChild(b); });
    grid.appendChild(h('span', { class: 'lab', text: 'Real letter' }));
    FINAL.cipher.split('').forEach(function (ch, i) {
      const inp = h('input', { type: 'text', maxlength: '1', autocomplete: 'off', spellcheck: 'false', 'data-sanitize': 'off', 'aria-label': 'Real letter ' + (i + 1) + ' of ' + FINAL.cipher.length + ' (code letter ' + ch + ')' });
      inp.value = state.disk.out[i] || '';
      if (state.diskSolved) inp.disabled = true;
      inp.addEventListener('input', function () {
        const L = lettersOnly(inp.value).slice(-1);
        inp.value = L;
        state.disk.out[i] = L;
        save();
        if (L && disk.outInputs[i + 1]) disk.outInputs[i + 1].focus();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && disk.outInputs[i - 1]) { disk.outInputs[i - 1].focus(); }
        if (e.key === 'Enter') { e.preventDefault(); checkDisk(); }
      });
      disk.outInputs.push(inp);
      grid.appendChild(inp);
    });
    ws.appendChild(grid);
    drawKeyBoxes();
    if (state.diskSolved) {
      ws.appendChild(h('p', null, 'Unlocked: <span class="cc-scramble is-solved">' + WORD + '</span>'));
    } else {
      ws.appendChild(button('btn primary sm', 'Try this password', checkDisk));
      disk.fb = h('p', { class: 'cc-feedback', role: 'status' });
      ws.appendChild(disk.fb);
    }
    return ws;
  }
  function drawKeyBoxes() {
    const key = lettersOnly(state.disk.key);
    disk.keyBoxes.forEach(function (b, i) { b.textContent = key ? key[i % key.length] : ''; });
  }
  function checkDisk() {
    if (state.diskSolved || !disk.fb) return;
    const out = state.disk.out.map(lettersOnly).join('');
    if (out.length < WORD.length) {
      disk.fb.className = 'cc-feedback is-info';
      disk.fb.textContent = 'Fill in all ' + WORD.length + ' real letters first.';
      return;
    }
    if (out === WORD) {
      state.diskSolved = true;
      save();
      advance();
      return;
    }
    const right = out.split('').filter(function (ch, i) { return ch === WORD[i]; }).length;
    spend(COST.wrong, 'Encryption room: wrong password decode');
    state.wrongs += 1;
    save();
    disk.fb.className = 'cc-feedback is-bad';
    disk.fb.textContent = 'Gibberish (-2 pts). ' + right + ' of ' + WORD.length + ' letters are right. ' +
      (keyIsRight(state) ? 'For each letter: key letter under the arrow, find the code letter on the inner ring, read the outer letter beside it.' : 'Are you sure you have the right key?');
    if (!state.warned.disk) { state.warned.disk = true; save(); say('wrong_disk'); }
  }

  let bruteTimer = null;
  function stopBrute() { if (bruteTimer) { clearInterval(bruteTimer); bruteTimer = null; } }
  function renderLaptop() {
    const lap = h('div', { class: 'cc-laptop', 'aria-label': 'Kemi\'s code-breaking laptop' });
    lap.appendChild(h('div', { class: 'cc-laptop__bar', text: 'Kemi\'s code-breaking laptop: trying every simple shift on ' + FINAL.cipher }));
    const list = h('div', { class: 'cc-laptop__list' });
    const sum = h('div', { class: 'cc-laptop__sum' });
    lap.appendChild(list); lap.appendChild(sum);
    const lines = [];
    for (let s = 1; s < 26; s++) lines.push('shift ' + s + ': ' + FINAL.cipher.split('').map(function (ch) { return shiftLetter(ch, -s); }).join('') + ' <i>&#10007;</i>');
    const finish = function () { sum.textContent = 'All 25 shifts tried in 0.002 seconds. Real words found: 0. Not a simple shift.'; };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (state.bruteShown || reduce) {
      lines.forEach(function (t) { list.appendChild(h('span', null, t)); });
      finish();
      if (!state.bruteShown) { state.bruteShown = true; save(); }
    } else {
      let i = 0;
      bruteTimer = setInterval(function () {
        if (i >= lines.length) { stopBrute(); finish(); state.bruteShown = true; save(); return; }
        list.appendChild(h('span', null, lines[i++]));
      }, 70);
    }
    return lap;
  }

  function turnDisk(dir) {
    const snapped = Math.round(state.disk.angle / STEP_DEG) * STEP_DEG;
    state.disk.angle = snapped - dir * STEP_DEG;
    if (disk.ring) disk.ring.style.transform = 'rotate(' + state.disk.angle + 'deg)';
    save();
    updateDisk();
  }
  function snapDisk() {
    state.disk.angle = Math.round(state.disk.angle / STEP_DEG) * STEP_DEG;
    if (disk.ring) disk.ring.style.transform = 'rotate(' + state.disk.angle + 'deg)';
    save();
    updateDisk();
  }
  function setSpot(L) {
    state.disk.spot = L || '';
    save();
    updateDisk();
  }
  function updateDisk() {
    if (!disk.svg) return;
    const k = diskK();
    const keyL = String.fromCharCode(A + k);
    disk.slider.setAttribute('aria-valuenow', String(k));
    disk.slider.setAttribute('aria-valuetext', keyL + ' is under the arrow');
    $$('.cc-dl.is-spot', disk.svg).forEach(function (t) { t.classList.remove('is-spot'); });
    const hiIn = $('.cc-hi-in', disk.svg), hiOut = $('.cc-hi-out', disk.svg);
    hiIn.innerHTML = ''; hiOut.innerHTML = '';
    let html = 'Under the arrow: <b>' + keyL + '</b>';
    if (state.disk.spot) {
      const j = state.disk.spot.charCodeAt(0) - A;
      const o = mod(j - k, 26);
      const q = polar(127, j * STEP_DEG), p = polar(171, o * STEP_DEG);
      hiIn.innerHTML = '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="17" fill="rgba(9,255,136,.28)" stroke="#0bff8c" stroke-width="2"/>';
      hiOut.innerHTML = '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="17" fill="rgba(9,255,136,.28)" stroke="#0bff8c" stroke-width="2"/>';
      const ti = $('[data-in="' + j + '"]', disk.svg), to = $('[data-out="' + o + '"]', disk.svg);
      if (ti) ti.classList.add('is-spot');
      if (to) to.classList.add('is-spot');
      html += '<br>Inner <b>' + state.disk.spot + '</b> lines up with outer <b>' + String.fromCharCode(A + o) + '</b>';
    } else {
      html += '<br><span style="color:var(--muted);font-size:.85rem">Tap a letter on the inner ring to light up its partner.</span>';
    }
    disk.read.innerHTML = html;
  }
  function attachDiskDrag() {
    const svg = disk.svg;
    let drag = null;
    function centre() {
      const r = svg.getBoundingClientRect();
      return { x: r.left + r.width * (210 / 420), y: r.top + r.height * (234 / 444) };
    }
    function angleOf(e, c) { return Math.atan2(e.clientX - c.x, -(e.clientY - c.y)) * 180 / Math.PI; }
    disk.slider.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      const c = centre();
      drag = { c: c, last: angleOf(e, c), x0: e.clientX, y0: e.clientY, moved: false, target: e.target };
      e.preventDefault();
      try { disk.slider.focus({ preventScroll: true }); } catch (_) {}
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    function onMove(e) {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true;
      disk.wrap.classList.add('is-dragging');
      const a = angleOf(e, drag.c);
      let d = a - drag.last;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      drag.last = a;
      state.disk.angle += d;
      disk.ring.style.transform = 'rotate(' + state.disk.angle + 'deg)';
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!drag) return;
      const d = drag; drag = null;
      disk.wrap.classList.remove('is-dragging');
      if (!d.moved) {
        const hit = d.target && d.target.closest ? d.target.closest('[data-letter]') : null;
        if (hit) {
          const L = String.fromCharCode(A + Number(hit.dataset.letter));
          const sp = $('.cc-spot input', disk.wrap.parentNode);
          if (sp) sp.value = L;
          setSpot(L);
          announce('Inner ' + L + ' lines up with outer ' + String.fromCharCode(A + mod(Number(hit.dataset.letter) - diskK(), 26)));
        }
        return;
      }
      snapDisk();
    }
    disk.slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); turnDisk(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); turnDisk(-1); }
      else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const target = e.key.toUpperCase().charCodeAt(0) - A;
        const delta = mod(target - diskK() + 13, 26) - 13;
        turnDisk(delta);
      }
    });
  }

  // =====================================================================
  //  COMPLETION
  // =====================================================================
  function renderTop() {
    if (!state.completed) {
      els.complete.hidden = true;
      els.complete.innerHTML = '';
      if (els.callout) els.callout.innerHTML = '<span class="cc-lockword">Locked.</span> Crack the courier\'s codes to reveal this room\'s code word.';
      return;
    }
    if (els.callout) {
      els.callout.textContent = '';
      els.callout.appendChild(document.createTextNode('Code word: '));
      els.callout.appendChild(h('strong', { text: WORD }));
      els.callout.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    }
    const c = els.complete;
    c.innerHTML = '';
    c.appendChild(h('h2', { text: 'Case closed: the handover password is cracked' }));
    c.appendChild(h('p', null, 'You cracked all of the crew\'s codes. Police will be waiting at Pier 4 when the buyer asks for the password.'));
    c.appendChild(h('div', { class: 'cc-codeword', text: WORD }));
    const p = h('p');
    p.appendChild(document.createTextNode('Code word: '));
    p.appendChild(h('strong', { text: WORD }));
    p.appendChild(document.createTextNode(' — enter it in the vault on the Mission Hub.'));
    c.appendChild(p);
    const row = h('div', { class: 'cc-row' });
    row.appendChild(h('a', { class: 'btn primary', href: 'game.html', text: 'Go to the Mission Hub' }));
    row.appendChild(h('a', { class: 'btn ghost', href: 'forensics.html', text: 'Next room: Network Forensics →' }));
    c.appendChild(row);
    c.appendChild(h('p', { class: 'muted', style: 'font-size:.85rem;color:var(--muted)', text: 'Wrong guesses: ' + (state.wrongs || 0) + ' · Hints used: ' + (state.hintsUsed || 0) }));
    const deb = h('div', { class: 'cc-debrief' });
    deb.appendChild(h('div', { class: 'cc-debrief__card' },
      '<h3>What encryption does</h3><ul><li>It scrambles information so only someone with the <strong>key</strong> can read it.</li>' +
      '<li>You use it every day: the padlock in your web browser, your phone\'s lock screen, an encrypted work laptop, WhatsApp messages.</li>' +
      '<li>A lost laptop that\'s encrypted is just a brick to a thief.</li></ul>'));
    deb.appendChild(h('div', { class: 'cc-debrief__card' },
      '<h3>Strong keys beat weak keys</h3><ul><li>A single shift has 26 keys: a laptop tries them all in a blink. Real encryption keys are too long for any computer to guess.</li>' +
      '<li>So attackers go after the key. Never use a pet\'s name, birthday or team name.</li>' +
      '<li>Your password is often the key. Three or four random words make a strong passphrase.</li></ul>'));
    deb.appendChild(h('div', { class: 'cc-debrief__card' },
      '<h3>Keep the key away from the lock</h3><ul><li>Never send a locked file and its password in the same email: text or call with the password.</li>' +
      '<li>Don\'t write keys or passwords next to what they unlock.</li>' +
      '<li>Hiding isn\'t locking: an oddly named folder protects nothing.</li>' +
      '<li>Nobody genuine will ask you for your password or sign-in code.</li></ul>'));
    c.appendChild(deb);
    c.hidden = false;
  }

  function animateScramble() {
    const target = $$('.cc-scramble.is-solved[data-solve]', els.phone).concat($$('.cc-ws .cc-scramble.is-solved', els.benchBody));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    target.forEach(function (el) {
      let n = 0;
      const t = setInterval(function () {
        n++;
        el.textContent = WORD.split('').map(function (ch, i) {
          return n > 6 + i * 3 ? ch : String.fromCharCode(A + Math.floor(Math.random() * 26));
        }).join('');
        if (n > 6 + WORD.length * 3) { clearInterval(t); el.textContent = WORD; }
      }, 60);
    });
  }

  function solveRoom() {
    if (state.completed) return;
    state.completed = true;
    state.completedAt = Date.now();
    state.diskSolved = true;
    state.done.disk = true;
    state.step = STEPS.length;
    state.lesson = null;
    state.phoneView = 'msgs';
    save();
    let first = false;
    try { first = window.vault?.completeRoom?.(ROOM, WORD, { message: 'Code word ' + WORD + ' secured. Enter it in the vault on the Mission Hub.' }) === true; } catch (_) {}
    say('solved');
    later(function () { say('solved2'); }, 1600);
    later(function () { say('solved3'); }, 3400);
    renderAll();
    animateScramble();
    announce('Room complete. Code word ' + WORD + '. Enter it in the vault on the Mission Hub.');
    if (first || !state.scrolled) {
      state.scrolled = true;
      save();
      try { els.complete.focus({ preventScroll: true }); } catch (_) {}
      scrollTo(els.complete, 'start');
    }
  }

  // =====================================================================
  //  BOOT
  // =====================================================================
  function renderAll() {
    renderFeed();
    renderClues();
    renderCodes();
    renderHotspots();
    renderChrome();
    renderCloseup();
    renderPhone();
    renderBench();
    renderTop();
  }

  // Another device finished the room, or an admin re-opened it.
  window.addEventListener('state-sync:applied', function () {
    const solvedInVault = vaultSaysComplete();
    if (solvedInVault && !state.completed) {
      adoptSolved();
      renderAll();
      return;
    }
    if (!solvedInVault && state.completed) {
      const progress = window.utils?.readProgress?.() || {};
      if (Date.now() - (state.completedAt || 0) < 30000) {
        // A sync that crossed our completion in flight: put it back.
        try { window.vault?.completeRoom?.(ROOM, WORD); } catch (_) {}
      } else if (progress[ROOM] === false) {
        state = freshState();
        save();
        renderAll();
        boot(true);
      }
    }
  });

  function boot(restart) {
    if (!restart) {
      try { points?.ensure?.(); } catch (_) {}
      try {
        window.utils?.initStatusHud?.(ROOM, {
          score: '#cryptoPointsTotal',
          delta: '#cryptoPointsDelta',
          progressFill: '#cryptoProgressFill',
          progressLabel: '#cryptoProgressText'
        });
      } catch (_) {}
    }
    if (!state.msgs.length && !state.completed) {
      state.msgs = ['intro_kemi'];
      save();
      later(function () { say('intro_courier'); }, 1600);
    }
    // Timed follow-ups that were pending when the page was left.
    if (state.done.book && !state.msgs.includes('book_done2')) state.msgs.push('book_done2');
    if (state.read.t2 && !state.msgs.includes('phone_t2b')) state.msgs.push('phone_t2b');
    if (state.done.stencil && !state.completed && !state.texts.includes('t2')) {
      state.texts.push('t2');
      state.phoneView = 'lock';
      if (!state.msgs.includes('text2')) state.msgs.push('text2');
    }
    save();
    renderAll();
    setProgress();
  }

  window.addEventListener('pagehide', function () { clearTimers(); stopBrute(); });
  // Re-draw the book when switching between one-page and two-page layouts.
  let wasNarrow = isNarrow();
  window.addEventListener('resize', function () {
    const n = isNarrow();
    if (n !== wasNarrow) { wasNarrow = n; if (state.bench === 'book') drawSpread(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(false); });
  else boot(false);
})();
