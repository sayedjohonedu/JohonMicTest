/**
 * MicTab Shared Utilities
 * Professional interactions and animations
 */

(function() {
    'use strict';

    // ===========================================
    // HAPTIC FEEDBACK SIMULATION
    // ===========================================

    const Haptic = {
        // Light impact (like keyboard tap)
        light() {
            this.trigger('light');
        },
        // Medium impact (button press)
        medium() {
            this.trigger('medium');
        },
        // Heavy impact (confirmation)
        heavy() {
            this.trigger('heavy');
        },
        // Selection change (like picker scroll)
        selection() {
            this.trigger('selection');
        },
        // Success (checkmark)
        success() {
            this.trigger('success');
        },
        // Error (shake)
        error() {
            this.trigger('error');
        },
        trigger(type) {
            // Check if vibration API is available
            if ('vibrate' in navigator) {
                const patterns = {
                    light: [10],
                    medium: [15],
                    heavy: [20],
                    selection: [5, 10, 5],
                    success: [10, 20, 10],
                    error: [30, 20, 30]
                };
                navigator.vibrate(patterns[type] || [10]);
            }
            
            // Also trigger visual feedback on the active element
            const active = document.activeElement;
            if (active && (active.tagName === 'BUTTON' || active.tagName === 'INPUT' || active.classList.contains('action-btn'))) {
                active.classList.add('haptic-feedback');
                setTimeout(() => active.classList.remove('haptic-feedback'), 300);
            }
        }
    };

    // Expose globally
    window.Haptic = Haptic;

    // ===========================================
    // PAGE TRANSITIONS
    // ===========================================

    const PageTransition = {
        init() {
            // Animate container on page load
            document.body.classList.add('page-loading');
            
            // Remove loading class after animation completes
            setTimeout(() => {
                document.body.classList.remove('page-loading');
            }, 600);
            
            // Add transition to links
            document.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', (e) => {
                    // Only for internal navigation
                    if (link.href && link.href.indexOf(window.location.origin) !== -1) {
                        document.body.classList.add('page-transition-exit');
                    }
                });
            });
        }
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        PageTransition.init();
    });

    window.PageTransition = PageTransition;

    // ===========================================
    // SMOOTH NUMBER COUNTER ANIMATION
    // ===========================================

    function animateValue(element, start, end, duration = 600, easing = 'easeOutCubic') {
        const startTime = performance.now();
        const range = end - start;
        
        const easings = {
            linear: t => t,
            easeOutQuad: t => t * (2 - t),
            easeOutCubic: t => (--t) * t * t + 1,
            easeOutQuart: t => 1 - (--t) * t * t * t,
            easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        };
        
        const ease = easings[easing] || easings.easeOutCubic;
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = ease(progress);
            const current = Math.round(start + range * easedProgress);
            
            element.textContent = current;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = end;
                // Bounce effect on completion
                element.classList.add('animate-bounceIn');
                setTimeout(() => element.classList.remove('animate-bounceIn'), 400);
            }
        }
        
        requestAnimationFrame(update);
    }

    window.animateValue = animateValue;

    // ===========================================
    // RIPPLE EFFECT FOR BUTTONS
    // ===========================================

    function createRipple(event, button) {
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;
        
        button.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // Add ripple to all action buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('action-btn') || 
            e.target.closest('.action-btn')) {
            const button = e.target.classList.contains('action-btn') ? e.target : e.target.closest('.action-btn');
            createRipple(e, button);
        }
    });

    // ===========================================
    // SCROLL SMOOTHING
    // ===========================================

    // Smooth scroll for tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            const scrollLeft = btn.offsetLeft - (parent.offsetWidth - btn.offsetWidth) / 2;
            parent.scrollTo({
                left: scrollLeft,
                behavior: 'smooth'
            });
        });
    });

    // ===========================================
    // TOUCH FEEDBACK MOBILE
    // ===========================================

    // Add touch feedback to all interactive elements
    document.querySelectorAll('.interactive-element, button, input, textarea, .action-btn, .tab-btn, .list-item').forEach(el => {
        el.addEventListener('touchstart', () => {
            el.classList.add('touch-active');
        }, { passive: true });
        
        el.addEventListener('touchend', () => {
            el.classList.remove('touch-active');
        }, { passive: true });
        
        el.addEventListener('touchcancel', () => {
            el.classList.remove('touch-active');
        }, { passive: true });
    });

    // ===========================================
    // KEYBOARD SHORTCUTS
    // ===========================================

    document.addEventListener('keydown', (e) => {
        // Escape to go back
        if (e.key === 'Escape') {
            const backLink = document.querySelector('.nav-btn[href="../index.html"]');
            if (backLink) {
                backLink.click();
            }
        }
    });

})();
