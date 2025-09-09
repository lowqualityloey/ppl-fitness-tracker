// Modern Dashboard App
class DashboardApp {
    constructor() {
        this.cachedElements = new Map();
        this.eventListeners = new Map();
        this.init();
    }

    init() {
        try {
            this.cacheElements();
            this.updateCurrentDate();
            this.updateTimeGreeting();
            this.setupEventListeners();
            this.loadUserStats();
            this.setupTouchFeedback();
            this.populateWeeklySchedule();
            this.populateProgressOverview();
            this.populateRecentActivity();
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
        }
    }

    cacheElements() {
        const elements = {
            currentDate: document.getElementById('current-date'),
            timeGreeting: document.getElementById('time-greeting'),
            mobileMenuBtn: document.getElementById('mobile-menu-btn'),
            mobileMenu: document.getElementById('mobile-menu'),
            closeMenuBtn: document.getElementById('close-menu'),
            weeklySchedule: document.getElementById('weekly-schedule'),
            progressOverview: document.getElementById('progress-overview'),
            recentWorkouts: document.getElementById('recent-workouts')
        };
        
        Object.entries(elements).forEach(([key, element]) => {
            this.cachedElements.set(key, element);
        });
    }

    updateCurrentDate() {
        const dateElement = this.cachedElements.get('currentDate');
        if (dateElement) {
            try {
                const now = new Date();
                const options = { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                };
                dateElement.textContent = now.toLocaleDateString('en-US', options);
            } catch (error) {
                console.error('Date update failed:', error);
            }
        }
    }

    updateTimeGreeting() {
        const greetingElement = this.cachedElements.get('timeGreeting');
        if (greetingElement) {
            try {
                const hour = new Date().getHours();
                let greeting = 'Good Morning';
                
                if (hour >= 12 && hour < 17) {
                    greeting = 'Good Afternoon';
                } else if (hour >= 17) {
                    greeting = 'Good Evening';
                }
                
                greetingElement.textContent = greeting;
            } catch (error) {
                console.error('Greeting update failed:', error);
            }
        }
    }

