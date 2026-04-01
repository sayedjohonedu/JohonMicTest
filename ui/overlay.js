'use strict';

const PUNCT_LATIN = ['.','?','!',',','"',';',':','—','…','(',')','-',"'" ];
const PUNCT_CJK    = ['。','？','！','，','；','：','——','……','「','」','（','）'];
const PUNCT_ARABIC = ['.','؟','!','،','"','"',';',':','—','…','(',')' ];
const PUNCT_INDIC  = ['।','?','!',',','"','"',';',':','—','…','(',')' ];
const PUNCT_CYRILLIC = ['.','?','!',',','«','»',';',':','—','…','(',')' ];
const PUNCT_KHMER  = ['।','?','!',',','"','"',';',':','…','(',')','-' ];
const PUNCT_THAI   = ['.','?','!',',','"','"',';',':','…','(',')','-' ];

const LANGUAGES = [
  { code:'en-US', name:'English (US)',       flag:'🇺🇸', native:'English',       punct:PUNCT_LATIN },
  { code:'en-GB', name:'English (UK)',       flag:'🇬🇧', native:'English',       punct:PUNCT_LATIN },
  { code:'en-CA', name:'English (CA)',       flag:'🇨🇦', native:'English',       punct:PUNCT_LATIN },
  { code:'en-AU', name:'English (AU)',       flag:'🇦🇺', native:'English',       punct:PUNCT_LATIN },
  { code:'en-IN', name:'English (IN)',       flag:'🇮🇳', native:'English',       punct:PUNCT_LATIN },
  { code:'en-ZA', name:'English (ZA)',       flag:'🇿🇦', native:'English',       punct:PUNCT_LATIN },
  { code:'es-ES', name:'Español (ES)',       flag:'🇪🇸', native:'Español',       punct:['.','?','!','¿','¡',',','"',';',':','—','(',')' ] },
  { code:'es-MX', name:'Español (MX)',       flag:'🇲🇽', native:'Español',       punct:['.','?','!','¿','¡',',','"',';',':','—','(',')' ] },
  { code:'es-AR', name:'Español (AR)',       flag:'🇦🇷', native:'Español',       punct:['.','?','!','¿','¡',',','"',';',':','—','(',')' ] },
  { code:'es-US', name:'Español (US)',       flag:'🇺🇸', native:'Español',       punct:['.','?','!','¿','¡',',','"',';',':','—','(',')' ] },
  { code:'pt-BR', name:'Português (BR)',     flag:'🇧🇷', native:'Português',     punct:PUNCT_LATIN },
  { code:'pt-PT', name:'Português (PT)',     flag:'🇵🇹', native:'Português',     punct:PUNCT_LATIN },
  { code:'fr-FR', name:'Français (FR)',      flag:'🇫🇷', native:'Français',      punct:['.','?','!',',','«','»',';',':','—','…','(',')' ] },
  { code:'fr-CA', name:'Français (CA)',      flag:'🇨🇦', native:'Français',      punct:['.','?','!',',','«','»',';',':','—','…','(',')' ] },
  { code:'de-DE', name:'Deutsch (DE)',       flag:'🇩🇪', native:'Deutsch',       punct:['.','?','!',',','„','"',';',':','—','…','(',')' ] },
  { code:'de-AT', name:'Deutsch (AT)',       flag:'🇦🇹', native:'Deutsch',       punct:['.','?','!',',','„','"',';',':','—','…','(',')' ] },
  { code:'de-CH', name:'Deutsch (CH)',       flag:'🇨🇭', native:'Deutsch',       punct:['.','?','!',',','„','"',';',':','—','…','(',')' ] },
  { code:'nl-NL', name:'Nederlands (NL)',    flag:'🇳🇱', native:'Nederlands',    punct:PUNCT_LATIN },
  { code:'nl-BE', name:'Nederlands (BE)',    flag:'🇧🇪', native:'Nederlands',    punct:PUNCT_LATIN },
  { code:'sv-SE', name:'Svenska (SE)',       flag:'🇸🇪', native:'Svenska',       punct:PUNCT_LATIN },
  { code:'da-DK', name:'Dansk (DK)',         flag:'🇩🇰', native:'Dansk',         punct:PUNCT_LATIN },
  { code:'nb-NO', name:'Norsk (NO)',         flag:'🇳🇴', native:'Norsk',         punct:PUNCT_LATIN },
  { code:'is-IS', name:'Íslenska (IS)',      flag:'🇮🇸', native:'Íslenska',      punct:PUNCT_LATIN },
  { code:'it-IT', name:'Italiano (IT)',      flag:'🇮🇹', native:'Italiano',      punct:PUNCT_LATIN },
  { code:'ru-RU', name:'Русский (RU)',       flag:'🇷🇺', native:'Русский',       punct:PUNCT_CYRILLIC },
  { code:'pl-PL', name:'Polski (PL)',        flag:'🇵🇱', native:'Polski',        punct:['.','?','!',',','"','„',';',':','—','…','(',')' ] },
  { code:'cs-CZ', name:'Čeština (CZ)',       flag:'🇨🇿', native:'Čeština',       punct:PUNCT_LATIN },
  { code:'sk-SK', name:'Slovenčina (SK)',    flag:'🇸🇰', native:'Slovenčina',    punct:PUNCT_LATIN },
  { code:'uk-UA', name:'Українська (UA)',    flag:'🇺🇦', native:'Українська',    punct:PUNCT_CYRILLIC },
  { code:'hr-HR', name:'Hrvatski (HR)',      flag:'🇭🇷', native:'Hrvatski',      punct:PUNCT_LATIN },
  { code:'sr-RS', name:'Српски (RS)',        flag:'🇷🇸', native:'Српски',        punct:PUNCT_CYRILLIC },
  { code:'bg-BG', name:'Български (BG)',     flag:'🇧🇬', native:'Български',     punct:PUNCT_CYRILLIC },
  { code:'sl-SI', name:'Slovenščina (SI)',   flag:'🇸🇮', native:'Slovenščina',   punct:PUNCT_LATIN },
  { code:'mk-MK', name:'Македонски (MK)',    flag:'🇲🇰', native:'Македонски',    punct:PUNCT_CYRILLIC },
  { code:'ro-RO', name:'Română (RO)',        flag:'🇷🇴', native:'Română',        punct:PUNCT_LATIN },
  { code:'ca-ES', name:'Català (ES)',        flag:'🇪🇸', native:'Català',        punct:PUNCT_LATIN },
  { code:'el-GR', name:'Ελληνικά (GR)',      flag:'🇬🇷', native:'Ελληνικά',      punct:PUNCT_LATIN },
  { code:'fi-FI', name:'Suomi (FI)',         flag:'🇫🇮', native:'Suomi',         punct:PUNCT_LATIN },
  { code:'hu-HU', name:'Magyar (HU)',        flag:'🇭🇺', native:'Magyar',        punct:PUNCT_LATIN },
  { code:'ja-JP', name:'Japanese (JP)',      flag:'🇯🇵', native:'日本語',         punct:['。','？','！','、','「','」','…','ー','～','・','（','）'] },
  { code:'zh-CN', name:'Chinese (CN)',       flag:'🇨🇳', native:'中文',           punct:PUNCT_CJK },
  { code:'zh-TW', name:'Chinese (TW)',       flag:'🇹🇼', native:'中文',           punct:PUNCT_CJK },
  { code:'ko-KR', name:'Korean (KR)',        flag:'🇰🇷', native:'한국어',         punct:PUNCT_LATIN },
  { code:'th-TH', name:'Thai (TH)',          flag:'🇹🇭', native:'ภาษาไทย',       punct:PUNCT_THAI },
  { code:'vi-VN', name:'Tiếng Việt (VN)',    flag:'🇻🇳', native:'Tiếng Việt',    punct:PUNCT_LATIN },
  { code:'id-ID', name:'Bahasa Indonesia',   flag:'🇮🇩', native:'Bahasa Indonesia', punct:PUNCT_LATIN },
  { code:'ms-MY', name:'Bahasa Melayu (MY)', flag:'🇲🇾', native:'Bahasa Melayu', punct:PUNCT_LATIN },
  { code:'ms-BN', name:'Bahasa Melayu (BN)', flag:'🇧🇳', native:'Bahasa Melayu', punct:PUNCT_LATIN },
  { code:'tl-PH', name:'Filipino (PH)',      flag:'🇵🇭', native:'Filipino',      punct:PUNCT_LATIN },
  { code:'my-MM', name:'Myanmar (MM)',       flag:'🇲🇲', native:'မြန်မာ',         punct:PUNCT_LATIN },
  { code:'km-KH', name:'Khmer (KH)',         flag:'🇰🇭', native:'ខ្មែর',           punct:PUNCT_KHMER },
  { code:'lo-LA', name:'Lao (LA)',           flag:'🇱🇦', native:'ລາວ',             punct:PUNCT_LATIN },
  { code:'mn-MN', name:'Монгол (MN)',        flag:'🇲🇳', native:'Монгол',         punct:PUNCT_CYRILLIC },
  { code:'hi-IN', name:'Hindi (IN)',         flag:'🇮🇳', native:'हिन्दी',          punct:PUNCT_INDIC },
  { code:'bn-IN', name:'Bengali (IN)',       flag:'🇮🇳', native:'বাংলা',           punct:PUNCT_INDIC },
  { code:'bn-BD', name:'Bengali (BD)',       flag:'🇧🇩', native:'বাংলা',           punct:PUNCT_INDIC },
  { code:'ur-IN', name:'Urdu (IN)',          flag:'🇮🇳', native:'اردو',             punct:PUNCT_ARABIC },
  { code:'ur-PK', name:'Urdu (PK)',          flag:'🇵🇰', native:'اردو',             punct:PUNCT_ARABIC },
  { code:'pa-IN', name:'Punjabi (IN)',       flag:'🇮🇳', native:'ਪੰਜਾਬੀ',           punct:PUNCT_INDIC },
  { code:'gu-IN', name:'Gujarati (IN)',      flag:'🇮🇳', native:'ગુજરાતી',          punct:PUNCT_INDIC },
  { code:'mr-IN', name:'Marathi (IN)',       flag:'🇮🇳', native:'मराठी',            punct:PUNCT_INDIC },
  { code:'te-IN', name:'Telugu (IN)',        flag:'🇮🇳', native:'తెలుగు',            punct:PUNCT_INDIC },
  { code:'kn-IN', name:'Kannada (IN)',       flag:'🇮🇳', native:'ಕನ್ನಡ',            punct:PUNCT_INDIC },
  { code:'ml-IN', name:'Malayalam (IN)',     flag:'🇮🇳', native:'മലയാളം',           punct:PUNCT_INDIC },
  { code:'ta-IN', name:'Tamil (IN)',         flag:'🇮🇳', native:'தமிழ்',            punct:PUNCT_INDIC },
  { code:'or-IN', name:'Odia (IN)',          flag:'🇮🇳', native:'ଓଡ଼ିଆ',             punct:PUNCT_INDIC },
  { code:'si-LK', name:'Sinhala (LK)',       flag:'🇱🇰', native:'සිංහල',           punct:PUNCT_INDIC },
  { code:'ne-NP', name:'Nepali (NP)',        flag:'🇳🇵', native:'नेपाली',           punct:PUNCT_INDIC },
  { code:'dv-MV', name:'Dhivehi (MV)',       flag:'🇲🇻', native:'ދިވެހި',           punct:PUNCT_ARABIC },
  { code:'ar-SA', name:'Arabic (SA)',        flag:'🇸🇦', native:'العربية',         punct:PUNCT_ARABIC },
  { code:'ar-AE', name:'Arabic (AE)',        flag:'🇦🇪', native:'العربية',         punct:PUNCT_ARABIC },
  { code:'ar-EG', name:'Arabic (EG)',        flag:'🇪🇬', native:'العربية',         punct:PUNCT_ARABIC },
  { code:'tr-TR', name:'Türkçe (TR)',        flag:'🇹🇷', native:'Türkçe',          punct:PUNCT_LATIN },
  { code:'he-IL', name:'עברית (IL)',         flag:'🇮🇱', native:'עברית',           punct:PUNCT_ARABIC },
  { code:'fa-IR', name:'فارسی (IR)',         flag:'🇮🇷', native:'فারসি',           punct:PUNCT_ARABIC },
  { code:'sw-KE', name:'Kiswahili (KE)',     flag:'🇰🇪', native:'Kiswahili',       punct:PUNCT_LATIN },
  { code:'am-ET', name:'Amharic (ET)',       flag:'🇪🇹', native:'አማርኛ',            punct:PUNCT_LATIN },
  { code:'zu-ZA', name:'isiZulu (ZA)',       flag:'🇿🇦', native:'isiZulu',         punct:PUNCT_LATIN },
  { code:'yo-NG', name:'Yoruba (NG)',        flag:'🇳🇬', native:'Yorùbá',          punct:PUNCT_LATIN },
  { code:'ig-NG', name:'Igbo (NG)',          flag:'🇳🇬', native:'Igbo',            punct:PUNCT_LATIN },
  { code:'ha-NG', name:'Hausa (NG)',         flag:'🇳🇬', native:'Hausa',           punct:PUNCT_LATIN },
  { code:'so-SO', name:'Soomaali (SO)',      flag:'🇸🇴', native:'Soomaali',        punct:PUNCT_LATIN },
  { code:'rw-RW', name:'Kinyarwanda (RW)',   flag:'🇷🇼', native:'Kinyarwanda',     punct:PUNCT_LATIN },
  { code:'mg-MG', name:'Malagasy (MG)',      flag:'🇲🇬', native:'Malagasy',        punct:PUNCT_LATIN },
  { code:'uz-UZ', name:"O'zbek (UZ)",        flag:'🇺🇿', native:"O'zbek",          punct:PUNCT_LATIN },
  { code:'kk-KZ', name:'Қазақша (KZ)',       flag:'🇰🇿', native:'Қазақша',         punct:PUNCT_CYRILLIC },
  { code:'ky-KG', name:'Кыргызча (KG)',      flag:'🇰🇬', native:'Кыргызча',        punct:PUNCT_CYRILLIC },
  { code:'haw-US', name:'Hawaiian (US)',     flag:'🇺🇸', native:'ʻŌlelo Hawaiʻi',  punct:PUNCT_LATIN },
  { code:'mi-NZ',  name:'Māori (NZ)',        flag:'🇳🇿', native:'Te Reo Māori',    punct:PUNCT_LATIN },
  { code:'sm-WS',  name:'Samoan (WS)',       flag:'🇼🇸', native:'Gagana Sāmoa',    punct:PUNCT_LATIN },
  { code:'to-TO',  name:'Tongan (TO)',       flag:'🇹🇴', native:'Lea Faka-Tonga',  punct:PUNCT_LATIN },
  { code:'fj-FJ',  name:'Fijian (FJ)',       flag:'🇫🇯', native:'Na Vosa Vakaviti',punct:PUNCT_LATIN },
  { code:'cy-GB',  name:'Cymraeg (GB)',      flag:'🇬🇧', native:'Cymraeg',         punct:PUNCT_LATIN },
];

