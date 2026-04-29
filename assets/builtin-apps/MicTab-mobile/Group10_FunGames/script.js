// ===========================================
// MicTab Fun & Games - Professional Edition
// ===========================================

// Tab Navigation with smooth transitions
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.app-view').forEach(v => {
            v.classList.remove('active');
            v.style.animation = 'none';
        });
        
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        target.classList.add('active');
        triggerAnimation(target);
    });
});

function triggerAnimation(el) {
    el.style.animation = 'none';
    void el.offsetWidth; // Trigger reflow
    el.style.animation = 'fadeInUp 0.4s var(--ease-smooth) both';
}

// ===========================================
// RANDOM NUMBER
// ===========================================

function pickRandomNumber() {
    const min = parseInt(document.getElementById('num-min').value) || 0;
    const max = parseInt(document.getElementById('num-max').value) || 100;
    if(min > max) return;
    
    const res = Math.floor(Math.random() * (max - min + 1)) + min;
    const el = document.getElementById('num-res');
    
    // Animate the result
    animateNumberChange(el, res);
}

function animateNumberChange(el, finalValue) {
    const duration = 600;
    const steps = 20;
    const stepDuration = duration / steps;
    let currentStep = 0;
    
    const startValue = parseInt(el.textContent) || 0;
    const range = finalValue - startValue;
    
    const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        const current = Math.round(startValue + range * eased);
        el.textContent = current;
        
        if (currentStep >= steps) {
            clearInterval(interval);
            el.textContent = finalValue;
            el.classList.add('animate-bounceIn');
            setTimeout(() => el.classList.remove('animate-bounceIn'), 400);
        }
    }, stepDuration);
}

// ===========================================
// DICE ROLLER - 3D Animation
// ===========================================

function rollDice() {
    const count = parseInt(document.getElementById('dice-count').value) || 1;
    count = Math.min(Math.max(count, 1), 10); // Clamp 1-10
    
    const diceElements = [];
    const container = document.getElementById('dice-res');
    
    // Clear previous
    container.innerHTML = '';
    
    // Create dice elements
    for(let i = 0; i < count; i++) {
        const dice = document.createElement('div');
        dice.className = 'dice';
        dice.textContent = '⚀';
        container.appendChild(dice);
        diceElements.push(dice);
    }
    
    // Start rolling animation
    diceElements.forEach((dice, index) => {
        setTimeout(() => {
            dice.classList.add('rolling');
        }, index * 100);
    });
    
    // Set final results after animation
    setTimeout(() => {
        const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        diceElements.forEach(dice => {
            const result = faces[Math.floor(Math.random() * 6)];
            dice.textContent = result;
            dice.classList.remove('rolling');
            dice.style.transform = getDiceRotationForFace(result);
        });
    }, 600);
}

function getDiceRotationForFace(face) {
    const rotations = {
        '⚀': 'rotateX(0deg) rotateY(0deg)',
        '⚁': 'rotateX(0deg) rotateY(180deg)',
        '⚂': 'rotateX(180deg) rotateY(0deg)',
        '⚃': 'rotateX(180deg) rotateY(180deg)',
        '⚄': 'rotateX(0deg) rotateY(90deg)',
        '⚅': 'rotateX(0deg) rotateY(270deg)'
    };
    return rotations[face] || 'rotateX(0deg) rotateY(0deg)';
}

// ===========================================
// COIN FLIP - Professional 3D Animation
// ===========================================

function flipCoin() {
    const btn = document.querySelector('#coin-flip .action-btn');
    btn.disabled = true;
    btn.textContent = 'Flipping...';
    
    const container = document.getElementById('coin-res');
    container.innerHTML = '';
    
    // Create coin element
    const coin = document.createElement('div');
    coin.className = 'coin-container';
    coin.innerHTML = `
        <div class="coin">
            <div class="coin-face coin-heads">H</div>
            <div class="coin-face coin-tails">T</div>
        </div>
    `;
    container.appendChild(coin);
    
    const coinElement = coin.querySelector('.coin');
    
    // Determine result
    const isHeads = Math.random() < 0.5;
    const finalRotation = isHeads ? 720 : 720 + 180; // 2 full spins + half for tails
    
    // Trigger flip
    setTimeout(() => {
        coinElement.style.transform = `rotateY(${finalRotation}deg)`;
    }, 50);
    
    // Show result
    setTimeout(() => {
        const resultEl = document.createElement('div');
        resultEl.className = 'big-result animate-bounceIn';
        resultEl.textContent = isHeads ? 'Heads' : 'Tails';
        container.innerHTML = '';
        container.appendChild(resultEl);
        btn.disabled = false;
        btn.textContent = 'Flip Coin';
    }, 800);
}

// ===========================================
// RANDOM DECISION MAKER
// ===========================================

