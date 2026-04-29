// touch-simulator.js - Adds touch-like drag scrolling to the entire application to mimic a mobile OS

document.addEventListener('DOMContentLoaded', () => {
    // Determine the main scrollable containers
    const scrollContainers = document.querySelectorAll('.content, body, .app-grid');
    
    scrollContainers.forEach(ele => {
        let isDown = false;
        let startX;
        let startY;
        let scrollLeft;
        let scrollTop;
        let didMove = false;

        ele.addEventListener('mousedown', (e) => {
            isDown = true;
            didMove = false;
            ele.style.cursor = 'grabbing';
            // Disable text selection during drag
            ele.style.userSelect = 'none';

            startX = e.clientX;
            startY = e.clientY;
            
            // Handle document body scrolling differently than div scrolling
            if (ele === document.body) {
                scrollLeft = window.scrollX || document.documentElement.scrollLeft;
                scrollTop = window.scrollY || document.documentElement.scrollTop;
            } else {
                scrollLeft = ele.scrollLeft;
                scrollTop = ele.scrollTop;
            }
            
            // Prevent default drag of images/links so we can scroll
            if (e.target.tagName === 'A' || e.target.tagName === 'IMG') {
                e.preventDefault();
            }
        });

        const mouseLeaveHandler = () => {
            if (!isDown) return;
            isDown = false;
            ele.style.cursor = '';
            ele.style.userSelect = '';
        };

        const mouseUpHandler = () => {
            if (!isDown) return;
            isDown = false;
            ele.style.cursor = '';
            ele.style.userSelect = '';
        };

        ele.addEventListener('mouseleave', mouseLeaveHandler);
        ele.addEventListener('mouseup', mouseUpHandler);
        window.addEventListener('mouseup', mouseUpHandler); // Catch release outside

        ele.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            
            const x = e.clientX;
            const y = e.clientY;
            
            // Consider it a drag if moved more than 5px to avoid preventing normal clicks
            if (Math.abs(x - startX) > 5 || Math.abs(y - startY) > 5) {
                didMove = true;
            }

            if (didMove) {
                e.preventDefault();
                // Multiplier 1.5 for faster, fluid scrolling
                const walkX = (x - startX) * 1.5;
                const walkY = (y - startY) * 1.5;

                if (ele === document.body) {
                    window.scrollTo(scrollLeft - walkX, scrollTop - walkY);
                } else {
                    ele.scrollLeft = scrollLeft - walkX;
                    ele.scrollTop = scrollTop - walkY;
                }
            }
        });

        // Prevent click if we were dragging
        ele.addEventListener('click', (e) => {
            if (didMove) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    });

    // Make everything unselectable by default to mimic mobile apps
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    // Except for inputs and textareas which users must be able to interact with normally
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.style.userSelect = 'text';
        input.style.webkitUserSelect = 'text';
        // Stop propagation of mousedown so drag script doesn't prevent focus
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
    });
});