const isWin = navigator.userAgent.includes('Windows');
const IS_MAC = navigator.platform.toUpperCase().includes('MAC');
const MOD    = IS_MAC ? '⌘' : 'Ctrl';

let currentLangCode = 'en-US';
let currentLang     = LANGUAGES[0];
let dropdownOpen    = false;
let isSpeaking      = false;
let clearTimer      = null;
let favorites       = [];
let specialPage     = 0; 
let isKbExpanded    = false;
let isMiniMode      = false;
let specialMode     = false;
let isEmojiOpen     = false;

// 0: off, 1: active once (Blue), 2: locked (Purple)
let stickyMods = { shift: 0, alt: 0, command: 0, control: 0 };
let lastModClick = { shift: 0, alt: 0, command: 0, control: 0 };

const SPECIAL_CHARS = {
  'general': ['«','»','—','–','…','°','©','®','™','•','§','†','‡','¶'],
  'math':    ['+','-','×','÷','=','≠','±','<','>','≤','≥','≈','∞','√'],
  'currency':['$','€','£','¥','₹','₽','₩','₪','₿'],
  'bn-BD':   ['।','৳','ঁ','ং','ঃ','অ','আ','ই','ঈ','উ','ঊ','ঋ','এ','ঐ','ও','ঔ','ক','খ','গ','ঘ','ঙ','চ','ছ','জ','ঝ','ঞ','ট','ঠ','ড','ঢ','ণ','ত','থ','দ','ধ','ন','প','ফ','ব','ভ','ম','য','র','ল','শ','ষ','স','হ','ড়','ঢ়','য়'],
};

