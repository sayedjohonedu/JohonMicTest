/* ============================================================
   MicTab - Time & Productivity  |  script.js
   All 6 sub-applications: Pomodoro, Stopwatch, Countdown,
   World Clock, Todo List, Quick Notes
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------
     Utility Helpers
     ---------------------------------------------------------- */

  /**
   * Safe localStorage wrapper – returns parsed data or fallback.
   */
  function lsGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Safe localStorage setter.
   */
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* sandbox may restrict storage */
    }
  }

  /**
   * Play a short beep using the Web Audio API (OscillatorNode).
   * @param {number} freq - Frequency in Hz (default 880).
   * @param {number} dur  - Duration in seconds (default 0.3).
   */
  function playBeep(freq = 880, dur = 0.3) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) {
      /* Web Audio not available */
    }
  }

  /**
   * Play alarm sound - multiple beeps for countdown/pomodoro completion.
   */
  function playAlarm(times = 3) {
    for (let i = 0; i < times; i++) {
      setTimeout(() => playBeep(880, 0.4), i * 500);
    }
  }

  /**
   * Pad a number to 2 digits.
   */
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Format a timestamp for display.
   */
  function formatTime(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  /* ----------------------------------------------------------
     Tab Strip Navigation
     ---------------------------------------------------------- */
  const tabItems = document.querySelectorAll('.tab-item');
  const panels   = document.querySelectorAll('.tool-panel');

  /** Switch active tool panel. */
  function switchPanel(toolName) {
    tabItems.forEach(t => t.classList.toggle('active', t.dataset.tool === toolName));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${toolName}`));

    /* Scroll the active tab into view */
    const activeTab = document.querySelector(`.tab-item[data-tool="${toolName}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  tabItems.forEach(item => {
    item.addEventListener('click', () => {
      switchPanel(item.dataset.tool);
    });
  });

  /* ----------------------------------------------------------
     1. POMODORO TIMER
     Enhanced: sound notification, long break after 4 sessions,
               session history log
     ---------------------------------------------------------- */
  const pomRing         = document.getElementById('pomodoroRing');
  const pomTimeEl       = document.getElementById('pomodoroTime');
  const pomPhaseEl      = document.getElementById('pomodoroPhase');
  const pomSessionsEl   = document.getElementById('pomodoroSessions');
  const pomStartBtn     = document.getElementById('pomodoroStart');
  const pomStopBtn      = document.getElementById('pomodoroStop');
  const pomResetBtn     = document.getElementById('pomodoroReset');
  const pomWorkInput    = document.getElementById('pomWorkDur');
  const pomBreakInput   = document.getElementById('pomBreakDur');
  const pomLongBreakInput = document.getElementById('pomLongBreakDur');
  const pomHistoryList  = document.getElementById('pomHistoryList');
  const pomHistoryClear = document.getElementById('pomHistoryClear');

  /* SVG circle circumference: 2 * PI * 90 ≈ 565.49 */
  const CIRC = 2 * Math.PI * 90;

  let pomWorkDur      = lsGet('pomWorkDur', 25);
  let pomBreakDur     = lsGet('pomBreakDur', 5);
  let pomLongBreakDur = lsGet('pomLongBreakDur', 15);
  let pomTotalSec     = pomWorkDur * 60;
  let pomRemaining    = pomTotalSec;
  let pomRunning      = false;
  let pomInterval     = null;
  let pomIsWork       = true;
  let pomIsLongBreak  = false;
  let pomSessions     = lsGet('pomSessions', 0);
  let pomHistory      = lsGet('pomHistory', []);

  pomWorkInput.value      = pomWorkDur;
  pomBreakInput.value     = pomBreakDur;
  pomLongBreakInput.value = pomLongBreakDur;
  pomSessionsEl.textContent = pomSessions;

  /** Update the SVG ring and time display. */
  function pomRender() {
    const progress = 1 - (pomRemaining / pomTotalSec);
    pomRing.style.strokeDashoffset = CIRC * (1 - progress);
    const m = Math.floor(pomRemaining / 60);
    const s = pomRemaining % 60;
    pomTimeEl.textContent = `${pad2(m)}:${pad2(s)}`;
  }

  /** Add entry to session history. */
  function pomAddHistory(type, duration) {
    const entry = {
      type,
      duration,
      timestamp: new Date().toISOString()
    };
    pomHistory.unshift(entry);
    /* Keep only last 50 entries */
    if (pomHistory.length > 50) pomHistory = pomHistory.slice(0, 50);
    lsSet('pomHistory', pomHistory);
    pomRenderHistory();
  }

  /** Render session history. */
  function pomRenderHistory() {
    pomHistoryList.innerHTML = '';
    if (pomHistory.length === 0) {
      pomHistoryList.innerHTML = '<div style="text-align:center;color:var(--text-secondary);font-size:0.82rem;padding:12px 0;">No sessions yet</div>';
      return;
    }
    pomHistory.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'pomodoro-history-item';

      const typeLabel = entry.type === 'work' ? 'Work' : entry.type === 'break' ? 'Break' : 'Long Break';
      const dotClass  = entry.type;

      const d = new Date(entry.timestamp);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      div.innerHTML = `
        <span class="pomodoro-history-type"><span class="dot ${dotClass}"></span>${typeLabel} (${entry.duration}m)</span>
        <span class="pomodoro-history-time">${timeStr}</span>
      `;
      pomHistoryList.appendChild(div);
    });
  }

  /** Tick every second. */
  function pomTick() {
    if (pomRemaining <= 0) {
      clearInterval(pomInterval);
      pomRunning = false;
      playAlarm(3);

      if (pomIsWork) {
        /* Work session completed */
        pomSessions++;
        lsSet('pomSessions', pomSessions);
        pomSessionsEl.textContent = pomSessions;
        pomAddHistory('work', pomWorkDur);

        /* After 4 work sessions → long break */
        if (pomSessions % 4 === 0) {
          pomIsLongBreak = true;
          pomIsWork = false;
          pomPhaseEl.textContent = 'Long Break';
          pomPhaseEl.className = 'pomodoro-phase on-longbreak';
          pomTotalSec  = pomLongBreakDur * 60;
          pomRemaining = pomTotalSec;
          pomRing.style.stroke = '#5856D6';
          pomAddHistory('longbreak', pomLongBreakDur);
        } else {
          /* Regular break */
          pomIsLongBreak = false;
          pomIsWork = false;
          pomPhaseEl.textContent = 'Break';
          pomPhaseEl.className = 'pomodoro-phase on-break';
          pomTotalSec  = pomBreakDur * 60;
          pomRemaining = pomTotalSec;
          pomRing.style.stroke = '#34C759';
          pomAddHistory('break', pomBreakDur);
        }
      } else {
        /* Break completed → switch to work */
        pomIsWork = true;
        pomIsLongBreak = false;
        pomPhaseEl.textContent = 'Work';
        pomPhaseEl.className = 'pomodoro-phase';
        pomTotalSec  = pomWorkDur * 60;
        pomRemaining = pomTotalSec;
        pomRing.style.stroke = 'var(--accent)';
      }

      pomRender();
      /* Auto-start next phase */
      pomRunning = true;
      pomInterval = setInterval(pomTick, 1000);
      return;
    }
    pomRemaining--;
    pomRender();
  }

  pomStartBtn.addEventListener('click', () => {
    if (pomRunning) return;
    pomRunning = true;
    pomInterval = setInterval(pomTick, 1000);
  });

  pomStopBtn.addEventListener('click', () => {
    pomRunning = false;
    clearInterval(pomInterval);
  });

  pomResetBtn.addEventListener('click', () => {
    pomRunning = false;
    clearInterval(pomInterval);
    pomIsWork = true;
    pomIsLongBreak = false;
    pomPhaseEl.textContent = 'Work';
    pomPhaseEl.className = 'pomodoro-phase';
    pomRing.style.stroke = 'var(--accent)';
    pomTotalSec  = pomWorkDur * 60;
    pomRemaining = pomTotalSec;
    pomRender();
  });

  /** Update durations from inputs (only when timer is not running). */
  function pomUpdateDurations() {
    pomWorkDur      = Math.max(1, Math.min(120, parseInt(pomWorkInput.value) || 25));
    pomBreakDur     = Math.max(1, Math.min(60, parseInt(pomBreakInput.value) || 5));
    pomLongBreakDur = Math.max(1, Math.min(60, parseInt(pomLongBreakInput.value) || 15));
    lsSet('pomWorkDur', pomWorkDur);
    lsSet('pomBreakDur', pomBreakDur);
    lsSet('pomLongBreakDur', pomLongBreakDur);
    if (!pomRunning) {
      pomTotalSec  = (pomIsWork ? pomWorkDur : (pomIsLongBreak ? pomLongBreakDur : pomBreakDur)) * 60;
      pomRemaining = pomTotalSec;
      pomRender();
    }
  }

  pomWorkInput.addEventListener('change', pomUpdateDurations);
  pomBreakInput.addEventListener('change', pomUpdateDurations);
  pomLongBreakInput.addEventListener('change', pomUpdateDurations);

  /** Clear history. */
  pomHistoryClear.addEventListener('click', () => {
    pomHistory = [];
    lsSet('pomHistory', pomHistory);
    pomRenderHistory();
  });

  /* Initial render */
  pomRender();
  pomRenderHistory();

  /* ----------------------------------------------------------
     2. STOPWATCH
     Enhanced: split times, export times as text
     ---------------------------------------------------------- */
  const swDisplay  = document.getElementById('stopwatchDisplay');
  const swStart    = document.getElementById('swStart');
  const swStop     = document.getElementById('swStop');
  const swLapBtn   = document.getElementById('swLap');
  const swSplitBtn = document.getElementById('swSplit');
  const swReset    = document.getElementById('swReset');
  const swExport   = document.getElementById('swExport');
  const lapListEl  = document.getElementById('lapList');

  let swRunning   = false;
  let swStartTime = 0;
  let swElapsed   = 0;      // ms accumulated before current run
  let swInterval  = null;
  let laps        = lsGet('swLaps', []);  // [{split, total, type}]

  /** Format ms → HH:MM:SS.CC */
  function swFormat(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h  = Math.floor(totalSec / 3600);
    const m  = Math.floor((totalSec % 3600) / 60);
    const s  = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
  }

  /** Render current display. */
  function swRender() {
    const now = swRunning ? swElapsed + (Date.now() - swStartTime) : swElapsed;
    swDisplay.textContent = swFormat(now);
  }

  function swTick() {
    swRender();
  }

  /** Render the lap/split list. */
  function swRenderLaps() {
    lapListEl.innerHTML = '';
    laps.forEach((lap, i) => {
      const li = document.createElement('li');
      li.className = 'lap-item';
      const typeLabel = lap.type === 'split' ? 'Split' : 'Lap';
      li.innerHTML = `
        <span class="lap-num">${typeLabel} ${i + 1}</span>
        <span class="lap-split">${swFormat(lap.split)}</span>
        <span class="lap-total">${swFormat(lap.total)}</span>
      `;
      lapListEl.appendChild(li);
    });
    /* Scroll to bottom */
    lapListEl.parentElement.scrollTop = lapListEl.parentElement.scrollHeight;
  }

  swStart.addEventListener('click', () => {
    if (swRunning) return;
    swRunning   = true;
    swStartTime = Date.now();
    swInterval  = setInterval(swTick, 30);
  });

  swStop.addEventListener('click', () => {
    if (!swRunning) return;
    swRunning = false;
    swElapsed += Date.now() - swStartTime;
    clearInterval(swInterval);
    swRender();
  });

  swLapBtn.addEventListener('click', () => {
    if (!swRunning) return;
    const total = swElapsed + (Date.now() - swStartTime);
    const prevTotal = laps.length > 0 ? laps[laps.length - 1].total : 0;
    const split = total - prevTotal;
    laps.push({ split, total, type: 'lap' });
    lsSet('swLaps', laps);
    swRenderLaps();
  });

  swSplitBtn.addEventListener('click', () => {
    if (!swRunning) return;
    const total = swElapsed + (Date.now() - swStartTime);
    const prevTotal = laps.length > 0 ? laps[laps.length - 1].total : 0;
    const split = total - prevTotal;
    laps.push({ split, total, type: 'split' });
    lsSet('swLaps', laps);
    swRenderLaps();
  });

  swReset.addEventListener('click', () => {
    swRunning = false;
    clearInterval(swInterval);
    swElapsed   = 0;
    swStartTime = 0;
    laps = [];
    lsSet('swLaps', laps);
    swRender();
    swRenderLaps();
  });

  /** Export times as text. */
  swExport.addEventListener('click', () => {
    const now = swRunning ? swElapsed + (Date.now() - swStartTime) : swElapsed;
    let text = `Stopwatch Export - ${new Date().toLocaleString()}\n`;
    text += `Total Time: ${swFormat(now)}\n`;
    text += '─'.repeat(40) + '\n';
    laps.forEach((lap, i) => {
      const typeLabel = lap.type === 'split' ? 'Split' : 'Lap';
      text += `${typeLabel} ${i + 1}:  Split: ${swFormat(lap.split)}  |  Total: ${swFormat(lap.total)}\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'stopwatch-times.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* Initial render */
  swRender();
  swRenderLaps();

  /* ----------------------------------------------------------
     3. COUNTDOWN TIMER
     Enhanced: preset timers, alarm sound
     ---------------------------------------------------------- */
  const cdDisplay  = document.getElementById('countdownDisplay');
  const cdHours    = document.getElementById('cdHours');
  const cdMinutes  = document.getElementById('cdMinutes');
  const cdSeconds  = document.getElementById('cdSeconds');
  const cdStartBtn = document.getElementById('cdStart');
  const cdPauseBtn = document.getElementById('cdPause');
  const cdResetBtn = document.getElementById('cdReset');
  const presetBtns = document.querySelectorAll('.preset-btn');

  let cdTotalSec   = 0;
  let cdRemaining  = 0;
  let cdRunning    = false;
  let cdInterval   = null;

  /** Format seconds → HH:MM:SS */
  function cdFormat(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  /** Render the countdown display. */
  function cdRender() {
    cdDisplay.textContent = cdFormat(cdRemaining);
  }

  function cdTick() {
    if (cdRemaining <= 0) {
      clearInterval(cdInterval);
      cdRunning = false;
      cdDisplay.classList.add('pulse');
      /* Play alarm - multiple beeps */
      playAlarm(5);
      return;
    }
    cdRemaining--;
    cdRender();
  }

  cdStartBtn.addEventListener('click', () => {
    if (cdRunning) return;

    /* If remaining is 0, read from inputs */
    if (cdRemaining <= 0) {
      const h = Math.max(0, parseInt(cdHours.value) || 0);
      const m = Math.max(0, parseInt(cdMinutes.value) || 0);
      const s = Math.max(0, parseInt(cdSeconds.value) || 0);
      cdTotalSec  = h * 3600 + m * 60 + s;
      cdRemaining = cdTotalSec;
    }

    if (cdRemaining <= 0) return;

    cdDisplay.classList.remove('pulse');
    cdRunning  = true;
    cdInterval = setInterval(cdTick, 1000);
  });

  cdPauseBtn.addEventListener('click', () => {
    if (!cdRunning) return;
    cdRunning = false;
    clearInterval(cdInterval);
  });

  cdResetBtn.addEventListener('click', () => {
    cdRunning = false;
    clearInterval(cdInterval);
    cdRemaining = 0;
    cdDisplay.classList.remove('pulse');
    cdRender();
  });

  /** Preset buttons */
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cdRunning = false;
      clearInterval(cdInterval);
      cdDisplay.classList.remove('pulse');

      const minutes = parseInt(btn.dataset.minutes) || 0;
      cdTotalSec  = minutes * 60;
      cdRemaining = cdTotalSec;
      cdHours.value   = Math.floor(minutes / 60);
      cdMinutes.value = minutes % 60;
      cdSeconds.value = 0;
      cdRender();
    });
  });

  /* Initial render */
  cdRender();

  /* ----------------------------------------------------------
     4. WORLD CLOCK
     Enhanced: analog clock face option, more timezone support
     ---------------------------------------------------------- */
  const clockGrid   = document.getElementById('clockGrid');
  const tzSelect    = document.getElementById('tzSelect');
  const tzAddBtn    = document.getElementById('tzAddBtn');
  const viewAnalog  = document.getElementById('viewAnalog');
  const viewDigital = document.getElementById('viewDigital');

  /** Expanded list of 30+ common timezones. */
  const ALL_TIMEZONES = [
    { label: 'America/New_York',     city: 'New York' },
    { label: 'America/Chicago',      city: 'Chicago' },
    { label: 'America/Denver',       city: 'Denver' },
    { label: 'America/Los_Angeles',  city: 'Los Angeles' },
    { label: 'America/Anchorage',    city: 'Anchorage' },
    { label: 'Pacific/Honolulu',     city: 'Honolulu' },
    { label: 'America/Toronto',      city: 'Toronto' },
    { label: 'America/Mexico_City',  city: 'Mexico City' },
    { label: 'America/Sao_Paulo',    city: 'São Paulo' },
    { label: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires' },
    { label: 'America/Bogota',       city: 'Bogotá' },
    { label: 'America/Lima',         city: 'Lima' },
    { label: 'Europe/London',        city: 'London' },
    { label: 'Europe/Paris',         city: 'Paris' },
    { label: 'Europe/Berlin',        city: 'Berlin' },
    { label: 'Europe/Moscow',        city: 'Moscow' },
    { label: 'Europe/Rome',          city: 'Rome' },
    { label: 'Europe/Madrid',        city: 'Madrid' },
    { label: 'Europe/Amsterdam',     city: 'Amsterdam' },
    { label: 'Europe/Istanbul',      city: 'Istanbul' },
    { label: 'Europe/Athens',        city: 'Athens' },
    { label: 'Asia/Dubai',           city: 'Dubai' },
    { label: 'Asia/Kolkata',         city: 'Mumbai' },
    { label: 'Asia/Bangkok',         city: 'Bangkok' },
    { label: 'Asia/Shanghai',        city: 'Shanghai' },
    { label: 'Asia/Tokyo',           city: 'Tokyo' },
    { label: 'Asia/Seoul',           city: 'Seoul' },
    { label: 'Asia/Singapore',       city: 'Singapore' },
    { label: 'Asia/Hong_Kong',       city: 'Hong Kong' },
    { label: 'Asia/Taipei',          city: 'Taipei' },
    { label: 'Asia/Jakarta',         city: 'Jakarta' },
    { label: 'Asia/Karachi',         city: 'Karachi' },
    { label: 'Australia/Sydney',     city: 'Sydney' },
    { label: 'Australia/Melbourne',  city: 'Melbourne' },
    { label: 'Pacific/Auckland',     city: 'Auckland' },
    { label: 'Africa/Cairo',         city: 'Cairo' },
    { label: 'Africa/Lagos',         city: 'Lagos' },
    { label: 'Africa/Johannesburg',  city: 'Johannesburg' },
    { label: 'Africa/Nairobi',       city: 'Nairobi' },
  ];

  /** Default 4 clocks. */
  const DEFAULT_TZS = [
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];

  let activeTZs = lsGet('worldClockTZs', DEFAULT_TZS);
  let clockView = lsGet('worldClockView', 'analog');

  /** Set view toggle state. */
  function setClockView(view) {
    clockView = view;
    lsSet('worldClockView', clockView);
    viewAnalog.classList.toggle('active', view === 'analog');
    viewDigital.classList.toggle('active', view === 'digital');
    clocksRender();
  }

  viewAnalog.addEventListener('click', () => setClockView('analog'));
  viewDigital.addEventListener('click', () => setClockView('digital'));

  /** Populate the dropdown. */
  function tzPopulateSelect() {
    tzSelect.innerHTML = '';
    ALL_TIMEZONES.forEach(tz => {
      if (!activeTZs.includes(tz.label)) {
        const opt = document.createElement('option');
        opt.value = tz.label;
        opt.textContent = tz.city;
        tzSelect.appendChild(opt);
      }
    });
  }

  /** Get city label for a timezone IANA string. */
  function tzCity(iana) {
    const found = ALL_TIMEZONES.find(t => t.label === iana);
    return found ? found.city : iana.split('/').pop().replace(/_/g, ' ');
  }

  /** Render all clock cards. */
  function clocksRender() {
    clockGrid.innerHTML = '';
    activeTZs.forEach(iana => {
      const card = document.createElement('div');
      card.className = 'clock-card';
      card.dataset.tz = iana;

      if (clockView === 'analog') {
        /* Analog clock */
        const analogDiv = document.createElement('div');
        analogDiv.className = 'analog-clock';
        analogDiv.dataset.tzAnalog = iana;
        analogDiv.innerHTML = `
          <div class="hand hand-hour" data-hand="hour"></div>
          <div class="hand hand-minute" data-hand="minute"></div>
          <div class="hand hand-second" data-hand="second"></div>
          <div class="center-dot"></div>
        `;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'clock-info';
        infoDiv.innerHTML = `
          <div class="clock-city">${tzCity(iana)}</div>
          <div class="clock-time" data-tz-time="${iana}"></div>
          <div class="clock-date" data-tz-date="${iana}"></div>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'clock-remove';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
          activeTZs = activeTZs.filter(t => t !== iana);
          lsSet('worldClockTZs', activeTZs);
          clocksRender();
          tzPopulateSelect();
        });

        card.appendChild(analogDiv);
        card.appendChild(infoDiv);
        card.appendChild(removeBtn);
      } else {
        /* Digital only */
        const infoDiv = document.createElement('div');
        infoDiv.className = 'clock-info';
        infoDiv.style.flex = '1';
        infoDiv.innerHTML = `
          <div class="clock-city">${tzCity(iana)}</div>
          <div class="clock-time" data-tz-time="${iana}" style="font-size:1.8rem;"></div>
          <div class="clock-date" data-tz-date="${iana}"></div>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'clock-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          activeTZs = activeTZs.filter(t => t !== iana);
          lsSet('worldClockTZs', activeTZs);
          clocksRender();
          tzPopulateSelect();
        });

        card.appendChild(infoDiv);
        card.appendChild(removeBtn);
      }

      clockGrid.appendChild(card);
    });
    clocksUpdate();
  }

  /** Update the time/date/hands on all clock cards. */
  function clocksUpdate() {
    const now = new Date();

    document.querySelectorAll('[data-tz-time]').forEach(el => {
      const tz = el.dataset.tzTime;
      try {
        el.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).format(now);
      } catch (e) {
        el.textContent = '--:--:--';
      }
    });

    document.querySelectorAll('[data-tz-date]').forEach(el => {
      const tz = el.dataset.tzDate;
      try {
        el.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(now);
      } catch (e) {
        el.textContent = '';
      }
    });

    /* Update analog clock hands */
    document.querySelectorAll('[data-tz-analog]').forEach(analogEl => {
      const tz = analogEl.dataset.tzAnalog;
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        }).formatToParts(now);

        let h = 0, m = 0, s = 0;
        parts.forEach(p => {
          if (p.type === 'hour') h = parseInt(p.value);
          if (p.type === 'minute') m = parseInt(p.value);
          if (p.type === 'second') s = parseInt(p.value);
        });

        const hourDeg   = (h % 12) * 30 + m * 0.5;
        const minuteDeg = m * 6 + s * 0.1;
        const secondDeg = s * 6;

        const hourHand   = analogEl.querySelector('[data-hand="hour"]');
        const minuteHand = analogEl.querySelector('[data-hand="minute"]');
        const secondHand = analogEl.querySelector('[data-hand="second"]');

        if (hourHand) hourHand.style.transform = `rotate(${hourDeg}deg)`;
        if (minuteHand) minuteHand.style.transform = `rotate(${minuteDeg}deg)`;
        if (secondHand) secondHand.style.transform = `rotate(${secondDeg}deg)`;
      } catch (e) {
        /* ignore */
      }
    });
  }

  /** Update clocks every second. */
  setInterval(clocksUpdate, 1000);

  /** Add timezone from dropdown. */
  tzAddBtn.addEventListener('click', () => {
    const val = tzSelect.value;
    if (!val || activeTZs.includes(val)) return;
    activeTZs.push(val);
    lsSet('worldClockTZs', activeTZs);
    clocksRender();
    tzPopulateSelect();
  });

  /* Initial render */
  setClockView(clockView);
  tzPopulateSelect();

  /* ----------------------------------------------------------
     5. TODO LIST
     Enhanced: priority levels, due date, categories/tags,
               drag-to-reorder, export todos
     ---------------------------------------------------------- */
  const todoInput     = document.getElementById('todoInput');
  const todoPriority  = document.getElementById('todoPriority');
  const todoCategory  = document.getElementById('todoCategory');
  const todoDueDate   = document.getElementById('todoDueDate');
  const todoAddBtn    = document.getElementById('todoAddBtn');
  const todoListEl    = document.getElementById('todoList');
  const todoCountEl   = document.getElementById('todoCount');
  const todoClearBtn  = document.getElementById('todoClearBtn');
  const todoExportBtn = document.getElementById('todoExportBtn');
  const filterBtns    = document.querySelectorAll('.filter-btn');

  let todos     = lsGet('todos', []);
  let todoFilter = 'all';

  /** Save todos to localStorage. */
  function todosSave() {
    lsSet('todos', todos);
  }

  /** Render the todo list based on current filter. */
  function todosRender() {
    todoListEl.innerHTML = '';

    const filtered = todos.filter(t => {
      if (todoFilter === 'active') return !t.completed;
      if (todoFilter === 'completed') return t.completed;
      if (todoFilter === 'high') return t.priority === 'high';
      if (todoFilter === 'medium') return t.priority === 'medium';
      if (todoFilter === 'low') return t.priority === 'low';
      return true;
    });

    filtered.forEach((t, idx) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (t.completed ? ' completed' : '');
      li.dataset.todoId = t.id;
      li.draggable = true;

      /* Drag handle */
      const dragHandle = document.createElement('span');
      dragHandle.className = 'todo-drag-handle';
      dragHandle.innerHTML = '⋮⋮';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'todo-checkbox';
      cb.checked = t.completed;
      cb.addEventListener('change', () => {
        t.completed = cb.checked;
        todosSave();
        todosRender();
      });

      const contentDiv = document.createElement('div');
      contentDiv.className = 'todo-content';

      const span = document.createElement('span');
      span.className = 'todo-text';
      span.textContent = t.text;

      contentDiv.appendChild(span);

      /* Tags row */
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'todo-tags';

      if (t.priority) {
        const priTag = document.createElement('span');
        priTag.className = `todo-tag priority-${t.priority}`;
        const priLabel = t.priority === 'high' ? 'High' : t.priority === 'medium' ? 'Medium' : 'Low';
        priTag.textContent = priLabel;
        tagsDiv.appendChild(priTag);
      }

      if (t.category) {
        const catTag = document.createElement('span');
        catTag.className = 'todo-tag category';
        catTag.textContent = t.category.charAt(0).toUpperCase() + t.category.slice(1);
        tagsDiv.appendChild(catTag);
      }

      if (t.dueDate) {
        const dueTag = document.createElement('span');
        dueTag.className = 'todo-tag due-date';
        const d = new Date(t.dueDate);
        dueTag.textContent = `Due: ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
        /* Check if overdue */
        const today = new Date();
        today.setHours(0,0,0,0);
        if (d < today && !t.completed) {
          dueTag.style.background = 'var(--danger-light)';
          dueTag.style.color = 'var(--danger)';
        }
        tagsDiv.appendChild(dueTag);
      }

      if (tagsDiv.children.length > 0) {
        contentDiv.appendChild(tagsDiv);
      }

      const del = document.createElement('button');
      del.className = 'todo-delete';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        todos = todos.filter(x => x.id !== t.id);
        todosSave();
        todosRender();
      });

      li.appendChild(dragHandle);
      li.appendChild(cb);
      li.appendChild(contentDiv);
      li.appendChild(del);

      /* Drag and drop events */
      li.addEventListener('dragstart', handleDragStart);
      li.addEventListener('dragend', handleDragEnd);
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('drop', handleDrop);
      li.addEventListener('dragleave', handleDragLeave);

      todoListEl.appendChild(li);
    });

    /* Update remaining count */
    const remaining = todos.filter(t => !t.completed).length;
    todoCountEl.textContent = `${remaining} item${remaining !== 1 ? 's' : ''} remaining`;
  }

  /* Drag and drop handlers */
  let draggedItem = null;

  function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.todoId);
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.todo-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this !== draggedItem) {
      this.classList.add('drag-over');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    if (draggedItem === this) return;

    const fromId = parseInt(draggedItem.dataset.todoId);
    const toId   = parseInt(this.dataset.todoId);

    const fromIdx = todos.findIndex(t => t.id === fromId);
    const toIdx   = todos.findIndex(t => t.id === toId);

    if (fromIdx === -1 || toIdx === -1) return;

    /* Reorder the array */
    const [moved] = todos.splice(fromIdx, 1);
    todos.splice(toIdx, 0, moved);

    todosSave();
    todosRender();
  }

  /** Add a new todo. */
  function todoAdd() {
    const text = todoInput.value.trim();
    if (!text) return;

    const newTodo = {
      id: Date.now(),
      text,
      completed: false,
      priority: todoPriority.value || 'medium',
      category: todoCategory.value || '',
      dueDate: todoDueDate.value || '',
    };

    todos.push(newTodo);
    todoInput.value = '';
    todoPriority.value = 'medium';
    todoCategory.value = '';
    todoDueDate.value = '';
    todosSave();
    todosRender();
  }

  todoAddBtn.addEventListener('click', todoAdd);
  todoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') todoAdd();
  });

  /** Filter buttons. */
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoFilter = btn.dataset.filter;
      todosRender();
    });
  });

  /** Clear completed. */
  todoClearBtn.addEventListener('click', () => {
    todos = todos.filter(t => !t.completed);
    todosSave();
    todosRender();
  });

  /** Export todos. */
  todoExportBtn.addEventListener('click', () => {
    let text = `Todo List Export - ${new Date().toLocaleString()}\n`;
    text += '═'.repeat(45) + '\n\n';

    const pending = todos.filter(t => !t.completed);
    const done    = todos.filter(t => t.completed);

    if (pending.length > 0) {
      text += `📋 PENDING (${pending.length})\n`;
      text += '─'.repeat(30) + '\n';
      pending.forEach((t, i) => {
        const pri = t.priority ? `[${t.priority.toUpperCase()}]` : '';
        const cat = t.category ? `[${t.category}]` : '';
        const due = t.dueDate ? `[Due: ${t.dueDate}]` : '';
        text += `  ${i + 1}. ${pri}${cat}${due} ${t.text}\n`;
      });
      text += '\n';
    }

    if (done.length > 0) {
      text += `✅ COMPLETED (${done.length})\n`;
      text += '─'.repeat(30) + '\n';
      done.forEach((t, i) => {
        text += `  ${i + 1}. ✓ ${t.text}\n`;
      });
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'todos.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* Migrate old todos that don't have priority/category/dueDate */
  todos.forEach(t => {
    if (!t.priority) t.priority = 'medium';
    if (!t.category) t.category = '';
    if (!t.dueDate) t.dueDate = '';
  });
  todosSave();

  /* Initial render */
  todosRender();

  /* ----------------------------------------------------------
     6. QUICK NOTES
     Enhanced: markdown support with preview toggle, word count
     ---------------------------------------------------------- */
  const notesArea          = document.getElementById('notesArea');
  const notesStatus        = document.getElementById('notesStatus');
  const notesCharCount     = document.getElementById('notesCharCount');
  const notesWordCount     = document.getElementById('notesWordCount');
  const notesClearBtn      = document.getElementById('notesClearBtn');
  const notesDownloadBtn   = document.getElementById('notesDownloadBtn');
  const notesDownloadMdBtn = document.getElementById('notesDownloadMdBtn');
  const notesEditToggle    = document.getElementById('notesEditToggle');
  const notesPreviewToggle = document.getElementById('notesPreviewToggle');
  const notesPreview       = document.getElementById('notesPreview');
  const modalOverlay       = document.getElementById('modalOverlay');
  const modalMessage       = document.getElementById('modalMessage');
  const modalConfirm       = document.getElementById('modalConfirm');
  const modalCancel        = document.getElementById('modalCancel');

  let notesUnsaved   = false;
  let notesSaveTimer = null;
  let notesViewMode  = 'edit'; // 'edit' or 'preview'

  /** Load saved notes. */
  notesArea.value = lsGet('quickNotes', '');

  /** Simple Markdown parser (basic subset). */
  function parseMarkdown(md) {
    let html = md;

    /* Escape HTML */
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    /* Code blocks (``` ... ```) */
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    /* Inline code */
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    /* Headers */
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    /* Bold and Italic */
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    /* Strikethrough */
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    /* Horizontal rule */
    html = html.replace(/^---$/gm, '<hr>');

    /* Blockquote */
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    /* Unordered list */
    html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    /* Links */
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    /* Paragraphs - wrap remaining lines */
    html = html.replace(/^(?!<[hupobl]|<li|<hr|<pre|<code|<del|<strong|<em|<blockquote)(.+)$/gm, '<p>$1</p>');

    /* Clean up extra newlines */
    html = html.replace(/\n{2,}/g, '\n');

    return html;
  }

  /** Update counts. */
  function notesUpdateCounts() {
    const text = notesArea.value;
    notesCharCount.textContent = `${text.length} char${text.length !== 1 ? 's' : ''}`;

    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    notesWordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  }
  notesUpdateCounts();

  /** Update markdown preview. */
  function notesUpdatePreview() {
    notesPreview.innerHTML = parseMarkdown(notesArea.value);
  }

  /** Mark as unsaved. */
  function notesMarkUnsaved() {
    notesUnsaved = true;
    notesStatus.textContent = 'Unsaved';
    notesStatus.className = 'notes-status unsaved';
  }

  /** Save notes to localStorage. */
  function notesSave() {
    lsSet('quickNotes', notesArea.value);
    notesUnsaved = false;
    notesStatus.textContent = 'Saved';
    notesStatus.className = 'notes-status saved';
  }

  /** Toggle edit/preview. */
  notesEditToggle.addEventListener('click', () => {
    notesViewMode = 'edit';
    notesEditToggle.classList.add('active');
    notesPreviewToggle.classList.remove('active');
    notesArea.style.display = '';
    notesPreview.style.display = 'none';
  });

  notesPreviewToggle.addEventListener('click', () => {
    notesViewMode = 'preview';
    notesPreviewToggle.classList.add('active');
    notesEditToggle.classList.remove('active');
    notesArea.style.display = 'none';
    notesPreview.style.display = '';
    notesUpdatePreview();
  });

  /** Debounced auto-save. */
  notesArea.addEventListener('input', () => {
    notesMarkUnsaved();
    notesUpdateCounts();
    if (notesViewMode === 'preview') {
      notesUpdatePreview();
    }
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(notesSave, 2000);
  });

  /** Clear notes – uses custom modal. */
  notesClearBtn.addEventListener('click', () => {
    modalMessage.textContent = 'Are you sure you want to clear all notes? This cannot be undone.';
    modalOverlay.classList.add('visible');

    modalConfirm.onclick = () => {
      notesArea.value = '';
      notesSave();
      notesUpdateCounts();
      if (notesViewMode === 'preview') notesUpdatePreview();
      modalOverlay.classList.remove('visible');
    };

    modalCancel.onclick = () => {
      modalOverlay.classList.remove('visible');
    };

    modalOverlay.onclick = (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('visible');
      }
    };
  });

  /** Download notes as .txt. */
  notesDownloadBtn.addEventListener('click', () => {
    const text = notesArea.value;
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'quick-notes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /** Download notes as .md. */
  notesDownloadMdBtn.addEventListener('click', () => {
    const text = notesArea.value;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'quick-notes.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ----------------------------------------------------------
     END – All modules initialized
     ---------------------------------------------------------- */

});
