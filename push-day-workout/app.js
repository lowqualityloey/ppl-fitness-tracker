// Workout App JavaScript - Fixed Version
class WorkoutApp {
    constructor() {
        this.currentPhase = 'pre-workout';
        this.timers = {};
        this.state = {
            preWorkoutChecklist: {},
            warmupExercises: {},
            mainWorkoutSets: {},
            stretchingExercises: {},
            postWorkoutChecklist: {},
            phaseCompletion: {
                'pre-workout': false,
                'warm-up': false,
                'main-workout': false,
                'post-workout': false
            }
        };
        
        this.loadProgress();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.restoreWorkoutState();
        this.updatePhaseButtons();
        this.setupConfidencePanel();
    }

    setupEventListeners() {
        // Pre-workout checklist
        document.querySelectorAll('#pre-workout .checklist-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleChecklistChange('preWorkout', e.target.id, e.target.checked);
            });
        });

        // Phase progression buttons - Fixed event listeners
        const startWarmupBtn = document.getElementById('start-warmup');
        if (startWarmupBtn) {
            startWarmupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Start warmup clicked');
                this.goToPhase('warm-up');
            });
        }

        const startMainBtn = document.getElementById('start-main');
        if (startMainBtn) {
            startMainBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Start main workout clicked');
                this.goToPhase('main-workout');
            });
        }

        const startStretchingBtn = document.getElementById('start-stretching');
        if (startStretchingBtn) {
            startStretchingBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Start stretching clicked');
                this.goToPhase('post-workout');
            });
        }

        const completeWorkoutBtn = document.getElementById('complete-workout');
        if (completeWorkoutBtn) {
            completeWorkoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Complete workout clicked');
                this.clearProgress();
                this.goToPhase('completion');
            });
        }

        const restartWorkoutBtn = document.getElementById('restart-workout');
        if (restartWorkoutBtn) {
            restartWorkoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.restartWorkout();
            });
        }

        // Progress bar step navigation
        document.querySelectorAll('.progress-step').forEach(step => {
            step.addEventListener('click', (e) => {
                const phase = step.getAttribute('data-phase');
                if (phase && this.canAccessPhase(phase)) {
                    this.goToPhase(phase);
                }
            });
        });

        // Warm-up timers
        this.setupTimer('cardio', 5 * 60); // 5 minutes
        
        // Warm-up exercise checkboxes
        document.querySelectorAll('#warm-up .exercise-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleWarmupExerciseChange(e.target.id, e.target.checked);
            });
        });

        // Main workout set tracking
        document.querySelectorAll('.set-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleSetCompletion(e.target.id, e.target.checked);
            });
        });

        // Rest timers for main workout
        for (let i = 1; i <= 6; i++) {
            this.setupRestTimer(i);
        }

        // Stretching timers and checkboxes
        this.setupStretchingTimers();
        document.querySelectorAll('#post-workout .exercise-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleStretchingChange(e.target.id, e.target.checked);
            });
        });

        // Cooldown timer
        this.setupTimer('cooldown', 10 * 60); // 10 minutes

        // Post-workout checklist
        document.querySelectorAll('#post-workout .checklist-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleChecklistChange('postWorkout', e.target.id, e.target.checked);
            });
        });
    }

    canAccessPhase(phase) {
        // Allow access to phases based on completion
        const phases = ['pre-workout', 'warm-up', 'main-workout', 'post-workout'];
        const targetIndex = phases.indexOf(phase);
        const currentIndex = phases.indexOf(this.currentPhase);
        
        // Can always go to current or previous phases
        if (targetIndex <= currentIndex) return true;
        
        // Can only go to next phase if current requirements are met
        if (phase === 'warm-up') {
            return Object.values(this.state.preWorkoutChecklist).filter(Boolean).length >= 6;
        }
        if (phase === 'main-workout') {
            const warmupCardio = document.getElementById('cardio-done')?.checked || false;
            const warmupExercisesCompleted = Object.values(this.state.warmupExercises).filter(Boolean).length;
            return warmupCardio && warmupExercisesCompleted >= 3;
        }
        if (phase === 'post-workout') {
            const completedSets = Object.values(this.state.mainWorkoutSets).filter(Boolean).length;
            return completedSets >= 17; // Total sets needed
        }
        
        return false;
    }

    setupTimer(timerId, initialSeconds) {
        const timerDisplay = document.getElementById(`${timerId}-timer`);
        const startBtn = document.getElementById(`start-${timerId}`);
        const pauseBtn = document.getElementById(`pause-${timerId}`);
        const resetBtn = document.getElementById(`reset-${timerId}`);

        if (!timerDisplay) {
            console.warn(`Timer display not found for ${timerId}`);
            return;
        }

        this.timers[timerId] = {
            seconds: initialSeconds,
            initialSeconds: initialSeconds,
            isRunning: false,
            intervalId: null
        };

        this.updateTimerDisplay(timerId);

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startTimer(timerId));
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => this.pauseTimer(timerId));
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetTimer(timerId));
        }
    }

    setupRestTimer(exerciseNumber) {
        const timerId = `rest-timer-${exerciseNumber}`;
        const timerDisplay = document.getElementById(timerId);
        const startBtn = document.getElementById(`start-rest-${exerciseNumber}`);

        if (!timerDisplay || !startBtn) {
            console.warn(`Rest timer setup failed for exercise ${exerciseNumber}`);
            return;
        }

        this.timers[timerId] = {
            seconds: 90, // 1.5 minutes
            initialSeconds: 90,
            isRunning: false,
            intervalId: null
        };

        this.updateTimerDisplay(timerId);

        startBtn.addEventListener('click', () => {
            this.startTimer(timerId);
            startBtn.textContent = 'Running...';
            startBtn.disabled = true;
        });
    }

    setupStretchingTimers() {
        const stretchTimers = [
            { id: 'stretch-timer-1', seconds: 30, btnId: 'start-stretch-1' },
            { id: 'stretch-timer-2', seconds: 30, btnId: 'start-stretch-2' },
            { id: 'stretch-timer-3', seconds: 30, btnId: 'start-stretch-3' },
            { id: 'stretch-timer-4', seconds: 45, btnId: 'start-stretch-4' },
            { id: 'stretch-timer-5', seconds: 30, btnId: 'start-stretch-5' }
        ];

        stretchTimers.forEach(stretch => {
            const timerDisplay = document.getElementById(stretch.id);
            const startBtn = document.getElementById(stretch.btnId);

            if (!timerDisplay || !startBtn) {
                console.warn(`Timer setup failed for ${stretch.id}`);
                return;
            }

            this.timers[stretch.id] = {
                seconds: stretch.seconds,
                initialSeconds: stretch.seconds,
                isRunning: false,
                intervalId: null
            };

            this.updateTimerDisplay(stretch.id);

            startBtn.addEventListener('click', () => {
                this.startTimer(stretch.id);
                startBtn.textContent = 'Running...';
                startBtn.disabled = true;
            });
        });
    }

    startTimer(timerId) {
        const timer = this.timers[timerId];
        if (!timer || timer.isRunning) return;

        timer.isRunning = true;
        const timerElement = document.querySelector(`[id$="${timerId}"]`)?.closest('.timer-container') || 
                           document.querySelector(`[id$="${timerId}"]`)?.closest('.rest-timer') ||
                           document.querySelector(`[id$="${timerId}"]`)?.closest('.stretch-timer');
        
        if (timerElement) {
            timerElement.classList.add('timer-running');
        }

        timer.intervalId = setInterval(() => {
            timer.seconds--;
            this.updateTimerDisplay(timerId);

            if (timer.seconds <= 0) {
                this.completeTimer(timerId);
            }
        }, 1000);
    }

    pauseTimer(timerId) {
        const timer = this.timers[timerId];
        if (!timer) return;

        timer.isRunning = false;
        clearInterval(timer.intervalId);
        
        const timerElement = document.querySelector(`[id$="${timerId}"]`)?.closest('.timer-container');
        if (timerElement) {
            timerElement.classList.remove('timer-running');
            timerElement.classList.add('timer-paused');
        }
    }

    resetTimer(timerId) {
        const timer = this.timers[timerId];
        if (!timer) return;

        this.pauseTimer(timerId);
        timer.seconds = timer.initialSeconds;
        this.updateTimerDisplay(timerId);
        
        const timerElement = document.querySelector(`[id$="${timerId}"]`)?.closest('.timer-container');
        if (timerElement) {
            timerElement.classList.remove('timer-running', 'timer-paused', 'timer-finished');
        }
    }

    completeTimer(timerId) {
        const timer = this.timers[timerId];
        if (!timer) return;

        timer.isRunning = false;
        clearInterval(timer.intervalId);
        
        const timerElement = document.querySelector(`[id$="${timerId}"]`)?.closest('.timer-container') || 
                           document.querySelector(`[id$="${timerId}"]`)?.closest('.rest-timer') ||
                           document.querySelector(`[id$="${timerId}"]`)?.closest('.stretch-timer');
        
        if (timerElement) {
            timerElement.classList.remove('timer-running');
            timerElement.classList.add('timer-finished');
        }

        // Show completion notification
        this.showNotification('⏰ Timer Complete!');

        // Auto-check exercise if it's a stretch timer
        if (timerId.includes('stretch-timer')) {
            const exerciseId = `stretch-${timerId.split('-')[2]}`;
            const checkbox = document.getElementById(exerciseId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                this.handleStretchingChange(exerciseId, true);
            }
        }

        // Reset rest timer button text
        if (timerId.includes('rest-timer')) {
            const exerciseNum = timerId.split('-')[2];
            const startBtn = document.getElementById(`start-rest-${exerciseNum}`);
            if (startBtn) {
                startBtn.textContent = 'Start Rest Timer';
                startBtn.disabled = false;
            }
        }

        // Reset stretch timer button text
        if (timerId.includes('stretch-timer')) {
            const stretchNum = timerId.split('-')[2];
            const startBtn = document.getElementById(`start-stretch-${stretchNum}`);
            if (startBtn) {
                startBtn.textContent = 'Complete!';
                startBtn.disabled = true;
                startBtn.style.background = 'var(--color-success)';
            }
        }
    }

    updateTimerDisplay(timerId) {
        const timer = this.timers[timerId];
        let timerDisplay = document.getElementById(timerId);
        
        // Handle different timer ID formats
        if (!timerDisplay) {
            timerDisplay = document.getElementById(`${timerId}-timer`);
        }
        
        if (!timer || !timerDisplay) return;

        const minutes = Math.floor(timer.seconds / 60);
        const seconds = timer.seconds % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    handleChecklistChange(type, itemId, checked) {
        this.state[`${type}Checklist`][itemId] = checked;
        this.saveProgress();
        this.updatePhaseButtons();
        
        if (checked) {
            this.showNotification('✅ Item completed!');
        }
    }

    handleWarmupExerciseChange(exerciseId, checked) {
        this.state.warmupExercises[exerciseId] = checked;
        this.saveProgress();
        this.updatePhaseButtons();
        
        if (checked) {
            this.showNotification('🔥 Exercise completed!');
        }
    }

    handleSetCompletion(setId, checked) {
        this.state.mainWorkoutSets[setId] = checked;
        this.saveProgress();
        
        if (checked) {
            this.showNotification('💪 Set completed!');
            
            // Show rest timer for this exercise
            const exerciseMatch = setId.match(/ex(\d+)-set\d+/);
            if (exerciseMatch) {
                const exerciseNum = exerciseMatch[1];
                const restTimer = document.querySelector(`#rest-timer-${exerciseNum}`)?.closest('.rest-timer');
                if (restTimer) {
                    restTimer.classList.remove('hidden');
                }
            }
        }
        
        this.updatePhaseButtons();
        this.checkExerciseCompletion();
    }

    handleStretchingChange(exerciseId, checked) {
        this.state.stretchingExercises[exerciseId] = checked;
        this.saveProgress();
        this.updatePhaseButtons();
        
        if (checked) {
            this.showNotification('🧘 Stretch completed!');
        }
    }

    checkExerciseCompletion() {
        // Check if all sets for each exercise are completed and mark exercise card
        for (let i = 1; i <= 6; i++) {
            let allSetsCompleted = true;
            const setsForExercise = i === 6 ? 2 : 3; // Push-ups only has 2 sets
            
            for (let j = 1; j <= setsForExercise; j++) {
                const setId = `ex${i}-set${j}`;
                if (!this.state.mainWorkoutSets[setId]) {
                    allSetsCompleted = false;
                    break;
                }
            }
            
            const exerciseCard = document.getElementById(`exercise-${i}`);
            if (exerciseCard) {
                if (allSetsCompleted) {
                    exerciseCard.classList.add('completed');
                } else {
                    exerciseCard.classList.remove('completed');
                }
            }
        }
    }

    updatePhaseButtons() {
        // Pre-workout phase
        const preWorkoutCompleted = Object.values(this.state.preWorkoutChecklist).filter(Boolean).length;
        const startWarmupBtn = document.getElementById('start-warmup');
        
        if (startWarmupBtn) {
            startWarmupBtn.disabled = preWorkoutCompleted < 6;
            if (preWorkoutCompleted >= 6) {
                startWarmupBtn.textContent = '🔥 Start Warm-up Phase';
            }
        }

        // Warm-up phase
        const warmupCardio = document.getElementById('cardio-done')?.checked || false;
        const warmupExercisesCompleted = Object.values(this.state.warmupExercises).filter(Boolean).length;
        const startMainBtn = document.getElementById('start-main');
        
        if (startMainBtn) {
            startMainBtn.disabled = !warmupCardio || warmupExercisesCompleted < 3;
            if (!startMainBtn.disabled) {
                startMainBtn.textContent = '💪 Start Main Workout';
            }
        }

        // Main workout phase
        const totalSets = 17; // 3+3+3+3+3+2 sets total
        const completedSets = Object.values(this.state.mainWorkoutSets).filter(Boolean).length;
        const startStretchingBtn = document.getElementById('start-stretching');
        
        if (startStretchingBtn) {
            startStretchingBtn.disabled = completedSets < totalSets;
            if (!startStretchingBtn.disabled) {
                startStretchingBtn.textContent = '🧘 Start Stretching';
            }
        }

        // Post-workout phase
        const stretchingCompleted = Object.values(this.state.stretchingExercises).filter(Boolean).length;
        const cooldownCompleted = document.getElementById('cooldown-done')?.checked || false;
        const postWorkoutCompleted = Object.values(this.state.postWorkoutChecklist).filter(Boolean).length;
        const completeWorkoutBtn = document.getElementById('complete-workout');
        
        if (completeWorkoutBtn) {
            completeWorkoutBtn.disabled = stretchingCompleted < 5 || !cooldownCompleted || postWorkoutCompleted < 6;
            if (!completeWorkoutBtn.disabled) {
                completeWorkoutBtn.textContent = '🎉 Complete Workout!';
            }
        }
    }

    goToPhase(phaseName) {
        console.log(`Switching to phase: ${phaseName}`);
        
        // Hide current phase
        document.querySelectorAll('.phase').forEach(phase => {
            phase.classList.remove('active');
            phase.classList.add('hidden');
        });

        // Show new phase
        const newPhase = document.getElementById(phaseName);
        if (newPhase) {
            newPhase.classList.remove('hidden');
            newPhase.classList.add('active');
            console.log(`Phase ${phaseName} is now visible`);
        } else {
            console.error(`Phase ${phaseName} not found`);
            return;
        }

        // Update progress bar
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active');
        });

        if (phaseName !== 'completion') {
            const activeStep = document.querySelector(`[data-phase="${phaseName}"]`);
            if (activeStep) {
                activeStep.classList.add('active');
            }
        }

        // Mark previous phases as completed
        const phases = ['pre-workout', 'warm-up', 'main-workout', 'post-workout'];
        const currentIndex = phases.indexOf(phaseName);
        
        for (let i = 0; i < currentIndex; i++) {
            const step = document.querySelector(`[data-phase="${phases[i]}"]`);
            if (step) {
                step.classList.add('completed');
                step.classList.remove('active');
            }
        }

        this.currentPhase = phaseName;
        this.saveProgress();
        
        // Scroll to top when changing phases
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Show phase-specific notifications
        const phaseMessages = {
            'warm-up': '🔥 Time to warm up! Start with 5 minutes of light cardio.',
            'main-workout': '💪 Main workout time! Focus on form over weight.',
            'post-workout': '🧘 Great work! Time to cool down and stretch.',
            'completion': '🎉 Congratulations! You completed your workout!'
        };

        if (phaseMessages[phaseName]) {
            setTimeout(() => this.showNotification(phaseMessages[phaseName]), 500);
        }
    }

    setupConfidencePanel() {
        const toggleBtn = document.getElementById('confidence-toggle');
        const content = document.getElementById('confidence-content');
        const tabs = document.querySelectorAll('.confidence-tab');

        if (toggleBtn && content) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                content.classList.toggle('hidden');
            });

            // Close panel when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.confidence-panel')) {
                    content.classList.add('hidden');
                }
            });
        }

        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // Remove active class from all tabs and content
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.confidence-tab-content').forEach(c => c.classList.add('hidden'));
                
                // Add active class to clicked tab and show content
                tab.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-content`);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                }
            });
        });
    }

    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--color-success);
            color: var(--color-btn-primary-text);
            padding: 12px 16px;
            border-radius: 8px;
            font-weight: 500;
            z-index: 1000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            box-shadow: var(--shadow-lg);
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    saveProgress() {
        const progressData = {
            currentPhase: this.currentPhase,
            state: this.state,
            timestamp: Date.now()
        };
        localStorage.setItem('pushWorkoutProgress', JSON.stringify(progressData));
    }

    loadProgress() {
        const saved = localStorage.getItem('pushWorkoutProgress');
        if (saved) {
            try {
                const progressData = JSON.parse(saved);
                this.currentPhase = progressData.currentPhase || 'pre-workout';
                this.state = { ...this.state, ...progressData.state };
            } catch (e) {
                console.log('Error loading progress:', e);
            }
        }
    }

    restoreWorkoutState() {
        // Restore checkboxes
        Object.entries(this.state.preWorkoutChecklist).forEach(([id, checked]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });
        
        Object.entries(this.state.warmupExercises).forEach(([id, checked]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });
        
        Object.entries(this.state.mainWorkoutSets).forEach(([id, checked]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });
        
        Object.entries(this.state.stretchingExercises).forEach(([id, checked]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });
        
        Object.entries(this.state.postWorkoutChecklist).forEach(([id, checked]) => {
            const checkbox = document.getElementById(id);
            if (checkbox) checkbox.checked = checked;
        });

        // Restore current phase
        if (this.currentPhase !== 'pre-workout') {
            this.goToPhase(this.currentPhase);
        }
    }

    clearProgress() {
        localStorage.removeItem('pushWorkoutProgress');
    }

    restartWorkout() {
        // Clear saved progress
        this.clearProgress();
        
        // Reset all state
        this.state = {
            preWorkoutChecklist: {},
            warmupExercises: {},
            mainWorkoutSets: {},
            stretchingExercises: {},
            postWorkoutChecklist: {},
            phaseCompletion: {
                'pre-workout': false,
                'warm-up': false,
                'main-workout': false,
                'post-workout': false
            }
        };

        // Reset all checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Reset all timers
        Object.keys(this.timers).forEach(timerId => {
            this.resetTimer(timerId);
        });

        // Reset timer button states
        document.querySelectorAll('[id^="start-rest-"]').forEach(btn => {
            btn.textContent = 'Start Rest Timer';
            btn.disabled = false;
        });

        document.querySelectorAll('[id^="start-stretch-"]').forEach(btn => {
            btn.textContent = btn.id.includes('1') ? 'Start 30s' : 
                           btn.id.includes('2') ? 'Start 30s Each' :
                           btn.id.includes('3') ? 'Start 30s Each' :
                           btn.id.includes('4') ? 'Start 45s' : 'Start 30s';
            btn.disabled = false;
            btn.style.background = '';
        });

        // Hide rest timers
        document.querySelectorAll('.rest-timer').forEach(timer => {
            timer.classList.add('hidden');
        });

        // Remove exercise completion classes
        document.querySelectorAll('.exercise-card.completed').forEach(card => {
            card.classList.remove('completed');
        });

        // Reset timer container classes
        document.querySelectorAll('.timer-container, .rest-timer, .stretch-timer').forEach(container => {
            container.classList.remove('timer-running', 'timer-paused', 'timer-finished');
        });

        // Go back to first phase
        this.goToPhase('pre-workout');
        
        this.showNotification('🔄 Workout reset! Ready for another session?');
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing workout app...');
    new WorkoutApp();
});

// Prevent zoom on double tap for better mobile experience
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Add haptic feedback for mobile devices (if supported)
function addHapticFeedback(element) {
    if (element && 'vibrate' in navigator) {
        element.addEventListener('click', () => {
            navigator.vibrate(50); // Short vibration
        });
    }
}

// Add haptic feedback to buttons and checkboxes
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('button, input[type="checkbox"]').forEach(addHapticFeedback);
});