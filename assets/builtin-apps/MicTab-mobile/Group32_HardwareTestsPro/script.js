/* ============================================================
   MicTab - Hardware Tests | script.js
   Keyboard Tester + Mouse Tester + Scroll Tester + Export + Stats
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ---- DOM References ----
  const keyboard = document.getElementById('keyboard');
  const keysTestedEl = document.getElementById('keysTested');
  const keysTotalEl = document.getElementById('keysTotal');
  const keysRemainingEl = document.getElementById('keysRemaining');
  const btnReset = document.getElementById('btnReset');
  const btnExport = document.getElementById('btnExport');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const donutFill = document.getElementById('donutFill');
  const donutPercent = document.getElementById('donutPercent');
  const statsTested = document.getElementById('statsTested');
  const statsUntested = document.getElementById('statsUntested');
  const keyNameDisplay = document.getElementById('keyNameDisplay');
  const keyCodeDetail = document.getElementById('keyCodeDetail');
  const keyKeyDetail = document.getElementById('keyKeyDetail');
  const keyWhichDetail = document.getElementById('keyWhichDetail');
  const toastEl = document.getElementById('toast');

  // Mouse tester elements
  const mouseLeftEl = document.getElementById('mouseLeft');
  const mouseMiddleEl = document.getElementById('mouseMiddle');
  const mouseRightEl = document.getElementById('mouseRight');
  const mouseLeftCount = document.getElementById('mouseLeftCount');
  const mouseMiddleCount = document.getElementById('mouseMiddleCount');
  const mouseRightCount = document.getElementById('mouseRightCount');

  // Scroll tester elements
  const scrollThumb = document.getElementById('scrollThumb');
  const scrollDirection = document.getElementById('scrollDirection');
  const scrollCountEl = document.getElementById('scrollCount');

  // ---- State ----
  /** Set of event.code values that have been pressed at least once */
  const testedKeys = new Set();

  /** Map from event.code → DOM element for O(1) lookups */
  const codeToElement = new Map();

  /** Mouse button click counts */
  const mouseClicks = { left: 0, middle: 0, right: 0 };

  /** Set of mouse buttons that have been tested at least once */
  const testedMouseButtons = new Set();

  /** Scroll wheel state */
  let scrollEventCount = 0;
  let scrollThumbPos = 22; // centered position (0-44 range)
  let scrollTested = false;
  let scrollTimeout = null;

  /** Key press timestamps for export */
  const keyPressLog = [];

  // ---- Donut Chart Constants ----
  const DONUT_CIRCUMFERENCE = 2 * Math.PI * 40; // r=40

  // ---- Toast Notification ----
  let toastTimeout = null;

  function showToast(message, duration = 2500) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }

  // ---- Initialize: build the code→element map & count total keys ----
  function init() {
    const allKeyEls = keyboard.querySelectorAll('.key[data-code]');
    allKeyEls.forEach((el) => {
      const code = el.dataset.code;
      if (code) {
        codeToElement.set(code, el);
      }
    });

    // Display total key count
    const totalKeys = codeToElement.size;
    keysTotalEl.textContent = totalKeys;

    // Initialize donut chart
    donutFill.style.strokeDasharray = DONUT_CIRCUMFERENCE;
    donutFill.style.strokeDashoffset = DONUT_CIRCUMFERENCE;

    // Update counter & progress (initial state)
    updateUI();
  }

  // ---- Update counter, progress bar, stats, and donut chart ----
  function updateUI() {
    const tested = testedKeys.size;
    const total = codeToElement.size;
    const remaining = total - tested;
    const pct = total > 0 ? Math.round((tested / total) * 100) : 0;

    keysTestedEl.textContent = tested;
    keysRemainingEl.textContent = remaining;
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '% Complete';

    // Update donut chart
    const offset = DONUT_CIRCUMFERENCE - (DONUT_CIRCUMFERENCE * pct / 100);
    donutFill.style.strokeDashoffset = offset;
    donutPercent.textContent = pct + '%';

    // Update stats breakdown
    statsTested.textContent = tested;
    statsUntested.textContent = remaining;
  }

  // ---- Key Press Handler (keydown) ----
  function handleKeyDown(e) {
    // Prevent default for keys that might trigger browser actions
    const preventDefaults = [
      'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Backspace', 'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
      'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
      'PrintScreen', 'ScrollLock', 'Pause',
      'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
    ];

    if (preventDefaults.includes(e.code)) {
      e.preventDefault();
    }

    const el = codeToElement.get(e.code);
    if (!el) {
      // Key not in our visual keyboard, but still update the key code display
      updateKeyCodeDisplay(e);
      return;
    }

    // Add pressed class for visual feedback
    el.classList.add('pressed');

    // Track as tested if this is the first press
    if (!testedKeys.has(e.code)) {
      testedKeys.add(e.code);
      // Mark as visited (shows checkmark & subtle background)
      el.classList.add('visited');
      keyPressLog.push({
        code: e.code,
        key: e.key,
        timestamp: new Date().toISOString()
      });
      updateUI();
    }

    // Update key code display
    updateKeyCodeDisplay(e);
  }

  // ---- Update Key Code Display ----
  function updateKeyCodeDisplay(e) {
    keyNameDisplay.textContent = e.code;
    keyNameDisplay.style.color = 'var(--text-primary)';
    keyCodeDetail.textContent = e.code;
    keyKeyDetail.textContent = e.key === ' ' ? 'Space' : e.key;
    keyWhichDetail.textContent = e.which || e.keyCode || '—';
  }

  // ---- Key Release Handler (keyup) ----
  function handleKeyUp(e) {
    const el = codeToElement.get(e.code);
    if (!el) return;

    // Remove pressed class – transitions back to default (or visited style)
    el.classList.remove('pressed');
  }

  // ---- Mouse Click Handler ----
  function handleMouseDown(e) {
    // Only handle clicks on the mouse test area or its children
    const mouseCard = document.querySelector('.mouse-test-card');
    if (!mouseCard) return;

    let buttonType = null;
    let buttonEl = null;

    if (e.button === 0) {
      buttonType = 'left';
      buttonEl = mouseLeftEl;
    } else if (e.button === 1) {
      buttonType = 'middle';
      buttonEl = mouseMiddleEl;
      e.preventDefault(); // Prevent middle-click scroll
    } else if (e.button === 2) {
      buttonType = 'right';
      buttonEl = mouseRightEl;
    }

    if (buttonType && buttonEl) {
      mouseClicks[buttonType]++;
      testedMouseButtons.add(buttonType);
      buttonEl.classList.add('pressed');

      // Update count display
      const countEl = document.getElementById('mouse' + buttonType.charAt(0).toUpperCase() + buttonType.slice(1) + 'Count');
      if (countEl) {
        countEl.textContent = mouseClicks[buttonType] + (mouseClicks[buttonType] === 1 ? ' click' : ' clicks');
      }

      // Mark as tested after a brief delay
      setTimeout(() => {
        buttonEl.classList.remove('pressed');
        buttonEl.classList.add('tested');
      }, 150);
    }
  }

  // ---- Scroll Wheel Handler ----
  function handleWheel(e) {
    e.preventDefault();

    scrollEventCount++;
    scrollTested = true;

    const direction = e.deltaY < 0 ? 'Scroll Up' : 'Scroll Down';
    scrollDirection.textContent = direction;

    scrollCountEl.textContent = scrollEventCount + (scrollEventCount === 1 ? ' event detected' : ' events detected');

    // Animate scroll thumb
    const delta = e.deltaY < 0 ? -5 : 5;
    scrollThumbPos = Math.max(0, Math.min(44, scrollThumbPos + delta));
    scrollThumb.style.top = scrollThumbPos + 'px';
    scrollThumb.classList.add('active');

    // Reset scroll thumb after inactivity
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      scrollThumb.classList.remove('active');
      scrollThumbPos = 22;
      scrollThumb.style.top = '22px';
      scrollDirection.textContent = 'Scroll detected ✓';
    }, 800);
  }

  // ---- Export Test Results ----
  function exportResults() {
    const total = codeToElement.size;
    const tested = testedKeys.size;
    const pct = total > 0 ? Math.round((tested / total) * 100) : 0;

    const allKeyCodes = Array.from(codeToElement.keys());
    const testedKeyCodes = Array.from(testedKeys);
    const untestedKeyCodes = allKeyCodes.filter(code => !testedKeys.has(code));

    const results = {
      title: 'MicTab Hardware Test Results',
      exportDate: new Date().toISOString(),
      summary: {
        totalKeys: total,
        testedKeys: tested,
        untestedKeys: total - tested,
        coveragePercent: pct
      },
      mouseTest: {
        leftClick: { count: mouseClicks.left, tested: testedMouseButtons.has('left') },
        middleClick: { count: mouseClicks.middle, tested: testedMouseButtons.has('middle') },
        rightClick: { count: mouseClicks.right, tested: testedMouseButtons.has('right') }
      },
      scrollTest: {
        tested: scrollTested,
        eventCount: scrollEventCount
      },
      testedKeyCodes: testedKeyCodes,
      untestedKeyCodes: untestedKeyCodes,
      keyPressLog: keyPressLog
    };

    // Create downloadable file
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mictab-hardware-test-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Results exported successfully!');
  }

  // ---- Reset All Keys ----
  function resetAll() {
    // Clear tracking set
    testedKeys.clear();

    // Remove visual classes from all key elements
    codeToElement.forEach((el) => {
      el.classList.remove('pressed', 'visited');
    });

    // Reset mouse state
    mouseClicks.left = 0;
    mouseClicks.middle = 0;
    mouseClicks.right = 0;
    testedMouseButtons.clear();

    mouseLeftCount.textContent = '0 clicks';
    mouseMiddleCount.textContent = '0 clicks';
    mouseRightCount.textContent = '0 clicks';

    mouseLeftEl.classList.remove('tested', 'pressed');
    mouseMiddleEl.classList.remove('tested', 'pressed');
    mouseRightEl.classList.remove('tested', 'pressed');

    // Reset scroll state
    scrollEventCount = 0;
    scrollTested = false;
    scrollThumbPos = 22;
    scrollThumb.style.top = '22px';
    scrollThumb.classList.remove('active');
    scrollDirection.textContent = 'Scroll to test';
    scrollCountEl.textContent = '0 events detected';

    // Reset key code display
    keyNameDisplay.textContent = 'Press a key...';
    keyNameDisplay.style.color = 'var(--text-tertiary)';
    keyCodeDetail.textContent = '—';
    keyKeyDetail.textContent = '—';
    keyWhichDetail.textContent = '—';

    // Clear press log
    keyPressLog.length = 0;

    // Reset UI counters
    updateUI();

    showToast('All tests reset');
  }

  // ---- Event Listeners ----

  // Global keyboard listeners (listen on document so focus doesn't matter)
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  // Mouse click listeners
  document.addEventListener('mousedown', handleMouseDown);

  // Scroll wheel listener
  document.addEventListener('wheel', handleWheel, { passive: false });

  // Reset button
  btnReset.addEventListener('click', resetAll);

  // Export button
  btnExport.addEventListener('click', exportResults);

  // Prevent context menu from interfering with right-click test
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // ---- Handle Window Blur ----
  // When the window loses focus, release any keys that were pressed
  // (prevents keys getting stuck in "pressed" state if user alt-tabs away)
  window.addEventListener('blur', () => {
    codeToElement.forEach((el) => {
      el.classList.remove('pressed');
    });
  });

  // ---- Initialize ----
  init();
});