const SPECIAL_CHAR_PAGES = [
  { label: 'Math',       chars: ['÷','×','±','∞','√','π','∑','∆','≈','≠','≤','≥'] },
  { label: 'Currency',   chars: ['€','£','¥','₹','₿','¢','₩','₪','₫','฿','₺','₽'] },
  { label: 'Arrows',     chars: ['→','←','↑','↓','↔','↩','↪','⇒','⇐','⇑','⇓','↗'] },
  { label: 'Symbols',    chars: ['©','®','™','°','§','¶','†','‡','•','◦','‣','⁕'] },
];

const KB_NUM_ROW = ['`','1','2','3','4','5','6','7','8','9','0','-','='];
const KB_Q_ROW   = ['q','w','e','r','t','y','u','i','o','p','[',']','\\'];
const KB_A_ROW   = ['a','s','d','f','g','h','j','k','l',';',"'"];
const KB_Z_ROW   = ['z','x','c','v','b','n','m',',','.','/'];
const SHIFT_MAP  = { '`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':','\'':'"',',':'<','.':'>','/':'?' };
const ROBOTJS_KEY_MAP = { '`':'`', '\\':'\\', '[':'[', ']':']', ';':';', "'":"'", ',':',', '.':'.', '/':'/', '=':'=', '-':'-', ' ':'space', '\n':'enter' };

function getActiveMods() {
  const res = [];
  if (stickyMods.shift > 0) res.push('shift');
  if (stickyMods.alt > 0) res.push('alt');
  if (stickyMods.command > 0) res.push('command');
  if (stickyMods.control > 0) res.push('control');
  return res.length > 0 ? res : undefined;
}

function consumeSticky() {
  let changed = false;
  for (const k in stickyMods) {
    if (stickyMods[k] === 1) { 
      stickyMods[k] = 0; 
      changed = true; 
    }
  }
  if (changed) updateModifierUI();
}

function updateModifierUI() {
  document.querySelectorAll('.kb-key, .punct-btn').forEach(el => {
    el.classList.remove('active', 'locked', 'mod-once', 'mod-lock');
  });
  
  const mods = ['shift', 'alt', 'command', 'control'];
  
  mods.forEach(m => {
    const state = stickyMods[m];
    if (state === 0) return;
    
    const actionMap = {
      'shift':   ['shift'],
      'alt':     ['alt'],
      'command': ['cmd', 'command'],
      'control': ['ctrl', 'control']
    };
    
    const actions = actionMap[m] || [m];
    const selectors = actions.map(a => `[data-action="${a}"]`);
    
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (state === 1) {
          el.classList.add('active', 'mod-once');
          if (m === 'shift' && el.classList.contains('shift-key')) el.textContent = '⇧';
        } else if (state === 2) {
          el.classList.add('locked', 'mod-lock');
          if (m === 'shift' && el.classList.contains('shift-key')) el.textContent = '⇪';
        }
      });
    });
  });
  
  if (isKbExpanded) updateKbKeyLabels();
}

function toggleModifier(mod) {
  const now = Date.now();
  const timeSinceLast = now - lastModClick[mod];
  lastModClick[mod] = now;

  if (stickyMods[mod] === 0) {
    stickyMods[mod] = 1;
  } else if (stickyMods[mod] === 1 && timeSinceLast < 400) {
    stickyMods[mod] = 2; // Locked
  } else {
    stickyMods[mod] = 0;
  }
  updateModifierUI();
}

function buildSpecialChars() {
  const container = document.getElementById('kb-grid');
  if (!container) return;
  container.innerHTML = '';
  const list = [...SPECIAL_CHARS.general, ...SPECIAL_CHARS.math, ...SPECIAL_CHARS.currency];
  const langSpecific = SPECIAL_CHARS[currentLangCode] || [];
  const combined = [...langSpecific, ...list];
  combined.forEach(char => {
    const btn = document.createElement('div');
    btn.className = 'kb-key';
    btn.textContent = char;
    container.appendChild(btn);
  });
}

function getShiftChar(label) { return (stickyMods.shift === 0) ? label : (SHIFT_MAP[label] || label.toUpperCase()); }
function getRobotKey(label) { return /^[a-z]$/.test(label) ? label : (ROBOTJS_KEY_MAP[label] || label); }
function updateKbKeyLabels() { document.querySelectorAll('.kb-key[data-char]').forEach(el => el.textContent = getShiftChar(el.dataset.char)); }

const phraseEl      = document.getElementById('phrase-text');
const interimEl     = document.getElementById('interim-text');
const langBtn       = document.getElementById('lang-btn');
const langFlagEl    = document.getElementById('lang-flag');
const langNameEl    = document.getElementById('lang-name');
const dropdown      = document.getElementById('lang-dropdown');
const miniFlagEl    = document.getElementById('mini-lang-flag');
const prow1         = document.getElementById('prow1');
const prow2         = document.getElementById('prow2');
const prowExtra     = document.getElementById('prow-extra');
const pageDots      = document.getElementById('page-dots');
const prow3         = document.getElementById('prow3');
const canvas        = document.getElementById('waveform');
const ctx           = canvas.getContext('2d');

if (isWin) {
  const titlebar = document.getElementById('titlebar');
  const miniWaveWrap = document.getElementById('mini-wave-wrap');
  const setupDrag = (el) => {
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, .dot, #lang-wrapper, #mini-lang-flag')) return;
      window.junoAPI.startDrag();
    });
    el.addEventListener('mouseup', () => { window.junoAPI.stopDrag(); });
  };
  setupDrag(titlebar); setupDrag(miniWaveWrap); setupDrag(document.getElementById('status-label'));
}