function makeDecision() {
    const lines = document.getElementById('dec-input').value.split('\n').filter(l => l.trim().length > 0);
    if(lines.length === 0) return;
    
    const el = document.getElementById('dec-res');
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
        const res = lines[Math.floor(Math.random() * lines.length)];
        el.textContent = res;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        el.classList.add('animate-bounceIn');
        setTimeout(() => el.classList.remove('animate-bounceIn'), 400);
    }, 200);
}

// ===========================================
// TRUTH OR DARE
// ===========================================

const truths = [
    "What's your biggest fear?",
    "What's a secret you've never told anyone?",
    "What's the most embarrassing thing you've done?",
    "Have you ever cheated on a test?",
    "What's your worst habit?",
    "What's your biggest regret?",
    "What's the silliest thing you've ever done?",
    "Who is your secret crush?"
];

const dares = [
    "Do 10 pushups.",
    "Sing a song out loud.",
    "Do your best dance move.",
    "Speak in an accent for the next 3 rounds.",
    "Let someone tickle you for 30 seconds.",
    "Send a funny face to your closest contact.",
    "Walk like a penguin for 30 seconds.",
    "Do your best impression of someone in the room."
];

function getTruth() { 
    const el = document.getElementById('td-res');
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = truths[Math.floor(Math.random() * truths.length)];
        el.style.opacity = '1';
        el.classList.add('animate-bounceIn');
        setTimeout(() => el.classList.remove('animate-bounceIn'), 400);
    }, 200);
}

function getDare() { 
    const el = document.getElementById('td-res');
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = dares[Math.floor(Math.random() * dares.length)];
        el.style.opacity = '1';
        el.classList.add('animate-bounceIn');
        setTimeout(() => el.classList.remove('animate-bounceIn'), 400);
    }, 200);
}

// ===========================================
// WOULD YOU RATHER
// ===========================================

const wyrs = [
    "Would you rather fly or be invisible?",
    "Would you rather always be 10 minutes late or 20 minutes early?",
    "Would you rather lose all of your money and valuables or all of the pictures you have ever taken?",
    "Would you rather be able to talk to animals or speak all human languages?",
    "Would you rather live without the internet or live without AC and heating?",
    "Would you rather have unlimited money but look ugly, or be super attractive but broke?",
    "Would you rather know how you will die or when you will die?",
    "Would you rather give up your smartphone or your pet?"
];

function getWYR() { 
    const el = document.getElementById('wyr-res');
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = wyrs[Math.floor(Math.random() * wyrs.length)];
        el.style.opacity = '1';
        el.classList.add('animate-bounceIn');
        setTimeout(() => el.classList.remove('animate-bounceIn'), 400);
    }, 200);
}

// ===========================================
// TRIVIA QUIZ - Enhanced
// ===========================================

const triviaDB = [];
for(let i=1; i<=50; i++) {
    let q = {
        question: `Sample Trivia Question ${i} - What is ${i} + ${i}?`,
        correct: (i+i).toString(),
        wrong: [(i+i+1).toString(), (i+i-1).toString(), (i*i).toString()]
    };
    if (i === 1) q = { question: "What is the capital of France?", correct: "Paris", wrong: ["London", "Berlin", "Madrid"] };
    if (i === 2) q = { question: "Who wrote Hamlet?", correct: "William Shakespeare", wrong: ["Charles Dickens", "J.K. Rowling", "Leo Tolstoy"] };
    if (i === 3) q = { question: "What is the largest planet in our solar system?", correct: "Jupiter", wrong: ["Saturn", "Mars", "Earth"] };
    triviaDB.push(q);
}

let currentTriviaIdx = 0;
let triviaScore = 0;

function startTrivia() {
    const statusEl = document.getElementById('trivia-status');
    statusEl.textContent = '';
    statusEl.style.color = 'var(--text-secondary)';
    
    const q = triviaDB[Math.floor(Math.random() * triviaDB.length)];
    const qEl = document.getElementById('trivia-q');
    qEl.classList.remove('animate-bounceIn');
    void qEl.offsetWidth;
    qEl.textContent = q.question;
    qEl.classList.add('animate-bounceIn');
    
    let opts = [q.correct, ...q.wrong];
    opts.sort(() => Math.random() - 0.5);
    
    const optsDiv = document.getElementById('trivia-opts');
    optsDiv.innerHTML = '';
    
    opts.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'trivia-btn';
        btn.textContent = opt;
        btn.style.animationDelay = `${index * 50}ms`;
        btn.onclick = () => {
            if (!btn.disabled) {
                const isCorrect = opt === q.correct;
                if (isCorrect) {
                    btn.classList.add('correct');
                    statusEl.textContent = 'Correct!';
                    statusEl.style.color = 'var(--success-color)';
                    triviaScore++;
                    document.getElementById('trivia-score').textContent = triviaScore;
                } else {
                    btn.classList.add('wrong');
                    statusEl.textContent = `Wrong! Correct: ${q.correct}`;
                    statusEl.style.color = 'var(--danger-color)';
                }
                triggerAnimation(statusEl);
                optsDiv.querySelectorAll('button').forEach(b => b.disabled = true);
            }
        };
        optsDiv.appendChild(btn);
    });
}

