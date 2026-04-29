// Tab Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

// Keyboard Tester
document.addEventListener('keydown', (e) => {
    if (!document.getElementById('keyboard-test').classList.contains('active')) return;
    
    // prevent default actions for testing
    if (e.code !== 'F5' && e.code !== 'F12' && e.code !== 'KeyI') { // keep devtools accessible ideally
       e.preventDefault(); 
    }

    document.getElementById('last-key').textContent = `${e.key} (Code: ${e.code})`;
    
    const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
    if (keyEl) {
        keyEl.classList.add('active');
        keyEl.classList.add('pressed'); // permanent record it was tested
    }
});

document.addEventListener('keyup', (e) => {
    if (!document.getElementById('keyboard-test').classList.contains('active')) return;
    e.preventDefault();
    const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
    if (keyEl) {
        keyEl.classList.remove('active');
    }
});