window.junoAPI.getConfig().then(cfg => {
  if (cfg.favorites) favorites = cfg.favorites;
  setLanguage(cfg.language || 'en-US', false);
  if (cfg.overlayMini) applyMiniMode(true, false);
});

function setLanguage(code, notify=true) {
  currentLangCode = code;
  currentLang = LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
  const flagHtml = isWin && currentLang.code.includes('-') 
    ? `<img src="https://flagcdn.com/16x12/${currentLang.code.split('-')[1].toLowerCase()}.png" width="16" style="vertical-align:-1px;">`
    : currentLang.flag;
  langFlagEl.innerHTML = flagHtml;
  langNameEl.textContent = currentLang.name;
  if (miniFlagEl) {
    // Preserve the chevron span — only update the text node (flag)
    const chevron = document.getElementById('mini-lang-chevron');
    miniFlagEl.innerHTML = flagHtml + (chevron ? chevron.outerHTML : '<span id="mini-lang-chevron" style="font-size:9px;margin-left:1px;color:rgba(255,255,255,0.5);">▾</span>');
  }
  buildPunctuation(currentLang.punct);
  buildDropdown();
  if (notify) window.junoAPI.changeLanguage(code);
}

const SHORTCUTS = [
  { key: 'A', label: 'Select All', fn: () => window.junoAPI.injectSelectAll() },
  { key: 'C', label: 'Copy',       fn: () => window.junoAPI.injectCopy()      },
  { key: 'X', label: 'Cut',        fn: () => window.junoAPI.injectCut()       },
  { key: 'V', label: 'Paste',      fn: () => window.junoAPI.injectPaste()     },
  { key: 'Z', label: 'Undo',       fn: () => window.junoAPI.injectUndo()      },
];

function buildPunctuation(chars) {
  const mid = Math.ceil(chars.length / 2);
  prow1.innerHTML = prow2.innerHTML = prow3.innerHTML = '';
  chars.slice(0, mid).forEach(c => prow1.appendChild(mkBtn(c)));
  prow1.appendChild(mkBackspaceBtn());
  prow2.appendChild(mkShuffleBtn()); 
  chars.slice(mid).forEach(c => prow2.appendChild(mkBtn(c)));
  prow2.appendChild(mkEnterBtn());
  prow2.appendChild(mkExpandKbBtn());
  buildExtraRow(); buildPageDots();
  SHORTCUTS.forEach(s => prow3.appendChild(mkKbdBtn(s)));
}

function buildExtraRow() {
  prowExtra.innerHTML = '';
  if (specialPage === 0) {
    prowExtra.style.display = 'none';
    if (window.junoAPI && window.junoAPI.setPunctExtraHeight) window.junoAPI.setPunctExtraHeight(0);
    return;
  }
  prowExtra.style.display = 'flex';
  const page = SPECIAL_CHAR_PAGES[specialPage - 1];
  page.chars.forEach(c => prowExtra.appendChild(mkExtraBtn(c)));
  if (window.junoAPI && window.junoAPI.setPunctExtraHeight) window.junoAPI.setPunctExtraHeight(33);
}

function buildPageDots() {
  pageDots.innerHTML = '';
  const totalDots = SPECIAL_CHAR_PAGES.length + 1;
  for (let i = 0; i < totalDots; i++) {
    const d = document.createElement('span');
    d.className = 'page-dot' + (i === specialPage ? ' active' : '');
    pageDots.appendChild(d);
  }
}

