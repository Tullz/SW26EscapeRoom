/* crypto.js — Encryption room: "The Courier's Case" (Cyber Escape Rooms)

   Story: a criminal crew stole Harbourline Insurance's customer records. Police caught one
   of their couriers; DS Kemi Adeyemi asks the team to crack the codes in his briefcase.

   The codes (STEPS below, in order):
     1. book    — a text on the burner phone is a list of page.line.word numbers into the
                  paperback. The format is written in invisible ink inside the book's cover;
                  the pen in the case has a UV torch in its cap.
     2. stencil — the punched coffee loyalty card, laid over the newspaper word search, shows
                  half a sentence; turned upside down it shows the rest: KEY UNDER THE MINTS.
     3. cipher  — a second text holds a 5-letter password scrambled with a reversed alphabet
                  (A<->Z, B<->Y, C<->X ...). The crew's key card (the alphabet forwards, and
                  backwards underneath) is folded up under the mints in the tin. On the workbench
                  each code letter is one lookup on the card: find it, write down its partner.
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
  const STATE_VERSION = 2;   // 2: the brass disk (code 3) became the reversed-alphabet key card
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
  // Reversed alphabet (Atbash): A<->Z, B<->Y, C<->X ... The same swap scrambles and unscrambles.
  function atbash(text) {
    return lettersOnly(text).split('').map(function (ch) { return String.fromCharCode(A + 25 - (ch.charCodeAt(0) - A)); }).join('');
  }
  const FINAL = { cipher: 'ERKVI' };
  const WORD = atbash(FINAL.cipher);

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
  // Words run left to right or top to bottom (SAND and PIER go down). Face up the holes show
  // KEY UNDER, upside down THE MINTS.
  const GRID = {
    cols: 9, rows: 6,
    letters: 'SKHDSHELLATPYGULLUNTIDEDHOIDKEEWAVEMICRABNGRDDMTBOATSP',
    holes: [[0, 1], [0, 6], [1, 3], [1, 8], [2, 0], [2, 5], [3, 2], [4, 7]],  // card face up
    words: ['GULL', 'TIDE', 'PIER', 'WAVE', 'SAND', 'SHELL', 'CRAB', 'BOAT'],
    halves: { up: 'KEY UNDER…', down: '…THE MINTS' }
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
    stencil_half: { who: 'kemi', text: '"Key under..." Under what? That\'s only half a sentence.' },
    stencil_half2: { who: 'kemi', text: '"...the mints"? That sounds like the end of a sentence. Where\'s the start?' },
    stencil_done: { who: 'courier', tone: 'warn', text: 'It\'s a word search. It doesn\'t mean anything.' },
    text2: { who: 'kemi', tone: 'warn', text: 'His phone just buzzed again! Another message from the snake.' },
    phone_t2: { who: 'kemi', text: 'Five scrambled letters, and the buyer will ask for them tonight. "Decode it with the usual key", so the crew has a key for this code. I bet it\'s somewhere in that briefcase.' },
    phone_t2_have: { who: 'kemi', text: 'Five scrambled letters, and the buyer will ask for them tonight. "Decode it with the usual key"... What about that card you found in the mints tin?' },
    phone_t2b: { who: 'courier', text: 'Told you. Unbreakable.' },
    mints: { who: 'courier', tone: 'warn', text: 'Oi! Hands off my mints.' },
    key_found: { who: 'kemi', tone: 'good', text: 'A card with two rows of letters: the alphabet forwards, and the alphabet backwards underneath. That has to be the key to one of their codes.' },
    dog: { who: 'courier', tone: 'warn', text: 'Oi. Leave my dog out of this.' },
    wrong_decode: { who: 'courier', text: 'Nope. That\'s not the password.' },
    solved: { who: 'kemi', tone: 'good', text: function () { return '<strong>' + WORD + '</strong>. That\'s the handover password! We\'ll be waiting at Pier 4 when the buyer asks for it.'; } },
    solved2: { who: 'courier', tone: 'warn', text: 'How?! That card was meant to be our secret!' },
    solved3: { who: 'kemi', tone: 'good', text: 'Brilliant work, team. Their code had no secret key: once you know the trick, anyone can read it.' }
  };
  const WHO = { kemi: 'DS Kemi Adeyemi', courier: 'Courier (interview room)' };

  // ---------- Content: notebook clues ----------
  const CLUES = {
    t1: function () { return '<b>Text from ' + SNAKE + ':</b> "Tonight\'s instructions. You know where to look." <b>' + BOOK_CODES_TEXT.join(' &middot; ') + '</b>'; },
    paper: '<b>Newspaper:</b> folded open at the puzzles page. Nobody has started the word search.',
    card: '<b>Coffee loyalty card:</b> 8 holes punched in odd places, not in the stamp boxes.',
    pen: '<b>Pen:</b> the cap has a tiny UV torch for reading invisible ink.',
    ink_book: { uv: true, html: '<b>Invisible ink inside the book\'s cover:</b> page &middot; line &middot; word' },
    ink_paper: { uv: true, html: '<b>Invisible ink on the word search:</b> a card-shaped outline drawn around the grid, with a coffee cup.' },
    ink_ticket: { uv: true, html: '<b>Invisible ink on the back of the ticket:</b> "P4, 9pm"' },
    book_msg: function () { return '<b>Book code cracked:</b> ' + BOOK_ANSWER.join(' ').toUpperCase(); },
    stencil_up: '<b>Card over the word search:</b> ' + GRID.halves.up,
    stencil_down: '<b>Card upside down:</b> ' + GRID.halves.down,
    t2: '<b>Second text from ' + SNAKE + ':</b> buyer at Pier 4, 9pm. Password <b>' + FINAL.cipher + '</b>: "decode it with the usual key".',
    keycard: '<b>Card from under the mints:</b> the alphabet forwards, with the alphabet backwards underneath (A above Z, B above Y&hellip;).'
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
    text2: [
      'The courier\'s phone just buzzed. Has anyone read the new message?',
      'Look at the phone in your hands and tap the new message notification to read it.'
    ],
    keycard: [
      'The coffee card said KEY UNDER THE MINTS. Is there a tin of mints in the briefcase?',
      'Click the tin of mints in the bottom half of the briefcase and tip the mints out. The crew\'s key is folded up underneath them.'
    ],
    cipher: [
      'Look at the card from the mints tin. The top line is the alphabet forwards and the line under it is the alphabet backwards, so every letter has a partner: A and Z, B and Y, and so on.',
      'Work one letter at a time. Find the code letter on the card and type its partner (the letter right above or below it) into the box under that code letter. Tap a letter on the card to light up its partner.',
      'Letter by letter: ' + FINAL.cipher[0] + ' sits above ' + WORD[0] + ', so the first real letter is ' + WORD[0] + '. Next find ' + FINAL.cipher[1] + ' on the card and write down its partner, then do the same for ' +
        FINAL.cipher.slice(2, -1).split('').join(', ') + ' and ' + FINAL.cipher.slice(-1) + '.'
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
      id: 'cipher', name: 'The reversed alphabet', gadget: 'decode', final: true,
      hintSet: function (s) { if (s.texts.includes('t2') && !s.read.t2) return 'text2'; return s.keyFound ? 'cipher' : 'keycard'; },
      isDone: function (s) { return !!s.decSolved; },
      lesson: { title: 'A trick is not a key', text: 'Every letter was swapped for another one, but always the same way: A for Z, B for Y. There\'s no secret key, so anyone who knows the trick can read it. Real encryption uses a long secret key that nobody could guess, so the key is the thing to protect.' }
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
      keyFound: false,
      dec: { out: FINAL.cipher.split('').map(function () { return ''; }), lit: -1 },
      decSolved: false,
      hints: {}, wrongs: 0, hintsUsed: 0, warned: {},
      completed: false, completedAt: 0
    };
  }
  // Version 1 had a brass cipher disk for code 3. Keep codes 1-2 (and a finished room);
  // code 3 starts again with the key card.
  function migrate(s) {
    if (s.version !== 1) return s;
    ['disk', 'diskSolved', 'bruteShown'].forEach(function (k) { delete s[k]; });
    if (s.done) delete s.done.disk;
    if (s.hints) { delete s.hints.key; delete s.hints.disk; }
    if (s.warned) delete s.warned.disk;
    if (s.lesson === 'disk') s.lesson = null;
    if (s.bench === 'disk') s.bench = null;
    if (s.focus === 'disk') s.focus = null;
    if (Array.isArray(s.clues)) s.clues = s.clues.filter(function (id) { return CLUES[id]; });
    if (s.completed) { s.keyFound = true; s.decSolved = true; s.done = Object.assign(s.done || {}, { cipher: true }); }
    s.version = 2;
    return s;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      let s = raw ? JSON.parse(raw) : null;
      if (s && typeof s === 'object') s = migrate(s);
      if (s && s.version === STATE_VERSION) {
        const f = freshState();
        const merged = Object.assign(f, s);
        merged.stencil = Object.assign(freshState().stencil, s.stencil || {});
        merged.dec = Object.assign(freshState().dec, s.dec || {});
        if (!Array.isArray(merged.dec.out) || merged.dec.out.length !== FINAL.cipher.length) merged.dec.out = freshState().dec.out;
        if (merged.completed) merged.dec.out = WORD.split('');
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
    state.keyFound = true;
    state.decSolved = true;
    if (!state.texts.includes('t2')) state.texts.push('t2');
    state.read = { t1: true, t2: true };
    state.slots = BOOK_ANSWER.slice();
    state.dec.out = WORD.split('');
    state.lesson = null;
    if (!state.msgs.includes('solved')) state.msgs = ['intro_kemi', 'solved', 'solved2', 'solved3'];
    save();
  }
  if (!state.completed && vaultSaysComplete()) adoptSolved();

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
    if (state.done.stencil && state.keyFound) pct = 75;
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
  const REPEATABLE = { wrong_book: true, wrong_decode: true };
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
      if (!c) return;   // a clue from an older version of the room
      els.clues.appendChild(h('li', { class: c.uv ? 'is-uv' : '' }, clueHtml(id)));
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
      const front = h('div', { class: 'cc-tag' }, '<div><div aria-hidden="true">&#128062;</div><div class="cc-tag__name">RUFUS</div></div>');
      const back = h('div', { class: 'cc-tag' }, 'If I\'m lost, please call my human: 0400 555 017');
      const fp = flipProp('keys', front, back);
      c.appendChild(fp.wrap);
      c.appendChild(h('p', null, 'Two door keys and a bone-shaped dog tag.'));
      const row = h('div', { class: 'cc-actions' }); row.appendChild(fp.btn); c.appendChild(row);
      if (!state.completed) say('dog');
    },
    mints: function () {
      const c = shell('In the case', 'A tin of mints');
      if (!state.keyFound) {
        c.appendChild(h('div', { class: 'cc-tin' }, TIN_SVG));
        c.appendChild(h('p', null, 'Extra strong mints, three left. Something papery is poking out from underneath them.'));
        c.appendChild(button('btn primary', 'Tip the mints out', findKeyCard));
        if (!state.completed) say('mints');
        return;
      }
      c.appendChild(keyCardEl(false));
      c.appendChild(h('p', null, 'Folded flat under the mints: a creased card with two rows of letters. Along the top, the alphabet runs forwards. Underneath, it runs backwards.'));
      c.appendChild(button('btn primary', state.read.t2 ? 'Use the card to decode the password' : 'Lay the card on the workbench', function () { openBench('decode'); }));
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

  // ---------- The mints tin + the key card hidden under the mints ----------
  const TIN_SVG = '<svg viewBox="0 0 240 150" role="img" aria-label="An open tin with three mints in it. A corner of paper pokes out from underneath them.">' +
    '<rect x="5" y="7" width="230" height="136" rx="24" fill="#b8c3c8" stroke="#7d8a90" stroke-width="3"/>' +
    '<rect x="17" y="19" width="206" height="112" rx="15" fill="#dfe6e9"/>' +
    '<path d="M122 131 L223 131 L223 78 Z" fill="#f3ead2" stroke="#c9b98c" stroke-width="2"/>' +
    '<text x="182" y="121" font-size="13" font-weight="700" fill="#8a2c1c" font-family="Courier New, monospace" transform="rotate(-27 182 121)">Z Y X</text>' +
    '<g fill="#fbfdfe" stroke="#c5cfd3" stroke-width="2"><circle cx="74" cy="60" r="21"/><circle cx="118" cy="88" r="21"/><circle cx="160" cy="54" r="21"/></g>' +
    '<g fill="none" stroke="#e1e8eb" stroke-width="2"><circle cx="74" cy="60" r="12"/><circle cx="118" cy="88" r="12"/><circle cx="160" cy="54" r="12"/></g>' +
    '</svg>';

  // The card is folded in half: A-M over Z-N on the top half, N-Z over M-A below the crease,
  // so every column is one swap pair. On the workbench each pair is a button (one tab stop:
  // arrow keys move, typing a letter jumps to it) that lights up when tapped.
  function keyCardEl(interactive) {
    const card = h('div', { class: 'cc-keycard' + (interactive ? '' : ' is-static') });
    if (interactive) {
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', 'Key card: the alphabet forwards, with the alphabet backwards underneath. Tap a letter, or use the arrow keys or type a letter, to light it up with its partner.');
    } else {
      card.setAttribute('role', 'img');
      card.setAttribute('aria-label', 'A creased card: the alphabet forwards along the top and backwards underneath. A sits above Z, B above Y, and so on.');
    }
    [0, 13].forEach(function (start) {
      const half = h('div', { class: 'cc-kc__half' });
      for (let i = start; i < start + 13; i++) {
        const top = String.fromCharCode(A + i), bottom = atbash(top);
        const inner = '<span class="cc-kc__top">' + top + '</span><span class="cc-kc__bot">' + bottom + '</span>';
        if (interactive) half.appendChild(h('button', { type: 'button', class: 'cc-kc__pair', 'data-i': String(i), tabindex: '-1', 'aria-label': top + ' swaps with ' + bottom }, inner));
        else half.appendChild(h('span', { class: 'cc-kc__pair', 'aria-hidden': 'true' }, inner));
      }
      card.appendChild(half);
    });
    return card;
  }

  function findKeyCard() {
    if (state.keyFound) return;
    state.keyFound = true;
    save();
    addClue('keycard');
    renderHotspots();
    renderCloseup();
    setProgress();
    renderHint();
    if (state.bench === 'decode') renderBench();
    try { els.closeup.focus({ preventScroll: true }); } catch (_) {}
    say('key_found');
    announce('You tip the mints out. Underneath them is a folded card with two rows of letters.');
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
          if (id === 't2') { say(state.keyFound ? 'phone_t2_have' : 'phone_t2'); later(function () { say('phone_t2b'); }, 1800); }
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
    decode: { label: 'Key card', render: renderDecode }
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
    state.benches = state.benches.filter(function (id) { return GADGETS[id]; });
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

  // ---------- Gadget 3: the key card + worksheet ----------
  const dec = { card: null, pairs: [], read: null, inputs: [], fb: null };
  function renderDecode(body) {
    const wrap = h('div', { class: 'cc-decode' });
    const left = h('div', { class: 'cc-decode__card' });
    left.appendChild(h('p', { class: 'cc-decode__label' }, 'The card from the mints tin'));
    dec.card = keyCardEl(true);
    dec.pairs = $$('.cc-kc__pair', dec.card);
    left.appendChild(dec.card);
    dec.read = h('p', { class: 'cc-kcread' });
    left.appendChild(dec.read);
    wrap.appendChild(left);
    wrap.appendChild(renderWorksheet());
    body.appendChild(wrap);
    attachKeyCard();
    lightPair(state.dec.lit, false);
  }
  function lightPair(i, speak) {
    state.dec.lit = i >= 0 && i < 26 ? i : -1;
    dec.pairs.forEach(function (b, j) { b.classList.toggle('is-lit', j === state.dec.lit); });
    if (!dec.read) return;
    if (state.dec.lit < 0) {
      dec.read.innerHTML = '<span class="cc-kcread__tip">Tap a letter on the card to light up its partner.</span>';
      return;
    }
    const a = String.fromCharCode(A + state.dec.lit), b = atbash(a);
    dec.read.innerHTML = '<b>' + a + '</b> <span aria-hidden="true">&harr;</span> <b>' + b + '</b>&nbsp; ' + a + ' swaps with ' + b + '.';
    if (speak) announce(a + ' swaps with ' + b + '.');
  }
  function attachKeyCard() {
    const rove = function (i, focus) {
      dec.pairs.forEach(function (b, j) { b.tabIndex = j === i ? 0 : -1; });
      if (focus) { try { dec.pairs[i].focus(); } catch (_) {} }
    };
    rove(state.dec.lit >= 0 ? state.dec.lit : 0, false);
    dec.card.addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('.cc-kc__pair');
      if (!b) return;
      const i = Number(b.dataset.i);
      rove(i, false);
      lightPair(i, true);
      save();
    });
    dec.card.addEventListener('keydown', function (e) {
      const cur = dec.pairs.indexOf(document.activeElement);
      if (cur < 0) return;
      let to = null;
      if (e.key === 'ArrowRight') to = (cur + 1) % 26;
      else if (e.key === 'ArrowLeft') to = (cur + 25) % 26;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') to = (cur + 13) % 26;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = 25;
      else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) to = e.key.toUpperCase().charCodeAt(0) - A;
      if (to == null) return;
      e.preventDefault();
      rove(to, true);
      lightPair(to, true);
      save();
    });
  }

  function renderWorksheet() {
    const ws = h('div', { class: 'cc-ws' });
    ws.appendChild(h('h4', null, 'Worksheet'));
    dec.inputs = []; dec.fb = null;
    if (!state.read.t2) {
      ws.appendChild(h('p', null, 'Nothing to decode yet. If a coded message turns up, it will be copied here.'));
      return ws;
    }
    ws.appendChild(h('p', null, 'The password from the courier\'s phone. Use the key card to turn each code letter back into a real letter.'));
    const grid = h('div', { class: 'cc-wsgrid' });
    grid.appendChild(h('span', { class: 'lab', text: 'Code' }));
    FINAL.cipher.split('').forEach(function (ch) { grid.appendChild(h('span', { class: 'box box--code', text: ch })); });
    grid.appendChild(h('span', { class: 'lab', text: 'Real letter' }));
    FINAL.cipher.split('').forEach(function (ch, i) {
      const inp = h('input', { type: 'text', maxlength: '1', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', 'data-sanitize': 'off', 'aria-label': 'Real letter ' + (i + 1) + ' of ' + FINAL.cipher.length + ' (code letter ' + ch + ')' });
      inp.value = state.dec.out[i] || '';
      if (state.decSolved) inp.disabled = true;
      inp.addEventListener('input', function () {
        const L = lettersOnly(inp.value).slice(-1);
        inp.value = L;
        state.dec.out[i] = L;
        save();
        if (L && dec.inputs[i + 1]) dec.inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && dec.inputs[i - 1]) { dec.inputs[i - 1].focus(); }
        if (e.key === 'Enter') { e.preventDefault(); checkDecode(); }
      });
      dec.inputs.push(inp);
      grid.appendChild(inp);
    });
    ws.appendChild(grid);
    if (state.decSolved) {
      ws.appendChild(h('p', null, 'Unlocked: <span class="cc-scramble is-solved">' + WORD + '</span>'));
    } else {
      ws.appendChild(button('btn primary sm', 'Try this password', checkDecode));
      dec.fb = h('p', { class: 'cc-feedback', role: 'status' });
      ws.appendChild(dec.fb);
    }
    return ws;
  }
  function checkDecode() {
    if (state.decSolved || !dec.fb) return;
    const out = state.dec.out.map(lettersOnly).join('');
    if (out.length < WORD.length) {
      dec.fb.className = 'cc-feedback is-info';
      dec.fb.textContent = 'Fill in all ' + WORD.length + ' real letters first.';
      return;
    }
    if (out === WORD) {
      state.decSolved = true;
      save();
      advance();
      return;
    }
    const right = out.split('').filter(function (ch, i) { return ch === WORD[i]; }).length;
    spend(COST.wrong, 'Encryption room: wrong password decode');
    state.wrongs += 1;
    save();
    dec.fb.className = 'cc-feedback is-bad';
    dec.fb.textContent = 'Gibberish (-2 pts). ' + right + ' of ' + WORD.length + ' letters are right. For each code letter, find it on the key card and write down its partner.';
    if (!state.warned.decode) { state.warned.decode = true; save(); say('wrong_decode'); }
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
    row.appendChild(h('a', { class: 'btn primary', href: 'game.html', text: 'Back to the Mission Hub to open the vault' }));
    c.appendChild(row);
    c.appendChild(h('p', { class: 'muted', style: 'font-size:.85rem;color:var(--muted)', text: 'Wrong guesses: ' + (state.wrongs || 0) + ' · Hints used: ' + (state.hintsUsed || 0) }));
    const deb = h('div', { class: 'cc-debrief' });
    deb.appendChild(h('div', { class: 'cc-debrief__card' },
      '<h3>What encryption does</h3><ul><li>It scrambles information so only someone with the <strong>key</strong> can read it.</li>' +
      '<li>You use it every day: the padlock in your web browser, your phone\'s lock screen, an encrypted work laptop, WhatsApp messages.</li>' +
      '<li>A lost laptop that\'s encrypted is just a brick to a thief.</li></ul>'));
    deb.appendChild(h('div', { class: 'cc-debrief__card' },
      '<h3>A trick is not a key</h3><ul><li>The reversed alphabet swaps every letter the same way, every time. There\'s no secret key: once you know the trick, anyone can read it.</li>' +
      '<li>Real encryption uses a long secret key that no computer could guess, so attackers go after the key instead. Protect it.</li>' +
      '<li>Your password is often the key. Three or four random words make a strong passphrase; a pet\'s name, birthday or team name doesn\'t.</li></ul>'));
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
    state.decSolved = true;
    state.done.cipher = true;
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

  window.addEventListener('pagehide', function () { clearTimers(); });
  // Re-draw the book when switching between one-page and two-page layouts.
  let wasNarrow = isNarrow();
  window.addEventListener('resize', function () {
    const n = isNarrow();
    if (n !== wasNarrow) { wasNarrow = n; if (state.bench === 'book') drawSpread(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(false); });
  else boot(false);
})();