    setupEventListeners() {
        // Mobile menu
        const mobileMenuBtn = this.cachedElements.get('mobileMenuBtn');
        const mobileMenu = this.cachedElements.get('mobileMenu');
        const closeMenuBtn = this.cachedElements.get('closeMenuBtn');
        
        if (mobileMenuBtn && mobileMenu) {
            const openHandler = () => mobileMenu.classList.add('active');
            mobileMenuBtn.addEventListener('click', openHandler);
            this.eventListeners.set('mobileMenuOpen', { element: mobileMenuBtn, handler: openHandler });
        }
        
        if (closeMenuBtn && mobileMenu) {
            const closeHandler = () => mobileMenu.classList.remove('active');
            closeMenuBtn.addEventListener('click', closeHandler);
            this.eventListeners.set('mobileMenuClose', { element: closeMenuBtn, handler: closeHandler });
        }
        
        // Close menu on overlay click
        if (mobileMenu) {
            const overlayHandler = (e) => {
                if (e.target === mobileMenu) {
                    mobileMenu.classList.remove('active');
                }
            };
            mobileMenu.addEventListener('click', overlayHandler);
            this.eventListeners.set('mobileMenuOverlay', { element: mobileMenu, handler: overlayHandler });
        }

        // Bottom navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                this.showFeedback('Navigation updated');
            });
        });

        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.querySelector('span').textContent;
                this.showFeedback(`${action} coming soon!`);
            });
        });

        // Menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const action = item.querySelector('span').textContent;
                this.showFeedback(`${action} selected`);
                if (mobileMenu) {
                    mobileMenu.classList.remove('active');
                }
            });
        });
    }

    loadUserStats() {
        // Simulate loading user stats from localStorage or API
        const stats = this.getUserStats();
        this.updateStatsDisplay(stats);
    }

    getUserStats() {
        // Get stats from localStorage or return defaults
        const saved = localStorage.getItem('userStats');
        if (saved) {
            return JSON.parse(saved);
        }
        
        return {
            streak: 2,
            totalWorkouts: 3,
            hoursTrained: 2.5,
            lastWorkout: 'Push Day',
            nextWorkout: 'Pull Day'
        };
    }

    updateStatsDisplay(stats) {
        const statNumbers = document.querySelectorAll('.stat-number-modern');
        if (statNumbers.length >= 3) {
            statNumbers[0].textContent = stats.streak;
            statNumbers[1].textContent = stats.totalWorkouts;
            statNumbers[2].textContent = `${stats.hoursTrained}h`;
        }
    }

    setupTouchFeedback() {
        // Add haptic feedback for mobile devices
        if ('vibrate' in navigator) {
            document.querySelectorAll('.workout-btn, .action-btn, .cta-button').forEach(btn => {
                btn.addEventListener('click', () => {
                    navigator.vibrate(50);
                });
            });
        }

        // Add visual feedback for touch interactions
        document.querySelectorAll('.workout-card, .stat-card-modern').forEach(card => {
            card.addEventListener('touchstart', () => {
                card.style.transform = 'scale(0.98)';
            });
            
            card.addEventListener('touchend', () => {
                setTimeout(() => {
                    card.style.transform = '';
                }, 150);
            });
        });
    }

    populateWeeklySchedule() {
        const scheduleContainer = this.cachedElements.get('weeklySchedule');
        if (!scheduleContainer) return;

        try {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Rest', 'Rest'];
            const today = new Date().getDay();
            const todayIndex = today === 0 ? 6 : today - 1;

            const fragment = document.createDocumentFragment();
            
            days.forEach((day, index) => {
                const dayElement = document.createElement('div');
                dayElement.className = 'schedule-day';
                
                if (index === todayIndex) dayElement.classList.add('today');
                else if (index < todayIndex) dayElement.classList.add('completed');
                else if (workouts[index] === 'Rest') dayElement.classList.add('rest');

                dayElement.innerHTML = `
                    <div class="day-name">${day}</div>
                    <div class="day-workout">${workouts[index]}</div>
                `;
                
                fragment.appendChild(dayElement);
            });
            
            scheduleContainer.innerHTML = '';
            scheduleContainer.appendChild(fragment);
        } catch (error) {
            console.error('Weekly schedule population failed:', error);
        }
    }

    populateProgressOverview() {
        const progressContainer = this.cachedElements.get('progressOverview');
        if (!progressContainer) return;

        try {
            const stats = [
                { value: '51', label: 'Total Sets' },
                { value: '612', label: 'Total Reps' },
                { value: '66kg', label: 'Current Weight' },
                { value: '25kg', label: 'Lat Pulldown PR' }
            ];

            const fragment = document.createDocumentFragment();
            
            stats.forEach(stat => {
                const item = document.createElement('div');
                item.className = 'progress-item';
                item.innerHTML = `
                    <span class="progress-value">${stat.value}</span>
                    <span class="progress-label">${stat.label}</span>
                `;
                fragment.appendChild(item);
            });
            
            progressContainer.innerHTML = '';
            progressContainer.appendChild(fragment);
        } catch (error) {
            console.error('Progress overview population failed:', error);
        }
    }

    populateRecentActivity() {
        const recentContainer = this.cachedElements.get('recentWorkouts');
        if (!recentContainer) return;

        try {
            const workouts = [
                {
                    type: 'Push Day',
                    date: 'Yesterday',
                    duration: '52 min',
                    rating: 4,
                    gradient: 'var(--push-gradient)'
                },
                {
                    type: 'Pull Day',
                    date: '2 days ago',
                    duration: '48 min',
                    rating: 5,
                    gradient: 'var(--pull-gradient)'
                },
                {
                    type: 'Legs Day',
                    date: '4 days ago',
                    duration: '55 min',
                    rating: 3,
                    gradient: 'var(--legs-gradient)'
                }
            ];

            const fragment = document.createDocumentFragment();
            
            workouts.forEach(workout => {
                const stars = Array.from({ length: 5 }, (_, i) => 
                    `<i class="fas fa-star ${i < workout.rating ? '' : 'empty'}"></i>`
                ).join('');

                const icon = workout.type === 'Push Day' ? 'fist-raised' : 
                            workout.type === 'Pull Day' ? 'arrow-down' : 'running';

                const workoutItem = document.createElement('div');
                workoutItem.className = 'workout-item';
                workoutItem.innerHTML = `
                    <div class="workout-info">
                        <div class="workout-type-icon" style="background: ${workout.gradient}">
                            <i class="fas fa-${icon}"></i>
                        </div>
                        <div class="workout-details">
                            <h4>${workout.type}</h4>
                            <p>${workout.date} • ${workout.duration}</p>
                        </div>
                    </div>
                    <div class="workout-rating">
                        ${stars}
                    </div>
                `;
                
                fragment.appendChild(workoutItem);
            });
            
            recentContainer.innerHTML = '';
            recentContainer.appendChild(fragment);
        } catch (error) {
            console.error('Recent activity population failed:', error);
        }
    }

    showFeedback(message) {
        try {
            // Prevent duplicate notifications
            const existing = document.querySelector('.toast-notification');
            if (existing) existing.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast-notification';
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                top: 100px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 0.75rem 1rem;
                border-radius: 8px;
                font-size: 0.875rem;
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;

            document.body.appendChild(toast);

            // Animate in
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
            });

            // Remove after 2 seconds
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, 2000);
        } catch (error) {
            console.error('Feedback display failed:', error);
        }
    }
    
    cleanup() {
        // Clean up event listeners
        this.eventListeners.forEach(({ element, handler }) => {
            element.removeEventListener('click', handler);
        });
        this.eventListeners.clear();
        this.cachedElements.clear();
    }
}

// Global function for workout navigation
function startWorkout(type) {
    const workoutUrls = {
        push: 'push-day-workout/index.html',
        pull: 'pull-day-workout/index.html',
        legs: 'legs-day-workout/index.html'
    };

    if (workoutUrls[type]) {
        // Add loading state
        const btn = event.target.closest('.cta-button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading...</span>';
            btn.style.opacity = '0.7';
        }

        // Navigate after short delay for UX
        setTimeout(() => {
            window.location.href = workoutUrls[type];
        }, 500);
    }
}

// Global app instance for cleanup
let dashboardAppInstance = null;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    dashboardAppInstance = new DashboardApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (dashboardAppInstance && typeof dashboardAppInstance.cleanup === 'function') {
        dashboardAppInstance.cleanup();
    }
});

// Prevent zoom on double tap (mobile)
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Handle orientation changes
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        window.scrollTo(0, 0);
    }, 100);
});