// ===========================================
// TYPING SPEED TEST - Enhanced
// ===========================================

const typeText = "The quick brown fox jumps over the lazy dog. Programming is fun and challenging. Practice makes perfect.";
let startTime = null;

const typeInput = document.getElementById('type-input');
const typeRes = document.getElementById('type-res');
const textDisplay = document.getElementById('type-text');

document.getElementById('type-text').textContent = typeText;

function resetTyping() {
    typeInput.value = '';
    typeRes.textContent = 'WPM: 0 | Accuracy: 0%';
    startTime = null;
    typeInput.disabled = false;
    typeInput.focus();
    textDisplay.style.color = 'var(--text-secondary)';
}

typeInput.addEventListener('input', () => {
    if(!startTime) {
        startTime = new Date().getTime();
    }
    
    const val = typeInput.value;
    const target = typeText.substring(0, val.length);
    
    let errors = 0;
    for(let i=0; i<val.length; i++){
        if(val[i] !== typeText[i]) errors++;
    }
    
    let accuracy = val.length > 0 ? Math.floor(((val.length - errors) / val.length) * 100) : 100;
    let words = val.length / 5;
    let mins = (new Date().getTime() - startTime) / 60000;
    let wpm = mins > 0 ? Math.floor(words / mins) : 0;
    
    typeRes.textContent = `WPM: ${wpm} | Accuracy: ${accuracy}%`;
    
    // Color feedback
    if (val.length > 0 && val[val.length - 1] !== typeText[val.length - 1]) {
        typeRes.style.color = 'var(--danger-color)';
    } else {
        typeRes.style.color = 'var(--accent-color)';
    }
    
    if (val === typeText) {
        typeInput.disabled = true;
        typeRes.textContent += " - FINISHED!";
        typeRes.style.color = 'var(--success-color)';
        typeRes.classList.add('animate-bounceIn');
        textDisplay.style.color = 'var(--success-color)';
    }
});

// ===========================================
// REACTION TIME - Enhanced
// ===========================================

const reactBox = document.getElementById('react-box');
const reactRes = document.getElementById('react-res');
let reactState = 'idle';
let reactTimeout = null;
let reactStart = 0;

reactBox.addEventListener('click', () => {
    reactBox.classList.remove('pulse');
    
    if (reactState === 'idle') {
        reactBox.classList.add('waiting');
        reactBox.textContent = 'Wait for Green...';
        reactState = 'waiting';
        const delay = Math.floor(Math.random() * 3000) + 1000;
        reactTimeout = setTimeout(() => {
            reactBox.classList.remove('waiting');
            reactBox.classList.add('ready');
            reactBox.textContent = 'CLICK!';
            reactState = 'ready';
            reactStart = new Date().getTime();
        }, delay);
    } else if (reactState === 'waiting') {
        clearTimeout(reactTimeout);
        reactBox.classList.remove('waiting');
        reactBox.textContent = 'Too soon! Click to try again.';
        reactState = 'idle';
        triggerAnimation(reactBox);
    } else if (reactState === 'ready') {
        const time = new Date().getTime() - reactStart;
        reactBox.classList.remove('ready');
        reactBox.textContent = 'Click to Start';
        reactState = 'idle';
        reactRes.textContent = `Latest: ${time} ms`;
        reactRes.classList.add('animate-bounceIn');
        setTimeout(() => reactRes.classList.remove('animate-bounceIn'), 400);
    }
});

// ===========================================
// SPIN WHEEL - Advanced Animation
// ===========================================

function spinWheel() {
    const itemsInput = document.getElementById('wheel-items').value;
    const items = itemsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if(items.length === 0) return;
    
    const display = document.querySelector('.wheel-display');
    const resultEl = document.getElementById('wheel-res');
    
    // Reset rotation
    display.style.transition = 'none';
    display.style.transform = 'rotate(0deg)';
    void display.offsetWidth; // Trigger reflow
    
    // Get random item
    const selectedIndex = Math.floor(Math.random() * items.length);
    const selectedItem = items[selectedIndex];
    
    // Calculate final angle (multiple full spins + position)
    const baseRotations = 5; // 5 full spins
    const segmentAngle = 360 / items.length;
    const targetAngle = (baseRotations * 360) + (selectedIndex * segmentAngle);
    
    // Apply animation
    display.style.transition = `transform var(--duration-wheel) cubic-bezier(0.25, 0.1, 0.25, 1)`;
    display.style.transform = `rotate(${targetAngle}deg)`;
    
    // Show result after animation
    setTimeout(() => {
        resultEl.textContent = `🎯 ${selectedItem}`;
        resultEl.classList.add('animate-bounceIn');
        setTimeout(() => resultEl.classList.remove('animate-bounceIn'), 400);
    }, 2000);
}

// ===========================================
// INITIALIZE
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    // Add smooth class to all interactive elements
    document.querySelectorAll('.action-btn, .tab-btn, input, textarea').forEach(el => {
        el.classList.add('interactive-element');
    });
});
