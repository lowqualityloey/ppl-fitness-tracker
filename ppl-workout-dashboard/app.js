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
            streak: this.calculateStreak(),
            totalWorkouts: this.calculateWeeklyWorkouts(),
            hoursTrained: this.calculateWeeklyHours(),
            lastWorkout: this.getLastWorkout(),
            nextWorkout: this.getTodaysWorkout()
        };
    }
    
    calculateStreak() {
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        
        let streak = 0;
        for (let i = todayIndex - 1; i >= 0; i--) {
            if (workouts[i] !== 'Rest') {
                streak++;
            } else {
                break;
            }
        }
        return Math.max(streak, 1);
    }
    
    calculateWeeklyWorkouts() {
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        
        let completed = 0;
        for (let i = 0; i < todayIndex; i++) {
            if (workouts[i] !== 'Rest') {
                completed++;
            }
        }
        return completed;
    }
    
    calculateWeeklyHours() {
        const completed = this.calculateWeeklyWorkouts();
        return (completed * 0.75).toFixed(1); // 45min average per workout
    }
    
    getLastWorkout() {
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        
        for (let i = todayIndex - 1; i >= 0; i--) {
            if (workouts[i] !== 'Rest') {
                return `${workouts[i]} Day`;
            }
        }
        return 'None this week';
    }

    updateStatsDisplay(stats) {
        const statNumbers = document.querySelectorAll('.stat-number-modern');
        if (statNumbers.length >= 3) {
            statNumbers[0].textContent = stats.streak;
            statNumbers[1].textContent = stats.totalWorkouts;
            statNumbers[2].textContent = `${stats.hoursTrained}h`;
        }
        
        // Update progress bar for streak
        const progressBar = document.querySelector('.stat-progress .progress-bar');
        if (progressBar) {
            const progressPercent = Math.min((stats.streak / 6) * 100, 100);
            progressBar.style.width = `${progressPercent}%`;
        }
        
        // Update weekly trend
        const statTrend = document.querySelector('.stat-trend span');
        if (statTrend) {
            const todaysWorkout = this.getTodaysWorkout();
            if (todaysWorkout !== 'Rest') {
                statTrend.textContent = '+1 today';
            } else {
                statTrend.textContent = 'Rest day';
            }
        }
        
        // Update hero section with today's workout
        this.updateTodaysWorkout();
    }

    getTodaysWorkout() {
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        return workouts[todayIndex];
    }

    updateTodaysWorkout() {
        const todaysWorkout = this.getTodaysWorkout();
        const highlightText = document.querySelector('.highlight-text');
        const heroTitle = document.querySelector('.hero-title');
        
        if (highlightText && heroTitle) {
            if (todaysWorkout === 'Rest') {
                highlightText.textContent = 'Rest Day';
                heroTitle.innerHTML = `Time for your <span class="highlight-text">Rest Day</span> recovery!`;
            } else {
                highlightText.textContent = `${todaysWorkout} Day`;
                heroTitle.innerHTML = `Ready for your <span class="highlight-text">${todaysWorkout} Day</span> workout?`;
            }
        }
        
        // Update CTA button
        const ctaButton = document.querySelector('.cta-button.primary');
        if (ctaButton && todaysWorkout !== 'Rest') {
            const buttonContent = ctaButton.querySelector('.button-content span');
            if (buttonContent) {
                buttonContent.textContent = `Start ${todaysWorkout} Day`;
            }
            ctaButton.setAttribute('onclick', `startWorkout('${todaysWorkout.toLowerCase()}')`);
        } else if (ctaButton && todaysWorkout === 'Rest') {
            const buttonContent = ctaButton.querySelector('.button-content span');
            if (buttonContent) {
                buttonContent.textContent = 'Rest & Recover';
            }
            ctaButton.setAttribute('onclick', 'showRestDayMessage()');
        }
        
        // Update all day-based interactions
        this.updateWorkoutCards(todaysWorkout);
        this.updateMotivationMessage(todaysWorkout);
        this.updateHeroBackground(todaysWorkout);
    }
    
    updateWorkoutCards(todaysWorkout) {
        const workoutCards = document.querySelectorAll('.workout-card');
        
        workoutCards.forEach(card => {
            const workoutName = card.querySelector('.workout-name').textContent.replace(' Day', '');
            const statusBadge = card.querySelector('.status-badge');
            const nextSession = card.querySelector('.next-session');
            const workoutBtn = card.querySelector('.workout-btn');
            
            // Remove all status classes
            card.classList.remove('active', 'completed', 'upcoming');
            statusBadge.className = 'status-badge';
            workoutBtn.classList.remove('active');
            
            if (workoutName === todaysWorkout) {
                // Today's workout
                card.classList.add('active');
                statusBadge.classList.add('today');
                statusBadge.innerHTML = '<i class="fas fa-star"></i>';
                nextSession.textContent = "Today's Focus";
                workoutBtn.classList.add('active');
            } else if (this.isWorkoutCompleted(workoutName)) {
                // Completed workout
                card.classList.add('completed');
                statusBadge.classList.add('completed');
                statusBadge.innerHTML = '<i class="fas fa-check"></i>';
                nextSession.textContent = this.getNextWorkoutDay(workoutName);
            } else {
                // Upcoming workout
                card.classList.add('upcoming');
                statusBadge.classList.add('upcoming');
                statusBadge.innerHTML = '<i class="fas fa-clock"></i>';
                nextSession.textContent = this.getNextWorkoutDay(workoutName);
            }
        });
    }
    
    isWorkoutCompleted(workoutType) {
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        
        // Check if this workout type was already done this week
        for (let i = 0; i < todayIndex; i++) {
            if (workouts[i] === workoutType) {
                return true;
            }
        }
        return false;
    }
    
    getNextWorkoutDay(workoutType) {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        
        const nextDays = [];
        for (let i = 0; i < workouts.length; i++) {
            if (workouts[i] === workoutType) {
                if (i > todayIndex) {
                    nextDays.push(days[i]);
                }
            }
        }
        
        if (nextDays.length === 0) {
            // Next week
            for (let i = 0; i < workouts.length; i++) {
                if (workouts[i] === workoutType) {
                    nextDays.push(days[i]);
                }
            }
        }
        
        return nextDays.length > 1 ? `Next: ${nextDays.join(' & ')}` : `Next: ${nextDays[0] || 'TBD'}`;
    }
    
    updateMotivationMessage(todaysWorkout) {
        const motivationText = document.querySelector('.motivation-text');
        if (!motivationText) return;
        
        const messages = {
            'Push': "Focus on controlled movements and feel the burn in your chest and shoulders!",
            'Pull': "Squeeze your shoulder blades together and feel your back muscles working!",
            'Legs': "Drive through your heels and feel the power in your legs!",
            'Rest': "Recovery is when your muscles grow stronger. Enjoy your rest day!"
        };
        
        motivationText.textContent = `"${messages[todaysWorkout] || messages['Rest']}"`;
    }
    
    updateHeroBackground(todaysWorkout) {
        const heroSection = document.querySelector('.modern-hero');
        if (!heroSection) return;
        
        // Remove existing workout classes
        heroSection.classList.remove('push-theme', 'pull-theme', 'legs-theme', 'rest-theme');
        
        // Add today's workout theme
        const themeClass = todaysWorkout === 'Rest' ? 'rest-theme' : `${todaysWorkout.toLowerCase()}-theme`;
        heroSection.classList.add(themeClass);
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
            const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
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
            const completedWorkouts = this.calculateWeeklyWorkouts();
            const totalSets = completedWorkouts * 16;
            const totalReps = totalSets * 12;
            const weekProgress = Math.round((completedWorkouts / 6) * 100);
            
            const stats = [
                { value: totalSets.toString(), label: 'Total Sets', icon: 'layer-group' },
                { value: totalReps.toString(), label: 'Total Reps', icon: 'redo' },
                { value: `${weekProgress}%`, label: 'Week Progress', icon: 'chart-line' },
                { value: `${this.calculateWeeklyHours()}h`, label: 'Time Trained', icon: 'clock' }
            ];

            const fragment = document.createDocumentFragment();
            
            stats.forEach(stat => {
                const item = document.createElement('div');
                item.className = 'progress-item';
                item.innerHTML = `
                    <div class="progress-icon">
                        <i class="fas fa-${stat.icon}"></i>
                    </div>
                    <div class="progress-details">
                        <span class="progress-value">${stat.value}</span>
                        <span class="progress-label">${stat.label}</span>
                    </div>
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
            const workouts = this.generateRecentWorkouts();

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
                            <div class="workout-stats-mini">
                                <span><i class="fas fa-dumbbell"></i> ${workout.sets} sets</span>
                                <span><i class="fas fa-fire"></i> ${workout.calories} cal</span>
                            </div>
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
    
    generateRecentWorkouts() {
        const today = new Date().getDay();
        const todayIndex = today === 0 ? 6 : today - 1;
        const workouts = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'];
        
        const recentWorkouts = [];
        let dayOffset = 1;
        
        for (let i = todayIndex - 1; i >= 0 && recentWorkouts.length < 3; i--) {
            if (workouts[i] !== 'Rest') {
                const workoutType = `${workouts[i]} Day`;
                const gradient = workouts[i] === 'Push' ? 'var(--push-gradient)' :
                               workouts[i] === 'Pull' ? 'var(--pull-gradient)' : 'var(--legs-gradient)';
                
                recentWorkouts.push({
                    type: workoutType,
                    date: dayOffset === 1 ? 'Yesterday' : `${dayOffset} days ago`,
                    duration: `${45 + Math.floor(Math.random() * 15)} min`,
                    sets: workouts[i] === 'Push' ? 17 : 16,
                    calories: 250 + Math.floor(Math.random() * 100),
                    rating: 4 + Math.floor(Math.random() * 2),
                    gradient: gradient
                });
                dayOffset++;
            } else {
                dayOffset++;
            }
        }
        
        while (recentWorkouts.length < 3) {
            const workoutTypes = ['Push Day', 'Pull Day', 'Legs Day'];
            const randomType = workoutTypes[Math.floor(Math.random() * workoutTypes.length)];
            const gradient = randomType === 'Push Day' ? 'var(--push-gradient)' :
                           randomType === 'Pull Day' ? 'var(--pull-gradient)' : 'var(--legs-gradient)';
            
            recentWorkouts.push({
                type: randomType,
                date: `${dayOffset} days ago`,
                duration: `${45 + Math.floor(Math.random() * 15)} min`,
                sets: randomType === 'Push Day' ? 17 : 16,
                calories: 250 + Math.floor(Math.random() * 100),
                rating: 3 + Math.floor(Math.random() * 3),
                gradient: gradient
            });
            dayOffset++;
        }
        
        return recentWorkouts;
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

// Global function for rest day message
function showRestDayMessage() {
    if (dashboardAppInstance) {
        dashboardAppInstance.showFeedback('🛌 Rest day! Your muscles need time to recover and grow stronger.');
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