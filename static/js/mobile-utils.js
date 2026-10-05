/**
 * Mobile utilities for ELP System
 */

// Mobile detection
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Touch device detection
function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// iOS detection
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Android detection
function isAndroid() {
    return /Android/.test(navigator.userAgent);
}

// PWA detection
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// Initialize mobile optimizations
document.addEventListener('DOMContentLoaded', function() {
    initializeMobileOptimizations();
});

function initializeMobileOptimizations() {
    // Add mobile class to body
    if (isMobileDevice()) {
        document.body.classList.add('mobile-device');
    }
    
    if (isTouchDevice()) {
        document.body.classList.add('touch-device');
    }
    
    if (isIOS()) {
        document.body.classList.add('ios-device');
        handleIOSSpecificOptimizations();
    }
    
    if (isAndroid()) {
        document.body.classList.add('android-device');
    }
    
    if (isPWA()) {
        document.body.classList.add('pwa-mode');
    }
    
    // Initialize touch feedback
    initializeTouchFeedback();
    
    // Initialize mobile notifications
    initializeMobileNotifications();
    
    // Handle viewport changes
    handleViewportChanges();
    
    // Optimize forms for mobile
    optimizeFormsForMobile();
}

function handleIOSSpecificOptimizations() {
    // Fix iOS viewport height issues
    function setViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    
    // Prevent zoom on input focus
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            if (this.style.fontSize !== '16px') {
                this.style.fontSize = '16px';
            }
        });
    });
}

function initializeTouchFeedback() {
    // Touch feedback removido - sem animações nos cards
    console.log('Touch feedback desabilitado conforme solicitado');
}

function initializeMobileNotifications() {
    // Override default alert for mobile
    window.showMobileNotification = function(message, type = 'info', duration = 3000) {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.mobile-notification');
        existingNotifications.forEach(notif => notif.remove());
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `mobile-notification ${type}`;
        notification.textContent = message;
        
        // Add to DOM
        document.body.appendChild(notification);
        
        // Auto remove
        setTimeout(() => {
            notification.style.animation = 'slideDown 0.3s ease forwards';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
        
        return notification;
    };
    
    // Override console.log for mobile debugging (optional)
    if (isMobileDevice() && !window.location.search.includes('debug=1')) {
        const originalLog = console.log;
        console.log = function(...args) {
            // Only log in development
            if (window.location.hostname === 'localhost' || window.location.hostname.includes('replit')) {
                originalLog.apply(console, args);
            }
        };
    }
}

function handleViewportChanges() {
    let resizeTimeout;
    
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            // Handle responsive adjustments
            adjustModalSizes();
            adjustTableResponsiveness();
        }, 250);
    });
    
    window.addEventListener('orientationchange', function() {
        setTimeout(function() {
            // Force layout recalculation after orientation change
            document.body.style.display = 'none';
            document.body.offsetHeight; // Trigger reflow
            document.body.style.display = '';
            
            adjustModalSizes();
        }, 100);
    });
}

function adjustModalSizes() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const dialog = modal.querySelector('.modal-dialog');
        if (dialog && window.innerWidth <= 576) {
            dialog.style.margin = '8px';
            dialog.style.width = 'calc(100% - 16px)';
            dialog.style.maxWidth = 'none';
        }
    });
}

function adjustTableResponsiveness() {
    const tables = document.querySelectorAll('.table:not(.table-responsive *)');
    tables.forEach(table => {
        if (!table.parentElement.classList.contains('table-responsive')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'table-responsive';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        }
    });
}

function optimizeFormsForMobile() {
    // Auto-resize textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });
    
    // Add loading states to form submissions
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            // Check if submission was prevented (e.g. by confirm dialog cancellation)
            if (e.defaultPrevented) return;

            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submitButton && !submitButton.disabled) {
                submitButton.disabled = true;
                submitButton.classList.add('loading-mobile');
                
                const originalText = submitButton.textContent;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + originalText;
                
                // Re-enable after timeout as fallback
                setTimeout(() => {
                    if (submitButton.disabled) {
                        submitButton.disabled = false;
                        submitButton.classList.remove('loading-mobile');
                        submitButton.textContent = originalText;
                    }
                }, 30000);
            }
        });
    });
}

// Utility functions for mobile development
window.MobileUtils = {
    isMobile: isMobileDevice,
    isTouch: isTouchDevice,
    isIOS: isIOS,
    isAndroid: isAndroid,
    isPWA: isPWA,
    showNotification: function(message, type, duration) {
        return window.showMobileNotification(message, type, duration);
    },
    vibrate: function(pattern = 200) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    },
    getViewportHeight: function() {
        return window.innerHeight;
    },
    getViewportWidth: function() {
        return window.innerWidth;
    },
    isLandscape: function() {
        return window.innerWidth > window.innerHeight;
    },
    isPortrait: function() {
        return window.innerHeight > window.innerWidth;
    },
    preventZoom: function(element) {
        element.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });
    },
    addTouchRipple: function(element) {
        element.addEventListener('touchstart', function(e) {
            const ripple = document.createElement('span');
            ripple.className = 'touch-ripple';
            
            const rect = element.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.touches[0].clientX - rect.left - size / 2;
            const y = e.touches[0].clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255,255,255,0.3);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            element.style.position = 'relative';
            element.style.overflow = 'hidden';
            element.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    }
};

// CSS de touch removido - sem animações nos cards
const style = document.createElement('style');
style.textContent = `
    /* Touch feedback removido */
    
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    @keyframes slideDown {
        to {
            transform: translate(-50%, 100px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.MobileUtils;
}