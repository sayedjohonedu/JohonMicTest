/* ============================================
   MicTab Fun & Games - Enhanced Script
   iOS Cream Theme, Massive Content
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================
     TAB STRIP NAVIGATION
     ========================================== */
  const tabItems = document.querySelectorAll('.tab-item');
  const gamePanels = document.querySelectorAll('.game-panel');

  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.game;
      tabItems.forEach(si => si.classList.remove('active'));
      item.classList.add('active');
      gamePanels.forEach(panel => panel.classList.remove('active'));
      const targetPanel = document.getElementById(target);
      if (targetPanel) targetPanel.classList.add('active');
      // Scroll tab into view
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  /** Shuffle array using Fisher-Yates */
  function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /* ==========================================
     1. RANDOM NUMBER PICKER
     ========================================== */
  const pickerMin = document.getElementById('picker-min');
  const pickerMax = document.getElementById('picker-max');
  const pickerCount = document.getElementById('picker-count');
  const pickerExclude = document.getElementById('picker-exclude');
  const pickerBtn = document.getElementById('picker-btn');
  const pickerDisplay = document.getElementById('picker-display');
  const pickerHistoryList = document.getElementById('picker-history-list');
  const pickerHistory = [];

  pickerBtn.addEventListener('click', () => {
    let min = parseInt(pickerMin.value, 10);
    let max = parseInt(pickerMax.value, 10);
    let count = parseInt(pickerCount.value, 10) || 1;
    count = Math.min(Math.max(count, 1), 20);

    if (isNaN(min) || isNaN(max)) { pickerDisplay.textContent = '?!'; return; }
    if (min > max) [min, max] = [max, min];

    const excludeSet = pickerExclude.checked ? new Set(pickerHistory) : new Set();
    const available = [];
    for (let i = min; i <= max; i++) { if (!excludeSet.has(i)) available.push(i); }
    if (available.length < count) { pickerDisplay.textContent = 'N/A'; return; }

    pickerBtn.disabled = true;
    pickerDisplay.classList.add('spinning');
    pickerDisplay.classList.remove('result');

    const totalDuration = 1800;
    const startInterval = 30;
    let elapsed = 0;
    let currentInterval = startInterval;

    const cycle = () => {
      const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
      pickerDisplay.textContent = count === 1 ? randomNum : `${randomNum}, ...`;
      elapsed += currentInterval;

      if (elapsed >= totalDuration) {
        const results = [];
        const pool = [...available];
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * pool.length);
          results.push(pool[idx]);
          pool.splice(idx, 1);
        }
        pickerDisplay.textContent = results.join(', ');
        pickerDisplay.classList.remove('spinning');
        pickerDisplay.classList.add('result');
        pickerBtn.disabled = false;

        results.forEach(r => {
          pickerHistory.unshift(r);
        });
        if (pickerHistory.length > 30) pickerHistory.length = 30;
        renderPickerHistory();
        return;
      }

      const progress = elapsed / totalDuration;
      currentInterval = startInterval + (progress * progress * 300);
      setTimeout(cycle, currentInterval);
    };
    cycle();
  });

  function renderPickerHistory() {
    pickerHistoryList.innerHTML = '';
    pickerHistory.forEach(num => {
      const li = document.createElement('li');
      li.textContent = num;
      pickerHistoryList.appendChild(li);
    });
  }

  /* ==========================================
     2. DICE ROLLER (RPG dice: d4,d6,d8,d10,d12,d20)
     ========================================== */
  const diceContainer = document.getElementById('dice-container');
  const diceRollBtn = document.getElementById('dice-roll-btn');
  const diceTotal = document.getElementById('dice-total');
  const diceHistoryList = document.getElementById('dice-history-list');
  const diceCountBtns = document.querySelectorAll('[data-dice-count]');
  const diceTypeBtns = document.querySelectorAll('[data-dice-type]');
  let diceCount = 2;
  let diceType = 6;
  const diceHistory = [];

  diceCountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diceCountBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      diceCount = parseInt(btn.dataset.diceCount, 10);
      renderDice([]);
    });
  });

  diceTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diceTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      diceType = parseInt(btn.dataset.diceType, 10);
      renderDice([]);
    });
  });

  function createDieElement(value, type) {
    if (type === 6) {
      const die = document.createElement('div');
      die.className = 'die';
      die.dataset.value = value;
      for (let i = 0; i < value; i++) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        die.appendChild(dot);
      }
      return die;
    } else {
      const die = document.createElement('div');
      die.className = 'die-poly';
      const label = document.createElement('span');
      label.className = 'die-poly-label';
      label.textContent = `d${type}`;
      die.appendChild(label);
      die.insertBefore(document.createTextNode(value), die.firstChild);
      return die;
    }
  }

  function renderDice(values) {
    diceContainer.innerHTML = '';
    if (values.length === 0) {
      for (let i = 0; i < diceCount; i++) {
        diceContainer.appendChild(createDieElement('?', diceType));
      }
      diceTotal.textContent = 'Total: 0';
      return;
    }
    values.forEach(val => {
      const die = createDieElement(val, diceType);
      die.classList.add('rolling');
      diceContainer.appendChild(die);
    });
    const sum = values.reduce((a, b) => a + b, 0);
    diceTotal.textContent = `Total: ${sum}`;
  }

  renderDice([]);

  diceRollBtn.addEventListener('click', () => {
    diceRollBtn.disabled = true;
    const totalDuration = 800;
    const interval = 70;
    let elapsed = 0;

    const cycle = () => {
      const tempValues = [];
      for (let i = 0; i < diceCount; i++) {
        tempValues.push(Math.floor(Math.random() * diceType) + 1);
      }
      renderDice(tempValues);
      elapsed += interval;

      if (elapsed >= totalDuration) {
        const finalValues = [];
        for (let i = 0; i < diceCount; i++) {
          finalValues.push(Math.floor(Math.random() * diceType) + 1);
        }
        renderDice(finalValues);
        const sum = finalValues.reduce((a, b) => a + b, 0);
        diceTotal.textContent = `[d${diceType}] Total: ${sum}`;

        diceHistory.unshift({ values: finalValues, total: sum, type: diceType });
        if (diceHistory.length > 15) diceHistory.pop();
        renderDiceHistory();
        diceRollBtn.disabled = false;
        return;
      }
      setTimeout(cycle, interval);
    };
    cycle();
  });

  function renderDiceHistory() {
    diceHistoryList.innerHTML = '';
    diceHistory.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `d${entry.type}[${entry.values.join(', ')}] = ${entry.total}`;
      diceHistoryList.appendChild(li);
    });
  }

  /* ==========================================
     3. COIN FLIPPER (multi-coin + stats)
     ========================================== */
  const coin = document.getElementById('coin');
  const coinFlipBtn = document.getElementById('coin-flip-btn');
  const coinResult = document.getElementById('coin-result');
  const coinHeadsCount = document.getElementById('coin-heads-count');
  const coinTailsCount = document.getElementById('coin-tails-count');
  const coinTotalCount = document.getElementById('coin-total-count');
  const coinHeadsPct = document.getElementById('coin-heads-pct');
  const coinCountSelect = document.getElementById('coin-count');
  let headsCount = 0;
  let tailsCount = 0;
  let coinFlipping = false;

  coinFlipBtn.addEventListener('click', () => {
    if (coinFlipping) return;
    coinFlipping = true;
    coinFlipBtn.disabled = true;
    coinResult.textContent = 'Flipping...';

    const numCoins = parseInt(coinCountSelect.value, 10);
    coin.classList.remove('flipping', 'flipping-tails');
    void coin.offsetWidth;

    // Determine total heads/tails for multi-coin
    let h = 0, t = 0;
    for (let i = 0; i < numCoins; i++) {
      if (Math.random() < 0.5) h++; else t++;
    }

    // Animate the visual coin based on last result
    const isHeads = h >= t;
    if (isHeads) {
      coin.classList.add('flipping');
    } else {
      coin.classList.add('flipping-tails');
    }

    setTimeout(() => {
      headsCount += h;
      tailsCount += t;
      const total = headsCount + tailsCount;

      if (numCoins === 1) {
        coinResult.textContent = h > 0 ? 'Heads!' : 'Tails!';
        coinResult.style.color = h > 0 ? '#d4a017' : '#8e8e93';
      } else {
        coinResult.textContent = `${h} Heads / ${t} Tails`;
        coinResult.style.color = h > t ? '#d4a017' : '#8e8e93';
      }

      coinHeadsCount.textContent = headsCount;
      coinTailsCount.textContent = tailsCount;
      coinTotalCount.textContent = total;
      coinHeadsPct.textContent = total > 0 ? Math.round((headsCount / total) * 100) + '%' : '0%';
      coinFlipping = false;
      coinFlipBtn.disabled = false;
    }, 1600);
  });

  /* ==========================================
     4. RANDOM DECISION MAKER (with animation)
     ========================================== */
  const decisionOptions = document.getElementById('decision-options');
  const decisionBtn = document.getElementById('decision-btn');
  const decisionOptionsList = document.getElementById('decision-options-list');
  const decisionChosen = document.getElementById('decision-chosen');

  decisionBtn.addEventListener('click', () => {
    const raw = decisionOptions.value.trim();
    if (!raw) return;

    const options = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (options.length < 2) return;

    decisionBtn.disabled = true;
    decisionChosen.textContent = '';

    decisionOptionsList.innerHTML = '';
    const optionEls = options.map(opt => {
      const div = document.createElement('div');
      div.className = 'decision-option';
      div.textContent = opt;
      decisionOptionsList.appendChild(div);
      return div;
    });

    let currentIndex = 0;
    const totalCycles = options.length * 3 + Math.floor(Math.random() * options.length);
    let cycleCount = 0;
    let delay = 50;

    const highlight = () => {
      optionEls.forEach(el => el.classList.remove('highlighting', 'chosen'));
      optionEls[currentIndex].classList.add('highlighting');
      currentIndex = (currentIndex + 1) % options.length;
      cycleCount++;

      if (cycleCount >= totalCycles) {
        const winnerIndex = Math.floor(Math.random() * options.length);
        optionEls.forEach(el => el.classList.remove('highlighting'));
        optionEls[winnerIndex].classList.add('chosen');
        decisionChosen.textContent = `🎉 ${options[winnerIndex]}`;
        decisionBtn.disabled = false;
        return;
      }

      const progress = cycleCount / totalCycles;
      delay = 50 + progress * progress * 300;
      setTimeout(highlight, delay);
    };
    highlight();
  });

  /* ==========================================
     5. TRUTH OR DARE — 45 truths + 45 dares, 3 levels
     ========================================== */
  const truthBtn = document.getElementById('truth-btn');
  const dareBtn = document.getElementById('dare-btn');
  const tdType = document.getElementById('td-type');
  const tdText = document.getElementById('td-text');
  const tdCounter = document.getElementById('td-counter');
  const tdResetBtn = document.getElementById('td-reset-btn');
  const tdLevelBtns = document.querySelectorAll('[data-td-level]');

  let tdLevel = 'mild';

  tdLevelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tdLevelBtns.forEach(b => { b.className = 'btn-pill'; });
      btn.classList.add(btn.dataset.tdLevel === 'mild' ? 'active-green' : btn.dataset.tdLevel === 'moderate' ? 'active-orange' : 'active-red');
      tdLevel = btn.dataset.tdLevel;
    });
  });

  // MILD TRUTHS (16)
  const mildTruths = [
    "What is the most embarrassing song you secretly love?",
    "What is the weirdest dream you have ever had?",
    "What is a secret skill you have that no one knows about?",
    "What is the most childish thing you still do?",
    "What is the most useless talent you have?",
    "What is something you pretend to like but actually cannot stand?",
    "What is the strangest compliment you have ever received?",
    "What is a nickname you have that you are embarrassed by?",
    "What is the worst haircut you have ever had?",
    "If you had to eat one meal for the rest of your life, what would it be?",
    "What is the most unusual place you have fallen asleep?",
    "What is the silliest reason you have ever cried?",
    "What is the most overrated thing that everyone seems to love?",
    "What is a movie that makes you cry every single time?",
    "What is the last thing you searched for on your phone?",
    "What is a weird food combination that you secretly enjoy?"
  ];

  // MODERATE TRUTHS (16)
  const moderateTruths = [
    "What is the biggest lie you have ever told without getting caught?",
    "What is the most ridiculous thing you have ever done to impress someone?",
    "What is the most awkward date you have ever been on?",
    "What is one thing you would change about your appearance if you could?",
    "What is the most embarrassing thing your parents have caught you doing?",
    "What is the pettiest thing you have ever gotten upset about?",
    "What is the most embarrassing autocorrect fail you have sent?",
    "What is the most cringe thing you did as a teenager?",
    "If you could swap lives with anyone for a week, who would it be?",
    "What is the most trouble you have ever been in at school?",
    "What is a trend you followed that you now think is ridiculous?",
    "What is the most embarrassing thing you have worn in public?",
    "If you could be invisible for a day, what would you do?",
    "What is a secret you have never told anyone in this room?",
    "What is the longest you have gone without showering?",
    "What is the biggest regret you have from the past year?"
  ];

  // SPICY TRUTHS (16)
  const spicyTruths = [
    "What is the most scandalous thing you have ever done at a party?",
    "Who in this room do you trust the least and why?",
    "What is the most illegal thing you have ever done?",
    "What is the biggest secret you are keeping from your best friend?",
    "What is the most shocking thing you have ever overheard?",
    "Have you ever lied to get out of plans with someone in this room?",
    "What is the most embarrassing thing you have done for love?",
    "What is the worst thing you have ever said about someone behind their back?",
    "What is the most unhinged text message in your phone right now?",
    "Have you ever been caught doing something you really should not have been doing?",
    "What is the most rebellious thing you have ever done?",
    "If your search history was made public, what would be the most embarrassing thing found?",
    "What is the most shameful thing you have done for money?",
    "What is the biggest stereotype you secretly believe is true?",
    "What is the most toxic trait you know you have but refuse to fix?",
    "What is the most embarrassing photo or video on your phone?"
  ];

  // MILD DARES (16)
  const mildDares = [
    "Do your best impression of a famous person for 30 seconds.",
    "Speak in an accent for the next 3 rounds.",
    "Do 20 pushups right now.",
    "Sing the chorus of the last song you listened to.",
    "Do your best robot dance for 15 seconds.",
    "Walk like a penguin across the room.",
    "Make the funniest face you can and hold it for 10 seconds.",
    "Act out a scene from your favorite movie without words.",
    "Try to juggle three random objects for 15 seconds.",
    "Stand up and do 10 jumping jacks as fast as you can.",
    "Make up a short rap about the person to your left.",
    "Walk across the room with your eyes closed.",
    "Say the alphabet backwards as fast as you can.",
    "Tell a joke with no expression on your face.",
    "Balance a book on your head and walk across the room.",
    "Do your best impression of a news reporter reporting on something silly."
  ];

  // MODERATE DARES (16)
  const moderateDares = [
    "Let the group post something on your social media.",
    "Call a friend and tell them you love them out of nowhere.",
    "Let someone style your hair however they want.",
    "Text the third person in your contacts 'I need to tell you something important.'",
    "Hold a plank for 30 seconds while saying the alphabet.",
    "Do a dramatic reading of the last text message you received.",
    "Speak only in questions for the next 2 rounds.",
    "Do your best impression of someone in the room.",
    "Try to lick your elbow while everyone watches.",
    "Do a 15-second commercial for an item in the room.",
    "Let the group choose a song for you to dance to for 20 seconds.",
    "Spin around 10 times and then try to walk in a straight line.",
    "Talk without closing your mouth for the next minute.",
    "Let the group draw something on your arm with a pen.",
    "Smell everyone's feet and rank them from best to worst.",
    "Let someone go through your camera roll for 30 seconds."
  ];

  // SPICY DARES (16)
  const spicyDares = [
    "Post an embarrassing photo of yourself on social media right now.",
    "Let the group send a text to anyone in your contacts saying whatever they want.",
    "Call the 5th person in your recent calls and flirt with them for 30 seconds.",
    "Let someone in the group go through your phone for one minute.",
    "Eat a spoonful of whatever condiment the group chooses.",
    "Do your most attractive pose and let the group rate it out of 10.",
    "Reveal the last five things you searched on your phone.",
    "Let the group pick a filter and take a selfie to post on your story.",
    "Imitate your crush or partner and let the group guess who it is.",
    "Do a dramatic reading of your most embarrassing chat with someone.",
    "Let the group compose a message to your most recent contact and send it.",
    "Do 30 squats while saying something flattering about each person in the room.",
    "Show the last photo you saved on your phone.",
    "Record a 10-second video of yourself doing something ridiculous and post it.",
    "Give your phone to the group for 1 minute — no restrictions.",
    "Share the most awkward text conversation you have ever had."
  ];

  const truthSets = { mild: mildTruths, moderate: moderateTruths, spicy: spicyTruths };
  const dareSets = { mild: mildDares, moderate: moderateDares, spicy: spicyDares };

  // "Never repeat" using localStorage
  function getUsedTD() {
    try { return JSON.parse(localStorage.getItem('mictab_td_used') || '{}'); } catch { return {}; }
  }
  function saveUsedTD(used) {
    try { localStorage.setItem('mictab_td_used', JSON.stringify(used)); } catch {}
  }

  function getNextItem(set, type, level) {
    const used = getUsedTD();
    const key = `${type}_${level}`;
    const usedIndices = used[key] || [];
    const available = [];
    for (let i = 0; i < set.length; i++) {
      if (!usedIndices.includes(i)) available.push(i);
    }
    // Reset if all used
    if (available.length === 0) {
      used[key] = [];
      saveUsedTD(used);
      for (let i = 0; i < set.length; i++) available.push(i);
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    used[key] = used[key] || [];
    used[key].push(chosen);
    saveUsedTD(used);
    updateTDCounter(set.length, used[key].length);
    return chosen;
  }

  function updateTDCounter(total, used) {
    const remaining = total - used;
    tdCounter.textContent = `${remaining} of ${total} remaining at this level`;
  }

  truthBtn.addEventListener('click', () => {
    const set = truthSets[tdLevel];
    const index = getNextItem(set, 'truth', tdLevel);
    tdType.textContent = `Truth — ${tdLevel.charAt(0).toUpperCase() + tdLevel.slice(1)}`;
    tdType.className = 'td-type truth';
    tdText.className = 'td-text';
    void tdText.offsetWidth;
    tdText.classList.add('animate-in');
    tdText.textContent = set[index];
  });

  dareBtn.addEventListener('click', () => {
    const set = dareSets[tdLevel];
    const index = getNextItem(set, 'dare', tdLevel);
    tdType.textContent = `Dare — ${tdLevel.charAt(0).toUpperCase() + tdLevel.slice(1)}`;
    tdType.className = 'td-type dare';
    tdText.className = 'td-text';
    void tdText.offsetWidth;
    tdText.classList.add('animate-in');
    tdText.textContent = set[index];
  });

  tdResetBtn.addEventListener('click', () => {
    localStorage.removeItem('mictab_td_used');
    tdCounter.textContent = 'History cleared!';
    setTimeout(() => { tdCounter.textContent = ''; }, 2000);
  });

  /* ==========================================
     6. WOULD YOU RATHER — 50+ questions, 3 levels, stats
     ========================================== */
  const wyrOptionA = document.getElementById('wyr-option-a');
  const wyrOptionB = document.getElementById('wyr-option-b');
  const wyrTextA = document.getElementById('wyr-text-a');
  const wyrTextB = document.getElementById('wyr-text-b');
  const wyrNextBtn = document.getElementById('wyr-next-btn');
  const wyrLevelBtns = document.querySelectorAll('[data-wyr-level]');
  const wyrStatsDiv = document.getElementById('wyr-stats');
  const wyrBarA = document.getElementById('wyr-bar-a');
  const wyrBarB = document.getElementById('wyr-bar-b');
  const wyrPctA = document.getElementById('wyr-pct-a');
  const wyrPctB = document.getElementById('wyr-pct-b');

  let wyrLevel = 'fun';

  wyrLevelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wyrLevelBtns.forEach(b => { b.className = 'btn-pill'; });
      const cls = btn.dataset.wyrLevel === 'fun' ? 'active' : btn.dataset.wyrLevel === 'deep' ? 'active-purple' : 'active-red';
      btn.classList.add(cls);
      wyrLevel = btn.dataset.wyrLevel;
    });
  });

  // FUN WYR (18)
  const funWyr = [
    { a: "Have the ability to fly", b: "Have the ability to turn invisible" },
    { a: "Only eat pizza for a year", b: "Only eat tacos for a year" },
    { a: "Have a personal chef", b: "Have a personal trainer" },
    { a: "Always have perfect weather", b: "Always have perfect WiFi" },
    { a: "Have free flights for life", b: "Have free hotel stays for life" },
    { a: "Be a master at every instrument", b: "Be a master at every sport" },
    { a: "Have a personal theme song that plays wherever you go", b: "Have thought bubbles appear above your head" },
    { a: "Always be 10 minutes late", b: "Always be 20 minutes early" },
    { a: "Live in the mountains", b: "Live on the beach" },
    { a: "Have unlimited money", b: "Have unlimited time" },
    { a: "Only watch movies forever", b: "Only read books forever" },
    { a: "Have the power of telekinesis", b: "Have the power of teleportation" },
    { a: "Be able to talk to animals", b: "Speak every human language fluently" },
    { a: "Have super strength", b: "Have super speed" },
    { a: "Never have to sleep again", b: "Never have to eat again" },
    { a: "Be the funniest person in the room", b: "Be the smartest person in the room" },
    { a: "Only use a flip phone forever", b: "Only use a desktop computer forever" },
    { a: "Have an unlimited gift card to one store", b: "Have a 50% off coupon for every store" }
  ];

  // DEEP THINK WYR (18)
  const deepWyr = [
    { a: "Have a rewind button for your life", b: "Have a pause button for your life" },
    { a: "Always know when someone is lying", b: "Always get away with lying" },
    { a: "Live 100 years in the past", b: "Live 100 years in the future" },
    { a: "Know the date of your death", b: "Know the cause of your death" },
    { a: "Be able to read minds", b: "Be able to see the future" },
    { a: "Give up all vacations for 5 years", b: "Give up all weekends for 2 years" },
    { a: "Have your dream job with low pay", b: "Have a boring job with amazing pay" },
    { a: "Be famous for something embarrassing", b: "Be completely unknown but wealthy" },
    { a: "Have no internet for a month", b: "Have no hot water for a month" },
    { a: "Have a time machine that only goes backward", b: "Have a time machine that only goes forward" },
    { a: "Live in a world with no music", b: "Live in a world with no color" },
    { a: "Know all the secrets of the universe but be unable to share them", b: "Never know the secrets but live in blissful ignorance" },
    { a: "Have everyone know exactly what you think of them", b: "Never know what anyone thinks of you" },
    { a: "Relive your best memory forever", b: "Always have something new to look forward to" },
    { a: "Be loved by everyone but love no one", b: "Love everyone but be loved by no one" },
    { a: "Be remembered forever for something terrible", b: "Be completely forgotten after you die" },
    { a: "Have the power to heal any physical wound", b: "Have the power to heal any emotional wound" },
    { a: "Always know the right thing to say", b: "Always know the right thing to do" }
  ];

  // EXTREME WYR (18)
  const extremeWyr = [
    { a: "Survive a zombie apocalypse alone", b: "Survive a zombie apocalypse with someone you hate" },
    { a: "Lose all your memories from the past 10 years", b: "Never be able to form new memories again" },
    { a: "Be stranded on a desert island with your worst enemy", b: "Be stranded alone forever" },
    { a: "Have to eat bugs for every meal for a month", b: "Not eat anything for a week" },
    { a: "Lose your sight", b: "Lose your hearing" },
    { a: "Live in constant physical pain", b: "Live in constant emotional pain" },
    { a: "Have everyone you love forget you exist", b: "Have to forget everyone you love" },
    { a: "Spend 10 years in prison for a crime you didn't commit", b: "Commit a crime and get away with it but live with the guilt forever" },
    { a: "Never be able to feel happiness", b: "Never be able to feel sadness" },
    { a: "Know exactly when the world will end", b: "Never know and live in constant uncertainty" },
    { a: "Have to choose who lives and who dies in a life-or-death situation", b: "Let random chance decide" },
    { a: "Give up all your possessions", b: "Give up all your relationships" },
    { a: "Be able to save one person you love or 100 strangers", b: "Be forced to choose every single time" },
    { a: "Have your deepest secret broadcast to the world", b: "Never be able to speak again" },
    { a: "Live a short amazing life", b: "Live a long miserable life" },
    { a: "Always know when someone is going to die", b: "Never know and be surprised every time" },
    { a: "Lose all your money and start over", b: "Lose all your friends and start over" },
    { a: "Be the one who makes the hard decisions", b: "Be the one who has to live with them" }
  ];

  const wyrSets = { fun: funWyr, deep: deepWyr, extreme: extremeWyr };

  // Stats tracking for WYR
  let wyrStats = {};
  try { wyrStats = JSON.parse(localStorage.getItem('mictab_wyr_stats') || '{}'); } catch {}

  function saveWyrStats() {
    try { localStorage.setItem('mictab_wyr_stats', JSON.stringify(wyrStats)); } catch {}
  }

  let currentWyrKey = null;

  function showWyrStats(key) {
    const stats = wyrStats[key];
    if (stats && (stats.a > 0 || stats.b > 0)) {
      const total = stats.a + stats.b;
      const pctA = Math.round((stats.a / total) * 100);
      const pctB = 100 - pctA;
      wyrBarA.style.width = pctA + '%';
      wyrBarB.style.width = pctB + '%';
      wyrPctA.textContent = `${pctA}% chose A`;
      wyrPctB.textContent = `${pctB}% chose B`;
      wyrStatsDiv.style.display = 'flex';
    } else {
      wyrStatsDiv.style.display = 'none';
    }
  }

  // Click on options to vote
  wyrOptionA.addEventListener('click', () => {
    if (!currentWyrKey) return;
    if (!wyrStats[currentWyrKey]) wyrStats[currentWyrKey] = { a: 0, b: 0 };
    wyrStats[currentWyrKey].a++;
    saveWyrStats();
    wyrOptionA.classList.add('chosen-a');
    wyrOptionB.classList.remove('chosen-b');
    showWyrStats(currentWyrKey);
  });

  wyrOptionB.addEventListener('click', () => {
    if (!currentWyrKey) return;
    if (!wyrStats[currentWyrKey]) wyrStats[currentWyrKey] = { a: 0, b: 0 };
    wyrStats[currentWyrKey].b++;
    saveWyrStats();
    wyrOptionB.classList.add('chosen-b');
    wyrOptionA.classList.remove('chosen-a');
    showWyrStats(currentWyrKey);
  });

  wyrNextBtn.addEventListener('click', () => {
    const set = wyrSets[wyrLevel];
    const index = Math.floor(Math.random() * set.length);
    const scenario = set[index];
    currentWyrKey = `${wyrLevel}_${index}`;
    wyrTextA.textContent = scenario.a;
    wyrTextB.textContent = scenario.b;
    wyrOptionA.classList.remove('chosen-a');
    wyrOptionB.classList.remove('chosen-b');

    wyrOptionA.classList.remove('animate-in');
    wyrOptionB.classList.remove('animate-in');
    void wyrOptionA.offsetWidth;
    wyrOptionA.classList.add('animate-in');
    wyrOptionB.classList.add('animate-in');

    showWyrStats(currentWyrKey);
  });

  /* ==========================================
     7. TRIVIA QUIZ — 50+ questions, 3 difficulty, timer, streak
     ========================================== */
  const quizContainer = document.getElementById('quiz-container');
  const quizProgress = document.getElementById('quiz-progress');
  const quizScore = document.getElementById('quiz-score');
  const quizCategory = document.getElementById('quiz-category');
  const quizQuestion = document.getElementById('quiz-question');
  const quizOptions = document.getElementById('quiz-options');
  const quizStartBtn = document.getElementById('quiz-start-btn');
  const quizResult = document.getElementById('quiz-result');
  const quizFinalScore = document.getElementById('quiz-final-score');
  const quizRestartBtn = document.getElementById('quiz-restart-btn');
  const quizLevelBtns = document.querySelectorAll('[data-quiz-level]');
  const quizTimerFill = document.getElementById('quiz-timer-fill');
  const quizStreak = document.getElementById('quiz-streak');
  const quizBreakdown = document.getElementById('quiz-breakdown');

  let quizLevel = 'easy';

  quizLevelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      quizLevelBtns.forEach(b => { b.className = 'btn-pill'; });
      const cls = btn.dataset.quizLevel === 'easy' ? 'active-green' : btn.dataset.quizLevel === 'medium' ? 'active-orange' : btn.dataset.quizLevel === 'hard' ? 'active-red' : 'active-purple';
      btn.classList.add(cls);
      quizLevel = btn.dataset.quizLevel;
    });
  });

  // EASY QUESTIONS (17)
  const easyTrivia = [
    { category: "Science", question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
    { category: "Science", question: "What is the chemical symbol for water?", options: ["H2O", "CO2", "O2", "NaCl"], answer: 0 },
    { category: "History", question: "Who was the first President of the United States?", options: ["Jefferson", "Adams", "Washington", "Franklin"], answer: 2 },
    { category: "Geography", question: "What is the largest continent by area?", options: ["Africa", "North America", "Asia", "Europe"], answer: 2 },
    { category: "Entertainment", question: "What is the name of Harry Potter's pet owl?", options: ["Hedwig", "Errol", "Pigwidgeon", "Hermes"], answer: 0 },
    { category: "Sports", question: "How many players are on a standard soccer team on the field?", options: ["9", "10", "11", "12"], answer: 2 },
    { category: "Technology", question: "What does 'www' stand for?", options: ["World Wide Web", "Western Web Works", "Wide World Web", "Web World Wide"], answer: 0 },
    { category: "Food", question: "What fruit is known as the 'king of fruits'?", options: ["Mango", "Durian", "Apple", "Banana"], answer: 1 },
    { category: "Nature", question: "What is the tallest type of tree?", options: ["Oak", "Redwood", "Pine", "Maple"], answer: 1 },
    { category: "Literature", question: "Who wrote 'Romeo and Juliet'?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], answer: 1 },
    { category: "Arts", question: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Monet"], answer: 2 },
    { category: "Geography", question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], answer: 2 },
    { category: "Science", question: "How many legs does a spider have?", options: ["6", "8", "10", "12"], answer: 1 },
    { category: "Entertainment", question: "Which band released 'Abbey Road'?", options: ["Stones", "Beatles", "Zeppelin", "Floyd"], answer: 1 },
    { category: "Sports", question: "In which sport do you perform a slam dunk?", options: ["Volleyball", "Basketball", "Tennis", "Handball"], answer: 1 },
    { category: "Technology", question: "What year was the first iPhone released?", options: ["2005", "2006", "2007", "2008"], answer: 2 },
    { category: "Nature", question: "What is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], answer: 1 }
  ];

  // MEDIUM QUESTIONS (17)
  const mediumTrivia = [
    { category: "Science", question: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], answer: 2 },
    { category: "Science", question: "How many bones are in the adult human body?", options: ["186", "206", "226", "256"], answer: 1 },
    { category: "History", question: "In what year did the Titanic sink?", options: ["1905", "1912", "1918", "1923"], answer: 1 },
    { category: "Geography", question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
    { category: "Entertainment", question: "Which actor played Iron Man in the MCU?", options: ["Evans", "Downey Jr.", "Hemsworth", "Ruffalo"], answer: 1 },
    { category: "Sports", question: "How many rings are on the Olympic flag?", options: ["3", "4", "5", "6"], answer: 2 },
    { category: "Technology", question: "What does CPU stand for?", options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Utility"], answer: 1 },
    { category: "Food", question: "What country is the origin of the dish 'paella'?", options: ["Italy", "Mexico", "Spain", "Greece"], answer: 2 },
    { category: "Literature", question: "Who wrote '1984'?", options: ["Huxley", "Orwell", "Bradbury", "Atwood"], answer: 1 },
    { category: "Arts", question: "In which city is the Louvre museum located?", options: ["London", "Rome", "Paris", "Berlin"], answer: 2 },
    { category: "Nature", question: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Horse", "Gazelle"], answer: 1 },
    { category: "History", question: "What year did World War II end?", options: ["1943", "1944", "1945", "1946"], answer: 2 },
    { category: "Geography", question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Brisbane"], answer: 2 },
    { category: "Science", question: "Which organ produces insulin?", options: ["Liver", "Kidney", "Pancreas", "Spleen"], answer: 2 },
    { category: "Entertainment", question: "What is the fictional country in Black Panther?", options: ["Zamunda", "Wakanda", "Genovia", "Latveria"], answer: 1 },
    { category: "Sports", question: "What country has won the most FIFA World Cups?", options: ["Germany", "Italy", "Argentina", "Brazil"], answer: 3 },
    { category: "Technology", question: "What programming language is known as the 'language of the web'?", options: ["Python", "Java", "JavaScript", "C++"], answer: 2 }
  ];

  // HARD QUESTIONS (17)
  const hardTrivia = [
    { category: "Science", question: "What is the half-life of Carbon-14?", options: ["1,500 years", "3,700 years", "5,730 years", "8,200 years"], answer: 2 },
    { category: "Science", question: "What is the Chandrasekhar limit measured in?", options: ["Light years", "Solar masses", "Kelvin", "Joules"], answer: 1 },
    { category: "History", question: "Which treaty ended World War I?", options: ["Treaty of Paris", "Treaty of Versailles", "Treaty of Ghent", "Treaty of Tordesillas"], answer: 1 },
    { category: "Geography", question: "What is the deepest point in the ocean?", options: ["Tonga Trench", "Mariana Trench", "Java Trench", "Puerto Rico Trench"], answer: 1 },
    { category: "Entertainment", question: "Which film won the first Academy Award for Best Picture?", options: ["Sunrise", "Wings", "The Jazz Singer", "Metropolis"], answer: 1 },
    { category: "Sports", question: "In which year were the first modern Olympic Games held?", options: ["1892", "1896", "1900", "1904"], answer: 1 },
    { category: "Technology", question: "Who is considered the inventor of the World Wide Web?", options: ["Vint Cerf", "Tim Berners-Lee", "Steve Jobs", "Bill Gates"], answer: 1 },
    { category: "Literature", question: "Who wrote 'One Hundred Years of Solitude'?", options: ["Borges", "Neruda", "García Márquez", "Vargas Llosa"], answer: 2 },
    { category: "Arts", question: "What art movement is Salvador Dalí most associated with?", options: ["Cubism", "Impressionism", "Surrealism", "Dadaism"], answer: 2 },
    { category: "Nature", question: "What is the only mammal capable of true flight?", options: ["Flying squirrel", "Bat", "Sugar glider", "Colugo"], answer: 1 },
    { category: "Science", question: "What is the most abundant element in the universe?", options: ["Helium", "Oxygen", "Carbon", "Hydrogen"], answer: 3 },
    { category: "History", question: "What was the last Pharaoh of ancient Egypt?", options: ["Nefertiti", "Hatshepsut", "Cleopatra VII", "Ramesses II"], answer: 2 },
    { category: "Geography", question: "Which country has the most natural lakes?", options: ["United States", "Russia", "Canada", "Finland"], answer: 2 },
    { category: "Technology", question: "What was the first message sent over the internet?", options: ["HELLO", "LOGIN", "LO", "LINK"], answer: 2 },
    { category: "Food", question: "What is the most expensive spice in the world by weight?", options: ["Vanilla", "Cardamom", "Saffron", "Truffle salt"], answer: 2 },
    { category: "Science", question: "What is the speed of light in km/s approximately?", options: ["150,000", "200,000", "300,000", "400,000"], answer: 2 },
    { category: "Arts", question: "Who composed 'The Rite of Spring'?", options: ["Debussy", "Ravel", "Stravinsky", "Prokofiev"], answer: 2 }
  ];

  const triviaSets = { easy: easyTrivia, medium: mediumTrivia, hard: hardTrivia };

  let quizCurrentQuestions = [];
  let quizCurrentIndex = 0;
  let quizCurrentScore = 0;
  let quizActive = false;
  let quizTimerInterval = null;
  let quizTimeLeft = 15;
  let quizStreakCount = 0;
  let quizDiffBreakdown = {};

  function startQuiz() {
    let pool;
    if (quizLevel === 'mixed') {
      pool = [...easyTrivia, ...mediumTrivia, ...hardTrivia];
    } else {
      pool = triviaSets[quizLevel];
    }
    quizCurrentQuestions = shuffleArray(pool).slice(0, 10);
    quizCurrentIndex = 0;
    quizCurrentScore = 0;
    quizStreakCount = 0;
    quizDiffBreakdown = {};
    quizActive = true;

    quizResult.style.display = 'none';
    quizContainer.style.display = 'block';
    quizStartBtn.style.display = 'none';

    showQuizQuestion();
  }

  function startQuizTimer() {
    quizTimeLeft = 15;
    quizTimerFill.style.width = '100%';
    quizTimerFill.className = 'quiz-timer-fill';
    clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
      quizTimeLeft -= 0.1;
      const pct = Math.max(0, (quizTimeLeft / 15) * 100);
      quizTimerFill.style.width = pct + '%';
      if (quizTimeLeft <= 5) quizTimerFill.className = 'quiz-timer-fill danger';
      else if (quizTimeLeft <= 8) quizTimerFill.className = 'quiz-timer-fill warning';
      if (quizTimeLeft <= 0) {
        clearInterval(quizTimerInterval);
        handleQuizAnswer(-1); // Time's up
      }
    }, 100);
  }

  function showQuizQuestion() {
    if (quizCurrentIndex >= quizCurrentQuestions.length) {
      endQuiz();
      return;
    }

    const q = quizCurrentQuestions[quizCurrentIndex];
    quizProgress.textContent = `Question ${quizCurrentIndex + 1} / ${quizCurrentQuestions.length}`;
    quizScore.textContent = `Score: ${quizCurrentScore}`;
    quizStreak.textContent = quizStreakCount > 1 ? `🔥 ${quizStreakCount} streak!` : '';

    const diffTag = quizLevel === 'mixed' ?
      (easyTrivia.includes(q) ? '<span class="badge badge-easy">Easy</span>' :
       mediumTrivia.includes(q) ? '<span class="badge badge-medium">Medium</span>' :
       '<span class="badge badge-hard">Hard</span>') : '';
    quizCategory.innerHTML = `${q.category} ${diffTag}`;

    quizQuestion.textContent = q.question;
    quizOptions.innerHTML = '';
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleQuizAnswer(i));
      quizOptions.appendChild(btn);
    });

    startQuizTimer();
  }

  function handleQuizAnswer(selectedIndex) {
    if (!quizActive) return;
    quizActive = false;
    clearInterval(quizTimerInterval);

    const q = quizCurrentQuestions[quizCurrentIndex];
    const optionBtns = quizOptions.querySelectorAll('.quiz-option');
    optionBtns.forEach(btn => btn.disabled = true);

    optionBtns[q.answer].classList.add('correct');

    const isCorrect = selectedIndex === q.answer;
    if (isCorrect) {
      quizCurrentScore++;
      quizStreakCount++;
      quizScore.textContent = `Score: ${quizCurrentScore}`;
    } else {
      if (selectedIndex >= 0) optionBtns[selectedIndex].classList.add('incorrect');
      quizStreakCount = 0;
    }

    // Track breakdown
    const diff = easyTrivia.includes(q) ? 'Easy' : mediumTrivia.includes(q) ? 'Medium' : 'Hard';
    if (!quizDiffBreakdown[diff]) quizDiffBreakdown[diff] = { correct: 0, total: 0 };
    quizDiffBreakdown[diff].total++;
    if (isCorrect) quizDiffBreakdown[diff].correct++;

    setTimeout(() => {
      quizCurrentIndex++;
      quizActive = true;
      showQuizQuestion();
    }, 1200);
  }

  function endQuiz() {
    quizActive = false;
    clearInterval(quizTimerInterval);
    quizContainer.style.display = 'none';
    quizResult.style.display = 'block';
    const total = quizCurrentQuestions.length;
    const pct = Math.round((quizCurrentScore / total) * 100);
    quizFinalScore.textContent = `${quizCurrentScore} / ${total} (${pct}%)`;

    // Breakdown
    let bdHtml = '';
    for (const [diff, data] of Object.entries(quizDiffBreakdown)) {
      bdHtml += `<div class="quiz-breakdown-row"><span class="quiz-breakdown-label">${diff}</span><span class="quiz-breakdown-value">${data.correct}/${data.total}</span></div>`;
    }
    quizBreakdown.innerHTML = bdHtml;
  }

  quizStartBtn.addEventListener('click', startQuiz);
  quizRestartBtn.addEventListener('click', startQuiz);

  /* ==========================================
     8. TYPING SPEED TEST — 10+ passages, difficulties, leaderboard
     ========================================== */
  const typingText = document.getElementById('typing-text');
  const typingInput = document.getElementById('typing-input');
  const typingStartBtn = document.getElementById('typing-start-btn');
  const typingResetBtn = document.getElementById('typing-reset-btn');
  const typingTimerEl = document.getElementById('typing-timer');
  const typingWpmEl = document.getElementById('typing-wpm');
  const typingAccuracyEl = document.getElementById('typing-accuracy');
  const typingCharsEl = document.getElementById('typing-chars');
  const typingErrorsEl = document.getElementById('typing-errors');
  const typingDiffBtns = document.querySelectorAll('[data-typing-diff]');
  const typingLbList = document.getElementById('typing-lb-list');

  let typingDiff = 'short';

  typingDiffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typingDiffBtns.forEach(b => { b.className = 'btn-pill'; });
      btn.classList.add(btn.dataset.typingDiff === 'short' ? 'active-green' : btn.dataset.typingDiff === 'medium' ? 'active-orange' : 'active-red');
      typingDiff = btn.dataset.typingDiff;
    });
  });

  // SHORT passages (4)
  const shortPassages = [
    "The quick brown fox jumps over the lazy dog near the riverbank while the sun sets behind the mountains.",
    "Technology has changed the way we live work and communicate with each other every single day around the world.",
    "Cooking is both an art and a science that brings people together around the table for a shared experience.",
    "Music has the power to transport us to different times and places with just a few notes of a familiar melody."
  ];

  // MEDIUM passages (4)
  const mediumPassages = [
    "The ocean covers more than seventy percent of the surface of our planet and remains one of the most mysterious and unexplored places on Earth. Deep below the waves there are creatures that have never been seen by human eyes and ecosystems that thrive in complete darkness.",
    "A good book can take you on an incredible journey without ever leaving your chair. The words on the page paint vivid pictures in your mind and the characters become like old friends. Reading opens doors to new worlds ideas and perspectives that you might never encounter in everyday life.",
    "The art of photography is about capturing a moment in time and preserving it forever. Whether it is a stunning landscape a candid portrait or an abstract composition a photograph tells a story that words alone sometimes cannot convey. Every image holds a piece of the photographer's vision.",
    "Gardening teaches patience and the value of nurturing something over time. From planting a tiny seed to watching it grow into a flourishing plant the process is deeply rewarding. There is something magical about getting your hands dirty and watching life spring from the soil."
  ];

  // LONG passages (4)
  const longPassages = [
    "The quick brown fox jumps over the lazy dog near the riverbank while the sun sets behind the mountains. Birds fly across the orange sky and the wind whispers through the tall grass. A small boat drifts quietly on the water as the evening approaches and the world begins to slow down for the night. The stars will soon appear one by one painting the sky with their distant light and the moon will rise to take its place above the peaceful landscape.",
    "Technology has changed the way we live work and communicate with each other every single day. From the moment we wake up and check our phones to the time we go to sleep we are surrounded by digital tools and devices. The internet connects us to people across the globe while artificial intelligence helps us solve complex problems that once seemed impossible to tackle. Innovation continues to push the boundaries of what we thought was achievable and the pace of change shows no signs of slowing down.",
    "Music has the power to transport us to different times and places with just a few notes. A familiar melody can bring back memories we thought were lost forever while a new rhythm can inspire feelings we never knew we had. Whether classical or modern loud or soft music speaks a universal language that transcends borders and cultures and connects people in ways that words alone simply cannot describe or fully capture. It is the soundtrack to our lives accompanying us through joy and sorrow alike.",
    "The art of cooking is a celebration of creativity and tradition that spans every culture on earth. From the simplest bowl of soup to the most elaborate feast every dish tells a story about the people and places that created it. The kitchen is a place of transformation where raw ingredients become something greater than the sum of their parts. Whether you are a professional chef or a home cook the act of preparing a meal with love and care is one of the most meaningful things we can do for one another."
  ];

  const typingSets = { short: shortPassages, medium: mediumPassages, long: longPassages };

  let typingCurrentText = '';
  let typingStartTime = null;
  let typingTimerInterval = null;
  let typingActive = false;
  let typingFinished = false;

  function initTypingTest() {
    const set = typingSets[typingDiff];
    typingCurrentText = set[Math.floor(Math.random() * set.length)];
    typingInput.value = '';
    typingInput.disabled = true;
    typingActive = false;
    typingFinished = false;
    typingStartTime = null;
    clearInterval(typingTimerInterval);
    typingTimerEl.textContent = '0s';
    typingWpmEl.textContent = '0';
    typingAccuracyEl.textContent = '100%';
    typingCharsEl.textContent = '0';
    typingErrorsEl.textContent = '0';
    renderTypingText(0);
  }

  function renderTypingText(typedLength) {
    let html = '';
    for (let i = 0; i < typingCurrentText.length; i++) {
      let cls = 'char';
      if (i < typedLength) {
        cls += typingInput.value[i] === typingCurrentText[i] ? ' correct' : ' incorrect';
      } else if (i === typedLength) {
        cls += ' current';
      }
      const char = typingCurrentText[i] === ' ' ? '&nbsp;' : typingCurrentText[i];
      html += `<span class="${cls}">${char}</span>`;
    }
    typingText.innerHTML = html;
  }

  function updateTypingStats() {
    if (!typingStartTime) return;
    const elapsed = (Date.now() - typingStartTime) / 1000;
    const minutes = elapsed / 60;
    const typed = typingInput.value.length;
    const words = typingInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
    const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
    typingWpmEl.textContent = wpm;

    let correctChars = 0, errors = 0;
    for (let i = 0; i < typed; i++) {
      if (typingInput.value[i] === typingCurrentText[i]) correctChars++;
      else errors++;
    }
    const accuracy = typed > 0 ? Math.round((correctChars / typed) * 100) : 100;
    typingAccuracyEl.textContent = `${accuracy}%`;
    typingCharsEl.textContent = typed;
    typingErrorsEl.textContent = errors;
    typingTimerEl.textContent = `${Math.floor(elapsed)}s`;
  }

  function saveTypingLeaderboard(wpm, accuracy, diff) {
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem('mictab_typing_lb') || '[]'); } catch {}
    lb.push({ wpm, accuracy, diff, date: Date.now() });
    lb.sort((a, b) => b.wpm - a.wpm);
    lb = lb.slice(0, 10);
    try { localStorage.setItem('mictab_typing_lb', JSON.stringify(lb)); } catch {}
    renderTypingLeaderboard();
  }

  function renderTypingLeaderboard() {
    let lb = [];
    try { lb = JSON.parse(localStorage.getItem('mictab_typing_lb') || '[]'); } catch {}
    typingLbList.innerHTML = '';
    lb.forEach((entry, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-wpm">${entry.wpm} WPM</span><span class="lb-acc">${entry.accuracy}% ${entry.diff}</span>`;
      typingLbList.appendChild(li);
    });
  }

  typingStartBtn.addEventListener('click', () => {
    initTypingTest();
    typingInput.disabled = false;
    typingActive = true;
    typingInput.focus();
  });

  typingResetBtn.addEventListener('click', () => { initTypingTest(); });

  typingInput.addEventListener('input', () => {
    if (!typingActive) return;

    if (!typingStartTime) {
      typingStartTime = Date.now();
      typingTimerInterval = setInterval(updateTypingStats, 200);
    }

    const typedLength = typingInput.value.length;
    if (typedLength > typingCurrentText.length) {
      typingInput.value = typingInput.value.substring(0, typingCurrentText.length);
      return;
    }

    renderTypingText(typedLength);
    updateTypingStats();

    if (typedLength === typingCurrentText.length) {
      typingFinished = true;
      typingActive = false;
      typingInput.disabled = true;
      clearInterval(typingTimerInterval);
      updateTypingStats();

      // Save to leaderboard
      const elapsed = (Date.now() - typingStartTime) / 1000;
      const minutes = elapsed / 60;
      const words = typingInput.value.trim().split(/\s+/).filter(w => w.length > 0).length;
      const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
      let correctChars = 0;
      for (let i = 0; i < typingCurrentText.length; i++) {
        if (typingInput.value[i] === typingCurrentText[i]) correctChars++;
      }
      const accuracy = Math.round((correctChars / typingCurrentText.length) * 100);
      saveTypingLeaderboard(wpm, accuracy, typingDiff);
    }
  });

  initTypingTest();
  renderTypingLeaderboard();

  /* ==========================================
     9. REACTION TIME TEST — best/avg/last5, rank
     ========================================== */
  const reactionBox = document.getElementById('reaction-box');
  const reactionText = document.getElementById('reaction-text');
  const reactionSubtext = document.getElementById('reaction-subtext');
  const reactionBest = document.getElementById('reaction-best');
  const reactionAvg = document.getElementById('reaction-avg');
  const reactionLast = document.getElementById('reaction-last');
  const reactionRank = document.getElementById('reaction-rank');
  const reactionHistoryList = document.getElementById('reaction-history-list');

  let reactionState = 'idle';
  let reactionTimeout = null;
  let reactionStartTime = null;
  let reactionBestTime = Infinity;
  const reactionHistoryArr = [];

  function getReactionRank(ms) {
    if (ms < 200) return { text: '⚡ Lightning', cls: 'lightning' };
    if (ms < 250) return { text: '🏃 Fast', cls: 'fast' };
    if (ms < 350) return { text: '👍 Average', cls: 'average' };
    return { text: '🐢 Slow', cls: 'slow' };
  }

  function updateReactionStats() {
    if (reactionBestTime < Infinity) reactionBest.textContent = `${reactionBestTime} ms`;
    if (reactionHistoryArr.length > 0) {
      const avg = Math.round(reactionHistoryArr.reduce((a, b) => a + b, 0) / reactionHistoryArr.length);
      reactionAvg.textContent = `${avg} ms`;
      reactionLast.textContent = `${reactionHistoryArr[0]} ms`;
      const rank = getReactionRank(reactionHistoryArr[0]);
      reactionRank.textContent = rank.text;
      reactionRank.className = `reaction-rank ${rank.cls}`;
    }
  }

  function renderReactionHistory() {
    reactionHistoryList.innerHTML = '';
    reactionHistoryArr.slice(0, 10).forEach(time => {
      const li = document.createElement('li');
      li.textContent = `${time} ms`;
      reactionHistoryList.appendChild(li);
    });
  }

  reactionBox.addEventListener('click', () => {
    switch (reactionState) {
      case 'idle':
        reactionState = 'waiting';
        reactionBox.className = 'reaction-box waiting';
        reactionText.textContent = 'Wait...';
        reactionSubtext.textContent = 'Do NOT click yet!';
        const delay = 2000 + Math.random() * 3000;
        reactionTimeout = setTimeout(() => {
          reactionState = 'ready';
          reactionBox.className = 'reaction-box ready';
          reactionText.textContent = 'Click NOW!';
          reactionSubtext.textContent = 'As fast as you can!';
          reactionStartTime = Date.now();
        }, delay);
        break;

      case 'waiting':
        clearTimeout(reactionTimeout);
        reactionState = 'tooEarly';
        reactionBox.className = 'reaction-box too-early';
        reactionText.textContent = 'Too early!';
        reactionSubtext.textContent = 'Click to try again';
        setTimeout(() => {
          reactionState = 'idle';
          reactionBox.className = 'reaction-box';
          reactionText.textContent = 'Click to Start';
          reactionSubtext.textContent = '';
        }, 1500);
        break;

      case 'ready':
        const reactionTime = Date.now() - reactionStartTime;
        reactionState = 'result';
        reactionBox.className = 'reaction-box result-state';
        reactionText.textContent = `${reactionTime} ms`;
        reactionSubtext.textContent = 'Click to try again';

        if (reactionTime < reactionBestTime) reactionBestTime = reactionTime;
        reactionHistoryArr.unshift(reactionTime);
        if (reactionHistoryArr.length > 20) reactionHistoryArr.pop();

        updateReactionStats();
        renderReactionHistory();

        setTimeout(() => {
          if (reactionState === 'result') {
            reactionState = 'idle';
            reactionBox.className = 'reaction-box';
            reactionText.textContent = 'Click to Start';
            reactionSubtext.textContent = '';
          }
        }, 3000);
        break;

      case 'result':
        reactionState = 'idle';
        reactionBox.className = 'reaction-box';
        reactionText.textContent = 'Click to Start';
        reactionSubtext.textContent = '';
        break;
    }
  });

  /* ==========================================
     10. SPIN WHEEL — improved colors, sound, history
     ========================================== */
  const wheelCanvas = document.getElementById('wheel-canvas');
  const wheelSpinBtn = document.getElementById('wheel-spin-btn');
  const wheelSegmentsInput = document.getElementById('wheel-segments');
  const wheelResultEl = document.getElementById('wheel-result');
  const wheelHistorySection = document.getElementById('wheel-history-section');
  const wheelHistoryList = document.getElementById('wheel-history-list');
  const wheelCtx = wheelCanvas.getContext('2d');

  let wheelSpinning = false;
  let wheelAngle = 0;
  const wheelHistory = [];

  const wheelColors = [
    '#007AFF', '#5856D6', '#FF2D55', '#FF9500', '#34C759',
    '#5AC8FA', '#AF52DE', '#FF3B30', '#FFCC00', '#30B0C7',
    '#64D2FF', '#BF5AF2', '#FF6482', '#FFD60A', '#28CD41'
  ];

  // Web Audio API click sound
  let audioCtx = null;
  function playClickSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 800 + Math.random() * 400;
      osc.type = 'sine';
      gain.gain.value = 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.08);
    } catch {}
  }

  function drawWheel() {
    const segments = wheelSegmentsInput.value.trim().split('\n').filter(s => s.trim().length > 0);
    if (segments.length === 0) return;

    const numSeg = segments.length;
    const arc = (2 * Math.PI) / numSeg;
    const cx = wheelCanvas.width / 2;
    const cy = wheelCanvas.height / 2;
    const radius = Math.min(cx, cy) - 4;

    wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

    for (let i = 0; i < numSeg; i++) {
      const startAngle = wheelAngle + i * arc;
      const endAngle = startAngle + arc;

      // Segment
      wheelCtx.beginPath();
      wheelCtx.moveTo(cx, cy);
      wheelCtx.arc(cx, cy, radius, startAngle, endAngle);
      wheelCtx.closePath();
      wheelCtx.fillStyle = wheelColors[i % wheelColors.length];
      wheelCtx.fill();
      wheelCtx.strokeStyle = '#FFFFFF';
      wheelCtx.lineWidth = 2;
      wheelCtx.stroke();

      // Text
      wheelCtx.save();
      wheelCtx.translate(cx, cy);
      wheelCtx.rotate(startAngle + arc / 2);
      wheelCtx.textAlign = 'right';
      wheelCtx.fillStyle = '#FFFFFF';
      wheelCtx.font = 'bold 13px -apple-system, sans-serif';
      wheelCtx.shadowColor = 'rgba(0,0,0,0.3)';
      wheelCtx.shadowBlur = 2;
      const text = segments[i].length > 14 ? segments[i].substring(0, 14) + '..' : segments[i];
      wheelCtx.fillText(text, radius - 12, 5);
      wheelCtx.restore();
    }

    // Center circle
    wheelCtx.beginPath();
    wheelCtx.arc(cx, cy, 18, 0, 2 * Math.PI);
    wheelCtx.fillStyle = '#FFFFFF';
    wheelCtx.fill();
    wheelCtx.strokeStyle = '#E5E5EA';
    wheelCtx.lineWidth = 2;
    wheelCtx.stroke();
  }

  function getWheelResult() {
    const segments = wheelSegmentsInput.value.trim().split('\n').filter(s => s.trim().length > 0);
    if (segments.length === 0) return null;
    const numSeg = segments.length;
    const arc = (2 * Math.PI) / numSeg;
    // Pointer is at top (270 degrees / -PI/2)
    const pointerAngle = (2 * Math.PI - ((wheelAngle % (2 * Math.PI)) + Math.PI / 2)) % (2 * Math.PI);
    const index = Math.floor(pointerAngle / arc) % numSeg;
    return segments[index];
  }

  wheelSpinBtn.addEventListener('click', () => {
    if (wheelSpinning) return;
    const segments = wheelSegmentsInput.value.trim().split('\n').filter(s => s.trim().length > 0);
    if (segments.length < 2) return;

    wheelSpinning = true;
    wheelSpinBtn.disabled = true;
    wheelResultEl.textContent = 'Spinning...';

    const spinAmount = (5 + Math.random() * 5) * 2 * Math.PI;
    const startAngle = wheelAngle;
    const targetAngle = startAngle + spinAmount;
    const duration = 4000;
    const startTime = Date.now();
    let lastTickAngle = startAngle;
    const segments_count = segments.length;
    const arcPerSeg = (2 * Math.PI) / segments_count;

    function animateSpin() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      wheelAngle = startAngle + spinAmount * eased;

      // Tick sound when crossing segment boundary
      if (Math.floor(wheelAngle / arcPerSeg) !== Math.floor(lastTickAngle / arcPerSeg)) {
        playClickSound();
      }
      lastTickAngle = wheelAngle;

      drawWheel();

      if (progress < 1) {
        requestAnimationFrame(animateSpin);
      } else {
        wheelSpinning = false;
        wheelSpinBtn.disabled = false;
        const result = getWheelResult();
        wheelResultEl.textContent = `🎉 ${result}`;
        wheelHistory.unshift(result);
        if (wheelHistory.length > 15) wheelHistory.pop();
        wheelHistorySection.style.display = 'block';
        wheelHistoryList.innerHTML = '';
        wheelHistory.forEach(r => {
          const li = document.createElement('li');
          li.textContent = r;
          wheelHistoryList.appendChild(li);
        });
      }
    }

    animateSpin();
  });

  // Redraw wheel when segments change
  wheelSegmentsInput.addEventListener('input', () => {
    if (!wheelSpinning) drawWheel();
  });

  // Initial draw
  drawWheel();

});