function mkBtn(char) {
  const b = document.createElement('button'); b.className = 'punct-btn';
  const isSpace = char === '…' || char === '……'; b.textContent = isSpace ? '␣' : char;
  if (isSpace) b.title = 'Insert a space'; return b;
}
function mkExtraBtn(char) { const b = document.createElement('button'); b.className = 'punct-btn'; b.textContent = char; b.title = char; b.style.fontSize = '13px'; return b; }
function mkShuffleBtn() { const b = document.createElement('button'); b.className = 'punct-btn shuffle-btn'; b.dataset.action = 'shuffle-page'; b.textContent = '⇅'; b.title = 'Cycle special characters'; return b; }
function mkExpandKbBtn() {
  const b = document.createElement('button'); b.className = 'punct-btn expand-kb-btn' + (isKbExpanded ? ' active-kb' : '');
  b.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="14" viewBox="0 0 24 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto;pointer-events:none"><rect x="1" y="1" width="22" height="15" rx="2.5"/><line x1="5" y1="5.5" x2="5" y2="5.5" stroke-width="2.2" stroke-linecap="round"/><line x1="9" y1="5.5" x2="9" y2="5.5" stroke-width="2.2" stroke-linecap="round"/><line x1="13" y1="5.5" x2="13" y2="5.5" stroke-width="2.2" stroke-linecap="round"/><line x1="17" y1="5.5" x2="17" y2="5.5" stroke-width="2.2" stroke-linecap="round"/><line x1="5" y1="9.5" x2="5" y2="9.5" stroke-width="2.2" stroke-linecap="round"/><line x1="9" y1="9.5" x2="9" y2="9.5" stroke-width="2.2" stroke-linecap="round"/><line x1="13" y1="9.5" x2="13" y2="9.5" stroke-width="2.2" stroke-linecap="round"/><line x1="17" y1="9.5" x2="17" y2="9.5" stroke-width="2.2" stroke-linecap="round"/><line x1="7" y1="13.5" x2="15" y2="13.5" stroke-width="2" stroke-linecap="round"/></svg>`;
  b.title = 'Expand / collapse full keyboard'; b.id = 'expand-kb-btn'; b.dataset.action = 'expand-kb'; return b;
}
function mkEnterBtn() { const b = document.createElement('button'); b.className = 'punct-btn enter-btn'; b.dataset.action = 'enter'; b.textContent = '↵'; b.title = 'Return / Enter'; return b; }

let initialTimer = null, repeatTimer = null;
function startBackspaceRepeat() {
  window.junoAPI.injectBackspace();
  initialTimer = setTimeout(() => { repeatTimer = setInterval(() => { window.junoAPI.injectBackspace(); }, 40); }, 500);
}
function stopBackspaceRepeat() { clearTimeout(initialTimer); clearInterval(repeatTimer); initialTimer = repeatTimer = null; }

function mkBackspaceBtn() {
  const b = document.createElement('button'); b.className = 'punct-btn back-btn'; b.dataset.action = 'backspace'; b.textContent = '⌫'; b.title = 'Backspace — hold to erase';
  b.addEventListener('mouseup', stopBackspaceRepeat); b.addEventListener('mouseleave', stopBackspaceRepeat); return b;
}
function mkKbdBtn({ key, label, fn }) {
  const b = document.createElement('button'); b.className = 'kbd-btn'; b.dataset.action = 'shortcut'; b.dataset.shortcut = key;
  b.title = `${MOD}+${key} — ${label}`; b.innerHTML = `<span class="kbd-key">${MOD}${key}</span><span class="kbd-label">${label}</span>`; return b;
}

function flash(btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 180); }

function buildDropdown() {
  dropdown.innerHTML = '';
  const sorted = [...LANGUAGES].sort((a, b) => {
    const aFav = favorites.includes(a.code), bFav = favorites.includes(b.code);
    return (aFav && !bFav) ? -1 : (!aFav && bFav) ? 1 : 0;
  });
  sorted.forEach(lang => {
    const d = document.createElement('div'); d.className = 'lang-item' + (lang.code === currentLangCode ? ' active' : '');
    const isFav = favorites.includes(lang.code);
    const flagHtml = isWin && lang.code.includes('-') ? `<img src="https://flagcdn.com/16x12/${lang.code.split('-')[1].toLowerCase()}.png" width="16" style="vertical-align:-1px;">` : lang.flag;
    d.innerHTML = `<span class="li-fav" style="${isFav ? 'color: var(--accent);' : 'color: var(--muted);'}" title="Toggle Favorite">${isFav ? '★' : '☆'}</span><span class="li-flag">${flagHtml}</span><span class="li-name">${lang.name}</span><span class="li-code">${lang.native}</span>`;
    d.addEventListener('mousedown', e => {
      if (e.target.classList.contains('li-fav')) {
        e.preventDefault(); e.stopPropagation();
        isFav ? favorites = favorites.filter(f => f !== lang.code) : favorites.push(lang.code);
        window.junoAPI.toggleFavorite(lang.code); buildDropdown(); return;
      }
      e.preventDefault(); setLanguage(lang.code); closeDD();
    });
    dropdown.appendChild(d);
  });
}

function positionDropdown() {
  const anchor = (isMiniMode && miniFlagEl) ? miniFlagEl : langBtn;
  const rect = anchor.getBoundingClientRect();
  
  if (isMiniMode) {
    // In mini mode, the main process expands the window height to ~350px downwards
    dropdown.style.top = (rect.bottom + 6) + 'px';
    dropdown.style.bottom = 'auto';
    dropdown.style.maxHeight = '280px';
    dropdown.style.right = Math.max(0, 280 - rect.right) + 'px';
    dropdown.style.left = 'auto';
    return;
  }
  
  const spaceAbove = rect.top, spaceBelow = window.innerHeight - rect.bottom;
  if (spaceAbove > spaceBelow) {
    dropdown.style.top = 'auto';
    dropdown.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    dropdown.style.maxHeight = Math.max(100, spaceAbove - 10) + 'px';
  } else {
    dropdown.style.top = (rect.bottom + 6) + 'px';
    dropdown.style.bottom = 'auto';
    dropdown.style.maxHeight = Math.max(100, spaceBelow - 10) + 'px';
  }
  dropdown.style.right = Math.max(0, window.innerWidth - rect.right) + 'px';
  dropdown.style.left = 'auto';
}

function openDD() { 
  dropdownOpen = true; 
  if (isMiniMode && window.junoAPI.setDropdownOpen) window.junoAPI.setDropdownOpen(true);
  buildDropdown(); 
  positionDropdown(); 
  dropdown.classList.add('open'); 
}

function closeDD() { 
  dropdownOpen = false; 
  if (isMiniMode && window.junoAPI.setDropdownOpen) window.junoAPI.setDropdownOpen(false);
  dropdown.classList.remove('open'); 
}

// Dedicated langBtn listener - opens/closes the dropdown
langBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); dropdownOpen ? closeDD() : openDD(); });
if (miniFlagEl) miniFlagEl.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); dropdownOpen ? closeDD() : openDD(); });
// Close dropdown when clicking anywhere else
document.addEventListener('mousedown', e => {
  if (!dropdownOpen) return;
  if (dropdown.contains(e.target)) return;
  if (langBtn.contains(e.target) || e.target === langBtn) return;
  if (miniFlagEl && (miniFlagEl.contains(e.target) || e.target === miniFlagEl)) return;
  closeDD();
});

function applyMiniMode(mini, notify = true) {
  if (dropdownOpen) closeDD();
  if (mini) {
    isKbExpanded = false;
    isEmojiOpen = false;
    const kbP = document.getElementById('keyboard-panel');
    const pR = document.getElementById('panels-row');
    const eP = document.getElementById('emoji-panel');
    const btn = document.getElementById('expand-kb-btn');
    const eBtn = document.getElementById('emoji-toggle-key');
    if (kbP) kbP.classList.remove('open');
    if (btn) btn.classList.remove('active-kb');
    if (pR) pR.classList.remove('open');
    if (eP) eP.classList.remove('open');
    if (eBtn) eBtn.classList.remove('emoji-active');
  }
  isMiniMode = mini; const card = document.getElementById('card');
  mini ? (card.classList.add('mini-mode'), syncMiniWave()) : card.classList.remove('mini-mode');
  if (notify) window.junoAPI.setMiniMode(mini);
}

document.body.addEventListener('mousedown', (e) => {
  if (window.junoAPI && window.junoAPI.resetSilence) window.junoAPI.resetSilence();
  const target = e.target.closest('.punct-btn, .kb-key, .emoji-btn, .kbd-btn, #mini-btn, #expand-btn, #settings-btn, #dot-close');
  if (target) {
    e.preventDefault(); flash(target);
    if (target.id === 'dot-close') window.junoAPI.stopListening();
    else if (target.id === 'settings-btn') { e.stopPropagation(); window.junoAPI.openSettings(); }
    else if (target.id === 'mini-btn') { e.stopPropagation(); applyMiniMode(true); }
    else if (target.id === 'expand-btn') { e.stopPropagation(); applyMiniMode(false); }
    else if (target.classList.contains('punct-btn')) {
      const action = target.getAttribute('data-action');
      if (action === 'enter') window.junoAPI.injectEnter();
      else if (action === 'backspace') startBackspaceRepeat();
      else if (action === 'shuffle-page') { specialPage = (specialPage + 1) % (SPECIAL_CHAR_PAGES.length + 1); buildExtraRow(); buildPageDots(); target.classList.add('spinning'); setTimeout(() => target.classList.remove('spinning'), 320); }
      else if (action === 'expand-kb') toggleKeyboard();
      else { const char = target.getAttribute('data-char') || target.textContent.trim(); const isSpace = char === '␣' || target.title === 'Insert a space'; window.junoAPI.injectPunct(isSpace ? ' ' : char); }
    }

    else if (target.classList.contains('emoji-btn')) {
      const em = target.getAttribute('title') || target.textContent.trim();
      window.junoAPI.injectPunct(em);
      recentEmojis = [em, ...recentEmojis.filter(x => x !== em)].slice(0, 50); 
      localStorage.setItem('juno_recent_emojis', JSON.stringify(recentEmojis));
    }
    else if (target.classList.contains('kb-key') || target.classList.contains('kbd-btn')) {
      const action = target.getAttribute('data-action');
      if (action === 'enter') { window.junoAPI.injectEnter(); consumeSticky(); }
      else if (action === 'backspace') { window.junoAPI.injectBackspace(); consumeSticky(); }
      else if (action === 'tab') { window.junoAPI.injectRawKey('tab'); consumeSticky(); }
      else if (action === 'space') { window.junoAPI.injectPunct(' '); consumeSticky(); }
      else if (action === 'emoji-toggle') togglePanelsRow();
      else if (action === 'arrow-left' || action === 'arrow-right' || action === 'arrow-up' || action === 'arrow-down') {
        const dir = action.replace('arrow-', '');
        const mods = { ctrl: stickyMods.control > 0, alt: stickyMods.alt > 0, shift: stickyMods.shift > 0, command: stickyMods.command > 0 };
        window.junoAPI.injectRawKey(dir, mods);
        consumeSticky();
      }
      else if (action === 'shortcut') { const key = target.getAttribute('data-shortcut'); const s = SHORTCUTS.find(x => x.key === key); if (s) s.fn(); }
      else if (action === 'undo') { window.junoAPI.injectUndo(); consumeSticky(); }
      else if (action === 'select-all') { window.junoAPI.injectSelectAll(); consumeSticky(); }
      else if (action === 'copy') { window.junoAPI.injectCopy(); consumeSticky(); }
      else if (action === 'cut') { window.junoAPI.injectCut(); consumeSticky(); }
      else if (action === 'paste') { window.junoAPI.injectPaste(); consumeSticky(); }
      else if (action === 'shift') toggleModifier('shift');
      else if (action === 'alt') toggleModifier('alt');
      else if (action === 'cmd') toggleModifier('command');
      else if (action === 'ctrl') toggleModifier('control');
      else if (action === 'special') { specialMode = !specialMode; target.classList.toggle('active', specialMode); if (specialMode) buildSpecialChars(); }
      else {
        const char = target.dataset.char;
        if (char) {
          const isS = stickyMods.shift > 0, isC = stickyMods.control > 0, isA = stickyMods.alt > 0, isCmd = stickyMods.command > 0;
          const rK = getRobotKey(char.toLowerCase());
          const mods = { ctrl: isC, alt: isA, shift: isS && /^[a-z]$/.test(char), command: isCmd };
          if (!isC && !isA && !isCmd && isS && SHIFT_MAP[char]) window.junoAPI.injectPunct(SHIFT_MAP[char]);
          else if (isC || isA || isCmd || /^[a-z]$/.test(char)) window.junoAPI.injectRawKey(rK, mods);
          else window.junoAPI.injectPunct(char);
          consumeSticky();
        } else {
          const text = target.textContent.trim();
          if (text.length === 1 && !['⇧', '⇪', '⌃', '⌥', '⌘', '↵', '⌫', '✕', '⇅'].includes(text)) { window.junoAPI.injectPunct(text); consumeSticky(); }
        }
      }
    }
    extendOverlayDelay();
  }
}, true);

function applyOverlayTheme(themeVal) {
  let t = themeVal || 'system';
  if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  window.junoRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '124, 111, 255';
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { window.junoAPI.getConfig().then(cfg => { if ((cfg.theme || 'system') === 'system') applyOverlayTheme('system'); }); });
window.junoAPI.onConfigUpdate && window.junoAPI.onConfigUpdate((cfg) => { if (cfg.theme && typeof applyOverlayTheme === 'function') applyOverlayTheme(cfg.theme); });

window.junoAPI.onSessionStart((data) => {
  window.junoAPI.getConfig().then(cfg => applyOverlayTheme(cfg.theme));
  const badge = document.getElementById('wc-badge'), sep = document.getElementById('wc-sep');
  if (badge) { badge.style.display = 'none'; badge.textContent = '📝 0 words'; }
  if (sep) sep.style.display = 'none';
  clearTimer && clearTimeout(clearTimer);
  phraseEl.textContent = ''; interimEl.textContent = ''; phraseEl.classList.remove('fading');
  document.getElementById('status-label').textContent = 'Listening…';
  if (data && data.lang) setLanguage(data.lang, false);
});

window.junoAPI.onTranscript((data) => {
  const text = (data.text || data).trim(); if (!text) return;
  clearTimer && clearTimeout(clearTimer);
  phraseEl.classList.remove('fading'); phraseEl.textContent = text; interimEl.textContent = ''; isSpeaking = false;
  clearTimer = setTimeout(() => { phraseEl.classList.add('fading'); setTimeout(() => { phraseEl.textContent = ''; phraseEl.classList.remove('fading'); }, 320); }, 1800);
});

window.junoAPI.onInterim((text) => { interimEl.textContent = text || ''; isSpeaking = !!text; });
function extendOverlayDelay() { if (phraseEl.textContent && !isSpeaking) { clearTimer && clearTimeout(clearTimer); phraseEl.classList.remove('fading'); clearTimer = setTimeout(() => { phraseEl.classList.add('fading'); setTimeout(() => { phraseEl.textContent = ''; phraseEl.classList.remove('fading'); }, 320); }, 1800); } }
window.junoAPI.onStatus((s) => { document.getElementById('status-label').textContent = s === 'silence-timeout' ? 'Stopped (silence)' : 'Listening…'; });
window.junoAPI.onLanguage((code) => setLanguage(code, false));
window.junoAPI.onSetLanguage((code) => setLanguage(code, false));
const wcBadge = document.getElementById('wc-badge'), wcSep = document.getElementById('wc-sep');
window.junoAPI.onSessionWordCount((n) => { if (n > 0) { wcBadge.textContent = `📝 ${n.toLocaleString()} word${n === 1 ? '' : 's'}`; wcBadge.style.display = wcSep.style.display = 'inline'; } });
const clickSound = new Audio('../assets/computer-mouse-click.mp3'), closeSound = new Audio('../assets/out-2.aac');
clickSound.volume = closeSound.volume = 0.8;
window.junoAPI.onPlaySound((isStarting) => { if (isStarting) { clickSound.currentTime = 0; clickSound.play().catch(()=>{}); } else { closeSound.currentTime = 0; closeSound.play().catch(()=>{}); } });

let visualizerType = 'wave', currentAudioData = { bins: new Array(15).fill(0), volume: 0 }, smoothedBins = new Array(15).fill(0), smoothedVol = 0, wavePhase = 0, miniPhase = 0, currentAmp = 2.5, currentMiniAmp = 2.0;
if (window.junoAPI.onAudioData) window.junoAPI.onAudioData((data) => { if (data && data.bins) currentAudioData = data; });
function resizeCanvas() { const dpr = window.devicePixelRatio || 1; canvas.width = canvas.offsetWidth * dpr; canvas.height = canvas.offsetHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
resizeCanvas(); new ResizeObserver(resizeCanvas).observe(canvas);
function getNeonGradient(c, w) { const g = c.createLinearGradient(0, 0, w, 0), rgb = window.junoRgb || '124, 111, 255'; g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.15, `rgba(${rgb},0.85)`); g.addColorStop(0.85, `rgba(${rgb},0.85)`); g.addColorStop(1, `rgba(${rgb},0)`); return g; }
function updateSmoothings() { smoothedVol += ((isSpeaking ? currentAudioData.volume / 255 : 0) - smoothedVol) * 0.2; for (let i = 0; i < 15; i++) smoothedBins[i] += ((isSpeaking ? currentAudioData.bins[i] / 255 : 0) - smoothedBins[i]) * 0.2; }
const particles = Array.from({ length: 40 }).map(() => ({ x: Math.random(), y: Math.random(), speed: Math.random() * 0.02 + 0.005, offset: Math.random() * Math.PI * 2 }));
function drawTypeWave(c, w, h, isMini) {
  const phaseStep = isSpeaking ? 0.075 : 0.022; isMini ? miniPhase += phaseStep : wavePhase += phaseStep;
  const phase = isMini ? miniPhase : wavePhase, targetAmp = isSpeaking ? (isMini ? 2 : 2.5) + (currentAudioData.volume / 255) * (isMini ? 12 : 25) : (isMini ? 2 : 2.5);
  isMini ? currentMiniAmp += (targetAmp - currentMiniAmp) * 0.2 : currentAmp += (targetAmp - currentAmp) * 0.2;
  const amp = isMini ? currentMiniAmp : currentAmp;
  c.beginPath(); const steps = Math.floor(w / 3);
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w, y = h/2 + Math.sin(i*0.45 + phase) * amp + Math.sin(i*0.9 + phase * 1.3) * amp * 0.5 + Math.sin(i*0.2 + phase * 0.7) * amp * 0.3;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  c.strokeStyle = getNeonGradient(c, w); c.lineWidth = isSpeaking ? (isMini ? 2 : 2.2) : (isMini ? 1.2 : 1.4); c.shadowBlur = isSpeaking ? 10 : 3; c.shadowColor = `rgba(${window.junoRgb || '124, 111, 255'},0.55)`; c.stroke();
}
function drawTypeBars(c, w, h, isMini) {
  const barCount = 15, gap = isMini ? 2 : 4, playArea = w * 0.8, startX = (w - playArea) / 2, barWidth = (playArea - (gap * (barCount - 1))) / barCount;
  c.fillStyle = getNeonGradient(c, w); c.shadowBlur = isSpeaking ? 8 : 2; c.shadowColor = `rgba(${window.junoRgb || '124, 111, 255'},0.5)`;
  for (let i = 0; i < barCount; i++) {
    const height = (isMini ? 2 : 4) + smoothedBins[i] * (isMini ? h * 0.8 : h * 0.6), x = startX + i * (barWidth + gap), y = h/2 - height/2;
    c.beginPath(); c.roundRect ? c.roundRect(x, y, barWidth, height, barWidth/2) : c.rect(x,y,barWidth,height); c.fill();
  }
}
function drawTypePulse(c, w, h, isMini) {
  const cx = w / 2, cy = h / 2, maxR = isMini ? 12 : 36, minR = isMini ? 3 : 8;
  c.shadowBlur = isSpeaking ? 15 : 5; c.shadowColor = `rgba(${window.junoRgb || '124, 111, 255'},0.8)`; c.strokeStyle = `rgba(${window.junoRgb || '124, 111, 255'},0.9)`; c.lineWidth = isMini ? 2 : 3;
  const r1 = minR + smoothedVol * maxR, r2 = minR + smoothedVol * maxR * 1.6;
  c.beginPath(); c.arc(cx, cy, Math.max(0, r1), 0, Math.PI*2); c.stroke();
  if (smoothedVol > 0.1) { c.strokeStyle = `rgba(${window.junoRgb || '124, 111, 255'},${0.5 * smoothedVol})`; c.beginPath(); c.arc(cx, cy, Math.max(0, r2), 0, Math.PI*2); c.stroke(); }
}
function drawTypeParticles(c, w, h, isMini) {
  c.shadowBlur = isSpeaking ? 6 : 2; c.shadowColor = `rgba(${window.junoRgb || '124, 111, 255'},0.6)`; c.fillStyle = `rgba(${window.junoRgb || '124, 111, 255'},0.9)`;
  const pSize = isMini ? 2 : 3;
  particles.forEach((p, i) => {
    const binVal = smoothedBins[i % 15]; p.offset += p.speed;
    const px = (p.x * w) + Math.sin(p.offset) * (10 + binVal*20), py = (h/2) + Math.cos(p.offset) * (isMini ? 4 : 12) * (1 + binVal*(isMini?5:4.5));
    c.beginPath(); c.arc(Math.max(0, px), Math.max(0, Math.min(h, py)), pSize + binVal*2, 0, Math.PI*2); c.fill();
  });
}
function drawTypeLine(c, w, h, isMini) {
  const count = 15, totalPts = count * 2 - 1, step = w / (totalPts - 1), maxH = isMini ? h*0.4 : (h/2 * 0.9), minH = isMini ? 1 : 2;
  c.beginPath(); let x = 0;
  for (let i = count - 1; i >= 0; i--, x += step) { const y = h/2 - minH - smoothedBins[i] * maxH; i === count - 1 ? c.moveTo(x, y) : c.lineTo(x, y); }
  for (let i = 1; i < count; i++, x += step) { const y = h/2 - minH - smoothedBins[i] * maxH; c.lineTo(x, y); }
  c.strokeStyle = getNeonGradient(c, w); c.lineWidth = isMini ? 2 : 3; c.shadowBlur = isSpeaking ? 10 : 3; c.shadowColor = `rgba(${window.junoRgb || '124, 111, 255'},0.6)`; c.stroke();
}
function drawTypeMatrix(c, w, h, isMini) {
  const barCount = 15, gap = isMini ? 2 : 3, blocksPerBar = isMini ? 3 : 5, playArea = w * 0.6, startX = (w - playArea) / 2, bW = playArea / barCount, bH = (isMini ? h * 0.6 : h * 0.4) / blocksPerBar;
  for (let i = 0; i < barCount; i++) {
    const fillBlocks = Math.max(isSpeaking ? 1 : 0, Math.round(smoothedBins[i] * blocksPerBar));
    for (let j = 0; j < blocksPerBar; j++) {
      if ((j >= fillBlocks && fillBlocks > 0) || (!isSpeaking && j > 0)) continue;
      const x = startX + i * bW, y = h/2 + (isMini ? 5 : 10) - (j * bH) - bH, rgb = window.junoRgb || '124, 111, 255';
      c.fillStyle = isSpeaking ? `rgba(${rgb},${0.3 + (j / blocksPerBar)*0.7})` : `rgba(${rgb},0.1)`; c.shadowBlur = isSpeaking ? 4 : 0; c.shadowColor = `rgba(${rgb},0.5)`; c.fillRect(x + gap/2, y + gap/2, bW - gap, bH - gap);
    }
  }
}
function drawVisualizer() { updateSmoothings(); const W = canvas.offsetWidth, H = canvas.offsetHeight; ctx.clearRect(0, 0, W, H); switch (visualizerType) { case 'bars': drawTypeBars(ctx, W, H, false); break; case 'pulse': drawTypePulse(ctx, W, H, false); break; case 'particles': drawTypeParticles(ctx, W, H, false); break; case 'line': drawTypeLine(ctx, W, H, false); break; case 'matrix': drawTypeMatrix(ctx, W, H, false); break; default: drawTypeWave(ctx, W, H, false); break; } requestAnimationFrame(drawVisualizer); }
drawVisualizer();
const miniCanvas = document.getElementById('mini-wave'), mctx = miniCanvas.getContext('2d');
function resizeMiniCanvas() { const dpr = window.devicePixelRatio || 1; miniCanvas.width = miniCanvas.offsetWidth * dpr; miniCanvas.height = miniCanvas.offsetHeight * dpr; mctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
new ResizeObserver(resizeMiniCanvas).observe(miniCanvas); resizeMiniCanvas();
function drawMiniWave() { if (!isMiniMode) return; const W = miniCanvas.offsetWidth, H = miniCanvas.offsetHeight; mctx.clearRect(0, 0, W, H); switch (visualizerType) { case 'bars': drawTypeBars(mctx, W, H, true); break; case 'pulse': drawTypePulse(mctx, W, H, true); break; case 'particles': drawTypeParticles(mctx, W, H, true); break; case 'line': drawTypeLine(mctx, W, H, true); break; case 'matrix': drawTypeMatrix(mctx, W, H, true); break; default: drawTypeWave(mctx, W, H, true); break; } requestAnimationFrame(drawMiniWave); }
function syncMiniWave() { drawMiniWave(); }
const transcriptArea = document.getElementById('transcript-area'), transcriptRo = new ResizeObserver(entries => { if (isMiniMode) return; for (let entry of entries) if (window.junoAPI.requestResize) window.junoAPI.requestResize(Math.ceil(entry.borderBoxSize ? entry.borderBoxSize[0].blockSize : entry.contentRect.height)); });
if (transcriptArea) transcriptRo.observe(transcriptArea);

function buildKeyboard() {
  const nR = document.getElementById('kb-row-num'), qR = document.getElementById('kb-row-q'), aR = document.getElementById('kb-row-a'), zR = document.getElementById('kb-row-z'), mR = document.getElementById('kb-row-mod');
  if (!nR) return; nR.innerHTML = qR.innerHTML = aR.innerHTML = zR.innerHTML = mR.innerHTML = '';
  KB_NUM_ROW.forEach(c => nR.appendChild(mkKbLetterKey(c, 'num-key'))); nR.appendChild(mkKbSpecialKey('⌫', 'del-key', 'backspace'));
  qR.appendChild(mkKbSpecialKey('Tab', 'tab-key', 'tab')); KB_Q_ROW.forEach(c => qR.appendChild(mkKbLetterKey(c)));
  KB_A_ROW.forEach(c => aR.appendChild(mkKbLetterKey(c))); aR.appendChild(mkKbSpecialKey('↵', 'enter-key', 'enter'));
  zR.appendChild(mkShiftKey()); KB_Z_ROW.forEach(c => zR.appendChild(mkKbLetterKey(c))); zR.appendChild(mkShiftKey());
  mR.appendChild(mkCtrlKey()); mR.appendChild(mkAltKey()); mR.appendChild(mkKbSpecialKey('Space', 'space-key', 'space')); mR.appendChild(mkEmojiToggleKey()); mR.appendChild(mkArrowKey('←','arrow-left')); mR.appendChild(mkArrowKey('↑','arrow-up')); mR.appendChild(mkArrowKey('↓','arrow-down')); mR.appendChild(mkArrowKey('→','arrow-right'));
  updateModifierUI();
}
function mkKbLetterKey(char, extraClass = '') { const b = document.createElement('button'); b.className = 'kb-key ' + extraClass; b.dataset.char = char; b.textContent = char; return b; }
function mkKbSpecialKey(label, extraClass, actionName) { const b = document.createElement('button'); b.className = 'kb-key ' + extraClass; b.textContent = label; if (actionName) b.dataset.action = actionName; return b; }
function mkShiftKey() { const b = document.createElement('button'); b.className = 'kb-key shift-key'; b.textContent = '⇧'; b.dataset.action = 'shift'; return b; }
function mkCtrlKey() { const b = document.createElement('button'); b.className = 'kb-key ctrl-key'; b.textContent = IS_MAC ? '⌃ Cmd' : 'Ctrl'; b.dataset.action = IS_MAC ? 'cmd' : 'ctrl'; return b; }
function mkAltKey() { const b = document.createElement('button'); b.className = 'kb-key alt-key'; b.textContent = IS_MAC ? '⌥ Opt' : 'Alt'; b.dataset.action = 'alt'; return b; }
function mkEmojiToggleKey() { const b = document.createElement('button'); b.className = 'kb-key emoji-toggle-key'; b.textContent = '😊'; b.id = 'emoji-toggle-key'; b.dataset.action = 'emoji-toggle'; return b; }
function mkArrowKey(label, action) { const b = document.createElement('button'); b.className = 'kb-key arrow-key'; b.textContent = label; b.dataset.action = action; b.title = action.replace('arrow-','') + ' arrow'; return b; }
function toggleKeyboard() {
  isKbExpanded = !isKbExpanded;
  const p = document.getElementById('keyboard-panel');
  const btn = document.getElementById('expand-kb-btn');
  
  if (p) {
    if (isKbExpanded) {
      buildKeyboard();
      p.classList.add('open');
    } else {
      p.classList.remove('open');
      if (isEmojiOpen) togglePanelsRow(); // Close panels if keyboard closes
    }
  }
  
  if (btn) btn.classList.toggle('active-kb', isKbExpanded);
  window.junoAPI.setOverlayKeyboardSize(isKbExpanded);
}

// Ensure remote fetched dictionaries map to our window state if available
const EMOJIS = window.JUNO_EMOJI_CATEGORIES || [];
const EMOJI_ALL_FLAT = EMOJIS.flatMap(c => c.emojis);

let currentEmojiCat = 'recent', recentEmojis = JSON.parse(localStorage.getItem('juno_recent_emojis') || '["👍","❤️","😂","🔥","✨","👀","🙌","💯","🤔","🤷‍♂️"]');

function buildEmojiCatTabs() {
  const bar = document.getElementById('emoji-cat-tabs'); if (!bar) return; bar.innerHTML = '';
  const tabs = [{id:'recent',icon:'🕒',label:'Recent'}];
  EMOJIS.forEach(c => tabs.push({id: c.id, icon: c.icon, label: c.label}));
  tabs.forEach(t => {
    const b = document.createElement('button'); b.className = 'emoji-cat-tab' + (currentEmojiCat === t.id ? ' active' : ''); b.textContent = t.icon; b.title = t.label; b.dataset.cat = t.id;
    b.addEventListener('mousedown', e => { e.preventDefault(); currentEmojiCat = t.id; bar.querySelectorAll('.emoji-cat-tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); buildEmojiGrid(getEmojiList()); }); bar.appendChild(b);
  });
}

function getEmojiList() { if (currentEmojiCat === 'recent') return recentEmojis; const c = EMOJIS.find(x => x.id === currentEmojiCat); return c ? c.emojis : EMOJI_ALL_FLAT; }

function buildEmojiGrid(list, isSearch = false) {
  const g = document.getElementById('emoji-grid'); if (!g) return; g.innerHTML = '';
  if (!isSearch) { list.forEach(em => appendEmojiBtn(g, em)); }
  else {
    // If search, show a label
    const l = document.createElement('div'); l.className = 'emoji-cat-label'; l.textContent = 'Search Results'; g.appendChild(l);
    if (list.length === 0) { const nm = document.createElement('div'); nm.style.gridColumn = '1/-1'; nm.style.color = 'var(--muted)'; nm.style.fontSize = '12px'; nm.style.padding = '8px'; nm.textContent = 'No emojis found.'; g.appendChild(nm); }
    else list.forEach(em => appendEmojiBtn(g, em));
  }
}

function appendEmojiBtn(g, em) {
  const b = document.createElement('div'); b.className = 'emoji-btn'; b.title = em;
  if (window.twemoji && window.twemojiReady) b.innerHTML = window.twemoji.parse(em, { folder: 'svg', ext: '.svg', base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/' });
  else b.textContent = em;
  g.appendChild(b);
}



// Combined panels row
function togglePanelsRow() { 
  const p = document.getElementById('panels-row');
  const ePanel = document.getElementById('emoji-panel');
  const btn = document.getElementById('emoji-toggle-key'); 
  if (!p) return; 
  
  isEmojiOpen = !isEmojiOpen; 
  if (isEmojiOpen) { 
    buildEmojiCatTabs(); 
    buildEmojiGrid(getEmojiList()); 
    
    p.classList.add('open'); 
    ePanel.classList.add('open');
    
    if (btn) btn.classList.add('emoji-active'); 
  } else { 
    p.classList.remove('open'); 
    if (btn) btn.classList.remove('emoji-active'); 
  } 
  if (window.junoAPI && window.junoAPI.setOverlayEmojiSize) window.junoAPI.setOverlayEmojiSize(isEmojiOpen); 
}

(function loadTwemoji() { const s = document.createElement('script'); s.src = 'https://unpkg.com/@twemoji/api@15.1.0/dist/twemoji.min.js'; s.crossOrigin = 'anonymous'; s.onload = () => { window.twemojiReady = true; if (isEmojiOpen) buildEmojiGrid(getEmojiList()); }; document.head.appendChild(s); })();
