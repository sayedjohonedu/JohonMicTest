document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
            c.style.animation = 'none';
        });
        
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        target.classList.add('active');
        // Trigger fade-in
        setTimeout(() => {
            target.style.opacity = '1';
            target.style.transform = 'translateY(0)';
        }, 10);
    });
});

function saveLocal(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}
function getLocal(key, def) {
    try { 
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
    } catch(e) { return def; }
}

// ===========================================
// POMODORO TIMER - Enhanced
// ===========================================

let pomoTime = 25 * 60;
let pomoInterval = null;
const pomoDisplay = document.getElementById('pomo-display');
const pomoStart = document.getElementById('pomo-start');
const pomoStop = document.getElementById('pomo-stop');
const pomoReset = document.getElementById('pomo-reset');
const pomoCard = pomoDisplay.closest('.timer-card');

function updatePomoDisplay(animate = false) {
    const m = Math.floor(pomoTime / 60).toString().padStart(2, '0');
    const s = (pomoTime % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    
    if (animate && pomoDisplay.textContent !== timeStr) {
        pomoDisplay.classList.add('pulsing');
        setTimeout(() => pomoDisplay.classList.remove('pulsing'), 300);
    }
    
    pomoDisplay.innerText = timeStr;
    
    // Add visual feedback when time is low
    if (pomoTime <= 60 && pomoTime > 0 && !pomoInterval) {
        pomoDisplay.classList.add('warning');
    } else {
        pomoDisplay.classList.remove('warning');
    }
}

pomoStart.onclick = () => {
    if(pomoInterval) return;
    pomoCard.classList.add('pulse');
    pomoDisplay.classList.remove('warning');
    
    pomoInterval = setInterval(() => {
        if(pomoTime > 0) { 
            pomoTime--; 
            updatePomoDisplay(true);
        }
        else { 
            clearInterval(pomoInterval);
            pomoInterval = null;
            pomoCard.classList.remove('pulse');
            // Completion feedback
            pomoDisplay.classList.add('animate-bounceIn');
            setTimeout(() => pomoDisplay.classList.remove('animate-bounceIn'), 400);
        }
    }, 1000);
};

pomoStop.onclick = () => { 
    clearInterval(pomoInterval); 
    pomoInterval = null;
    pomoCard.classList.remove('pulse');
};

pomoReset.onclick = () => { 
    clearInterval(pomoInterval); 
    pomoInterval = null; 
    pomoTime = 25 * 60; 
    updatePomoDisplay(); 
    pomoCard.classList.remove('pulse');
    pomoDisplay.classList.remove('warning');
};

updatePomoDisplay();

// ===========================================
// STOPWATCH - Enhanced
// ===========================================

let swTime = 0;
let swInterval = null;
const swDisplay = document.getElementById('sw-display');
const swStart = document.getElementById('sw-start');
const swStop = document.getElementById('sw-stop');
const swReset = document.getElementById('sw-reset');
const swCard = swDisplay.closest('.timer-card');

let lastSwTime = 0;
function updateSwDisplay() {
    const ms = swTime % 1000;
    const s = Math.floor(swTime / 1000) % 60;
    const m = Math.floor(swTime / 60000);
    swDisplay.innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}.${Math.floor(ms/10).toString().padStart(2,'0')}`;
}

swStart.onclick = () => {
    if(swInterval) return;
    swCard.classList.add('pulse');
    lastSwTime = Date.now();
    swInterval = setInterval(() => {
        const now = Date.now();
        swTime += now - lastSwTime;
        lastSwTime = now;
        updateSwDisplay();
    }, 10);
};

swStop.onclick = () => { 
    clearInterval(swInterval); 
    swInterval = null;
    swCard.classList.remove('pulse');
};

swReset.onclick = () => { 
    clearInterval(swInterval); 
    swInterval = null; 
    swTime = 0; 
    updateSwDisplay();
    swCard.classList.remove('pulse');
};

updateSwDisplay();

// ===========================================
// COUNTDOWN TIMER - Enhanced
// ===========================================

let cdTime = 0;
let cdInterval = null;
const cdInput = document.getElementById('cd-input');
const cdDisplay = document.getElementById('cd-display');
const cdStart = document.getElementById('cd-start');
const cdStop = document.getElementById('cd-stop');
const cdReset = document.getElementById('cd-reset');
const cdCard = cdDisplay.closest('.timer-card');

function updateCdDisplay(animate = false) {
    const h = Math.floor(cdTime / 3600).toString().padStart(2, '0');
    const m = Math.floor((cdTime % 3600) / 60).toString().padStart(2, '0');
    const s = (cdTime % 60).toString().padStart(2, '0');
    const timeStr = `${h}:${m}:${s}`;
    cdDisplay.innerText = timeStr;
    
    // Warning flash when < 10 seconds
    if (cdTime <= 10 && cdTime > 0 && cdInterval) {
        cdDisplay.classList.add('warning');
    } else {
        cdDisplay.classList.remove('warning');
    }
}

cdStart.onclick = () => {
    if(cdInterval) return;
    if(cdTime === 0) {
        cdTime = parseInt(cdInput.value) || 0;
    }
    if(cdTime <= 0) return;
    
    cdCard.classList.add('pulse');
    cdDisplay.classList.remove('warning');
    
    cdInterval = setInterval(() => {
        if(cdTime > 0) { 
            cdTime--; 
            updateCdDisplay(true);
        }
        else { 
            clearInterval(cdInterval);
            cdInterval = null;
            cdCard.classList.remove('pulse');
            // Completion animation
            cdDisplay.classList.add('animate-bounceIn');
            setTimeout(() => cdDisplay.classList.remove('animate-bounceIn'), 400);
        }
    }, 1000);
};

cdStop.onclick = () => { 
    clearInterval(cdInterval); 
    cdInterval = null;
    cdCard.classList.remove('pulse');
};

cdReset.onclick = () => { 
    clearInterval(cdInterval); 
    cdInterval = null; 
    cdTime = 0; 
    updateCdDisplay(); 
    cdInput.value = '';
    cdCard.classList.remove('pulse');
    cdDisplay.classList.remove('warning');
};

updateCdDisplay();

// ===========================================
// WORLD CLOCK - Enhanced
// ===========================================

const wcDisplay = document.getElementById('wc-display');
const timezones = [
    { name: 'Local', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { name: 'UTC', tz: 'UTC' },
    { name: 'Tokyo', tz: 'Asia/Tokyo' },
    { name: 'New York', tz: 'America/New_York' },
    { name: 'London', tz: 'Europe/London' }
];

// Smooth time updates (once per second)
setInterval(() => {
    const d = new Date();
    const newHTML = timezones.map(t => {
        const timeString = d.toLocaleTimeString('en-US', {timeZone: t.tz, hour: '2-digit', minute: '2-digit', second: '2-digit'});
        return `<div class="clock-row">
            <span class="clock-name">${t.name}</span>
            <span class="clock-time">${timeString}</span>
        </div>`;
    }).join('');
    
    if (wcDisplay.innerHTML !== newHTML) {
        wcDisplay.innerHTML = newHTML;
    }
}, 1000);

// ===========================================
// TODO LIST - Animated
// ===========================================

const todoInput = document.getElementById('todo-input');
const todoAdd = document.getElementById('todo-add');
const todoList = document.getElementById('todo-list');
let todos = getLocal('mictab_todos', []);

function renderTodos() {
    todoList.innerHTML = '';
    todos.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.animation = 'fadeInUp 0.3s var(--ease-smooth) both';
        div.style.animationDelay = `${i * 50}ms`;
        
        const check = document.createElement('div');
        check.className = `todo-check ${t.done ? 'checked' : ''}`;
        check.onclick = () => { 
            todos[i].done = !todos[i].done; 
            saveLocal('mictab_todos', todos); 
            renderTodos(); 
        };
        
        const span = document.createElement('span');
        span.className = `todo-text ${t.done ? 'checked' : ''}`;
        span.innerText = t.text;
        span.onclick = () => { 
            todos[i].done = !todos[i].done; 
            saveLocal('mictab_todos', todos); 
            renderTodos(); 
        };
        
        const delBtn = document.createElement('button');
        delBtn.className = 'todo-delete';
        delBtn.innerHTML = '×';
        delBtn.onclick = () => { 
            // Animate removal
            div.style.animation = 'slideOutLeft 0.3s var(--ease-smooth) forwards';
            setTimeout(() => {
                todos.splice(i, 1);
                saveLocal('mictab_todos', todos);
                renderTodos();
            }, 300);
        };
        
        div.appendChild(check);
        div.appendChild(span);
        div.appendChild(delBtn);
        todoList.appendChild(div);
    });
}

todoAdd.onclick = () => {
    if(!todoInput.value.trim()) return;
    todos.push({text: todoInput.value.trim(), done: false});
    saveLocal('mictab_todos', todos);
    todoInput.value = '';
    renderTodos();
};

todoInput.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') todoAdd.onclick();
});

renderTodos();

// ===========================================
// QUICK NOTES - Enhanced
// ===========================================

const noteArea = document.getElementById('note-area');
const notesClear = document.getElementById('notes-clear');
noteArea.value = getLocal('mictab_notes', '');

noteArea.addEventListener('input', () => {
    saveLocal('mictab_notes', noteArea.value);
    // Subtle animation on change
    noteArea.style.borderColor = 'var(--accent)';
    setTimeout(() => {
        noteArea.style.borderColor = '';
    }, 300);
});

notesClear.addEventListener('click', () => {
    noteArea.value = '';
    saveLocal('mictab_notes', '');
    noteArea.focus();
    noteArea.classList.add('animate-shake');
    setTimeout(() => noteArea.classList.remove('animate-shake'), 500);
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.action-btn, .tab-btn, input, textarea, button').forEach(el => {
        el.classList.add('interactive-element');
    });
});