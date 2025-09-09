// Legs Day Workout App JavaScript - Security & Performance Fixed
class WorkoutApp {
    // Constants
    static PHASES = ['pre-workout', 'warm-up', 'main-workout', 'post-workout'];
    static REQUIREMENTS = {
        PRE_WORKOUT_ITEMS: 6,
        WARMUP_EXERCISES: 3,
        TOTAL_SETS: 17,
        STRETCHING_EXERCISES: 5,
        POST_WORKOUT_ITEMS: 6,
        TOTAL_EXERCISES: 6
    };
    
    constructor() {
        this.auth = new AuthManager();
        this.auth.enableGuestMode(); // Enable guest mode for demo
        
        if (!this.auth.canAccessWorkout()) {
            this.showNotification('⚠️ Access denied. Please log in.');
            return;
        }
        
        this.currentPhase = 'pre-workout';
        this.timers = new Map();
        this.cachedElements = new Map();
        this.audioContext = null;
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
        
        this.init();
        this.loadProgress();
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.updatePhaseButtons();
        this.setupConfidencePanel();
    }
    
    cacheElements() {
        // Cache frequently used elements
        const elements = {
            phases: document.querySelectorAll('.phase'),
            progressSteps: document.querySelectorAll('.progress-step'),
            confidenceContent: document.querySelectorAll('.confidence-tab-content'),
            startWarmup: document.getElementById('start-warmup'),
            startMain: document.getElementById('start-main'),
            startStretching: document.getElementById('start-stretching'),
            completeWorkout: document.getElementById('complete-workout')
        };
        
        Object.entries(elements).forEach(([key, element]) => {
            this.cachedElements.set(key, element);
        });
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
        this.goToPhase('warm-up');
            });
        }

        const startMainBtn = document.getElementById('start-main');
        if (startMainBtn) {
            startMainBtn.addEventListener('click', (e) => {
                e.preventDefault();
        this.goToPhase('main-workout');
            });
        }

        const startStretchingBtn = document.getElementById('start-stretching');
        if (startStretchingBtn) {
            startStretchingBtn.addEventListener('click', (e) => {
                e.preventDefault();
        this.goToPhase('post-workout');
            });
        }

        const completeWorkoutBtn = document.getElementById('complete-workout');
        if (completeWorkoutBtn) {
            completeWorkoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
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

        // Warm-up timers - Fixed timer setup
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

        // Setup stretch timers
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
        const targetIndex = WorkoutApp.PHASES.indexOf(phase);
        const currentIndex = WorkoutApp.PHASES.indexOf(this.currentPhase);
        
        if (targetIndex <= currentIndex) return true;
        
        const { PRE_WORKOUT_ITEMS, WARMUP_EXERCISES, TOTAL_SETS } = WorkoutApp.REQUIREMENTS;
        
        if (phase === 'warm-up') {
            return this.countCompleted(this.state.preWorkoutChecklist) >= PRE_WORKOUT_ITEMS;
        }
        if (phase === 'main-workout') {
            return this.countCompleted(this.state.warmupExercises) >= WARMUP_EXERCISES;
        }
        if (phase === 'post-workout') {
            return this.countCompleted(this.state.mainWorkoutSets) >= TOTAL_SETS;
        }
        
        return false;
    }
    
    countCompleted(obj) {
        return Object.values(obj).reduce((count, value) => count + (value ? 1 : 0), 0);
    }

    setupTimer(timerId, initialSeconds) {
        const timerDisplay = document.getElementById(`${timerId}-timer`);
        const startBtn = document.getElementById(`start-${timerId}`);
        const pauseBtn = document.getElementById(`pause-${timerId}`);
        const resetBtn = document.getElementById(`reset-${timerId}`);

        if (!timerDisplay) return;

        // Clean up existing timer if it exists
        if (this.timers.has(timerId)) {
            this.cleanupTimer(timerId);
        }

        this.timers.set(timerId, {
            seconds: initialSeconds,
            initialSeconds: initialSeconds,
            isRunning: false,
            intervalId: null,
            display: timerDisplay,
            startBtn,
            pauseBtn,
            resetBtn
        });

        this.updateTimerDisplay(timerId);

        if (startBtn) {
            const startHandler = () => {
                const timer = this.timers.get(timerId);
                if (timer.isRunning) {
                    this.pauseTimer(timerId);
                    startBtn.textContent = 'Start';
                } else {
                    this.startTimer(timerId);
                    startBtn.textContent = 'Pause';
                }
            };
            startBtn.removeEventListener('click', startHandler);
            startBtn.addEventListener('click', startHandler);
        }

        if (pauseBtn) {
            const pauseHandler = () => {
                this.pauseTimer(timerId);
                if (startBtn) startBtn.textContent = 'Start';
            };
            pauseBtn.removeEventListener('click', pauseHandler);
            pauseBtn.addEventListener('click', pauseHandler);
        }

        if (resetBtn) {
            const resetHandler = () => {
                this.resetTimer(timerId);
                if (startBtn) startBtn.textContent = 'Start';
            };
            resetBtn.removeEventListener('click', resetHandler);
            resetBtn.addEventListener('click', resetHandler);
        }
    }
    
    cleanupTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (timer?.intervalId) {
            clearInterval(timer.intervalId);
        }
    }

    setupRestTimer(exerciseNumber) {
        const timerId = `rest-${exerciseNumber}`;
        const timerDisplay = document.getElementById(`rest-timer-${exerciseNumber}`);
        const startBtn = document.getElementById(`start-rest-${exerciseNumber}`);

        if (!timerDisplay || !startBtn) return;

        if (this.timers.has(timerId)) {
            this.cleanupTimer(timerId);
        }

        this.timers.set(timerId, {
            seconds: 90,
            initialSeconds: 90,
            isRunning: false,
            intervalId: null,
            display: timerDisplay,
            startBtn
        });

        this.updateTimerDisplay(timerId);

        const clickHandler = () => {
            this.startTimer(timerId);
            startBtn.textContent = 'Running...';
            startBtn.disabled = true;
        };
        
        startBtn.removeEventListener('click', clickHandler);
        startBtn.addEventListener('click', clickHandler);
    }

    setupStretchingTimers() {
        const stretchTimers = [
            { id: 'stretch-timer-1', seconds: 30, btnId: 'start-stretch-1' },
            { id: 'stretch-timer-2', seconds: 30, btnId: 'start-stretch-2' },
            { id: 'stretch-timer-3', seconds: 30, btnId: 'start-stretch-3' },
            { id: 'stretch-timer-4', seconds: 30, btnId: 'start-stretch-4' },
            { id: 'stretch-timer-5', seconds: 45, btnId: 'start-stretch-5' }
        ];

        stretchTimers.forEach(stretch => {
            const timerDisplay = document.getElementById(stretch.id);
            const startBtn = document.getElementById(stretch.btnId);

            if (!timerDisplay || !startBtn) {
                console.log(`Stretch timer setup failed for ${stretch.id}`);
                return;
            }

            this.timers.set(stretch.id, {
                seconds: stretch.seconds,
                initialSeconds: stretch.seconds,
                isRunning: false,
                intervalId: null,
                display: timerDisplay,
                startBtn
            });

            this.updateTimerDisplay(stretch.id);

            startBtn.addEventListener('click', () => {
                const timer = this.timers.get(stretch.id);
                if (timer.isRunning) {
                    this.pauseTimer(stretch.id);
                    startBtn.textContent = startBtn.textContent.replace('Running...', 'Start');
                } else {
                    this.startTimer(stretch.id);
                    startBtn.textContent = 'Running...';
                }
            });
        });
    }

    startTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer || timer.isRunning) return;

        timer.isRunning = true;
        
        const timerElement = timer.display?.closest('.timer-container') || 
                           timer.display?.closest('.rest-timer') ||
                           timer.display?.closest('.stretch-timer');
        
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
        const timer = this.timers.get(timerId);
        if (!timer) return;

        timer.isRunning = false;
        clearInterval(timer.intervalId);
        
        const timerElement = timer.display?.closest('.timer-container');
        if (timerElement) {
            timerElement.classList.remove('timer-running');
            timerElement.classList.add('timer-paused');
        }
    }

    resetTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer) return;

        this.pauseTimer(timerId);
        timer.seconds = timer.initialSeconds;
        this.updateTimerDisplay(timerId);
        
        const timerElement = timer.display?.closest('.timer-container');
        if (timerElement) {
            timerElement.classList.remove('timer-running', 'timer-paused', 'timer-finished');
        }
    }

    completeTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer) return;

        timer.isRunning = false;
        clearInterval(timer.intervalId);
        
        const timerElement = timer.display?.closest('.timer-container') ||
                           timer.display?.closest('.rest-timer') ||
                           timer.display?.closest('.stretch-timer');
        
        if (timerElement) {
            timerElement.classList.remove('timer-running');
            timerElement.classList.add('timer-finished');
        }

        this.showNotification('⏰ Timer Complete!');
        this.playTimerSound();

        // Handle different timer types
        if (timerId === 'cardio') {
            const startBtn = document.getElementById('start-cardio');
            if (startBtn) startBtn.textContent = 'Complete!';
        }
        
        if (timerId === 'cooldown') {
            const checkbox = document.getElementById('cooldown-done');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                this.handleStretchingChange('cooldown-done', true);
            }
            const startBtn = document.getElementById('start-cooldown');
            if (startBtn) startBtn.textContent = 'Complete!';
        }

        // Auto-check exercise if it's a stretch timer
        if (timerId.includes('stretch-timer')) {
            const exerciseId = `stretch-${timerId.split('-')[2]}`;
            const checkbox = document.getElementById(exerciseId);
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                this.handleStretchingChange(exerciseId, true);
            }
            const stretchNum = timerId.split('-')[2];
            const startBtn = document.getElementById(`start-stretch-${stretchNum}`);
            if (startBtn) {
                startBtn.textContent = 'Complete!';
                startBtn.disabled = true;
                startBtn.style.background = '#28a745';
                startBtn.style.color = 'white';
            }
        }

        // Reset rest timer button text
        if (timerId.includes('rest-')) {
            const exerciseNum = timerId.split('-')[1];
            const startBtn = document.getElementById(`start-rest-${exerciseNum}`);
            if (startBtn) {
                startBtn.textContent = 'Rest Complete!';
                startBtn.disabled = true;
                startBtn.style.background = '#28a745';
                startBtn.style.color = 'white';
                setTimeout(() => {
                    startBtn.textContent = 'Start Rest Timer';
                    startBtn.disabled = false;
                    startBtn.style.background = '';
                    startBtn.style.color = '';
                }, 3000);
            }
        }
        
        this.saveProgress();
    }

    updateTimerDisplay(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer?.display) return;

        const minutes = Math.floor(timer.seconds / 60);
        const seconds = timer.seconds % 60;
        timer.display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    handleChecklistChange(type, itemId, checked) {
        const sanitizedType = this.sanitizeInput(type);
        const sanitizedItemId = this.sanitizeInput(itemId);
        
        this.updateState(`${sanitizedType}Checklist`, sanitizedItemId, checked);
        this.updatePhaseButtons();
        this.saveProgress();
        
        if (checked) {
            this.showNotification('✅ Item completed!');
        }
    }
    
    updateState(stateKey, itemId, value) {
        if (this.state[stateKey]) {
            this.state[stateKey][itemId] = value;
        }
    }
    
    sanitizeInput(input) {
        return String(input).replace(/[<>"'&]/g, '');
    }

    handleWarmupExerciseChange(exerciseId, checked) {
        this.state.warmupExercises[exerciseId] = checked;
        this.updatePhaseButtons();
        this.saveProgress();
        
        if (checked) {
            this.showNotification('🔥 Exercise completed!');
        }
    }

    handleSetCompletion(setId, checked) {
        this.state.mainWorkoutSets[setId] = checked;
        
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
        this.saveProgress();
    }

    handleStretchingChange(exerciseId, checked) {
        this.state.stretchingExercises[exerciseId] = checked;
        this.updatePhaseButtons();
        this.saveProgress();
        
        if (checked) {
            this.showNotification('🧘 Stretch completed!');
        }
    }

    checkExerciseCompletion() {
        for (let i = 1; i <= WorkoutApp.REQUIREMENTS.TOTAL_EXERCISES; i++) {
            const setsForExercise = i === 6 ? 2 : 3;
            let allSetsCompleted = true;
            
            for (let j = 1; j <= setsForExercise; j++) {
                const setId = `ex${i}-set${j}`;
                if (!this.state.mainWorkoutSets[setId]) {
                    allSetsCompleted = false;
                    break;
                }
            }
            
            const exerciseCard = document.getElementById(`exercise-${i}`);
            if (exerciseCard) {
                exerciseCard.classList.toggle('completed', allSetsCompleted);
            }
        }
    }

    updatePhaseButtons() {
        const { PRE_WORKOUT_ITEMS, WARMUP_EXERCISES, TOTAL_SETS, STRETCHING_EXERCISES, POST_WORKOUT_ITEMS } = WorkoutApp.REQUIREMENTS;
        
        const preWorkoutCompleted = this.countCompleted(this.state.preWorkoutChecklist);
        const startWarmupBtn = this.cachedElements.get('startWarmup');
        
        if (startWarmupBtn) {
            startWarmupBtn.disabled = preWorkoutCompleted < PRE_WORKOUT_ITEMS;
            if (preWorkoutCompleted >= PRE_WORKOUT_ITEMS) {
                startWarmupBtn.textContent = '🔥 Start Warm-up Phase';
            }
        }

        const warmupExercisesCompleted = this.countCompleted(this.state.warmupExercises);
        const startMainBtn = this.cachedElements.get('startMain');
        
        if (startMainBtn) {
            startMainBtn.disabled = warmupExercisesCompleted < WARMUP_EXERCISES;
            if (!startMainBtn.disabled) {
                startMainBtn.textContent = '💪 Start Main Workout';
            }
        }

        const completedSets = this.countCompleted(this.state.mainWorkoutSets);
        const startStretchingBtn = this.cachedElements.get('startStretching');
        
        if (startStretchingBtn) {
            startStretchingBtn.disabled = completedSets < TOTAL_SETS;
            if (!startStretchingBtn.disabled) {
                startStretchingBtn.textContent = '🧘 Start Stretching';
            }
        }

        const stretchingCompleted = this.countCompleted(this.state.stretchingExercises);
        const cooldownCompleted = document.getElementById('cooldown-done')?.checked || false;
        const postWorkoutCompleted = this.countCompleted(this.state.postWorkoutChecklist);
        const completeWorkoutBtn = this.cachedElements.get('completeWorkout');
        
        if (completeWorkoutBtn) {
            completeWorkoutBtn.disabled = stretchingCompleted < STRETCHING_EXERCISES || !cooldownCompleted || postWorkoutCompleted < POST_WORKOUT_ITEMS;
            if (!completeWorkoutBtn.disabled) {
                completeWorkoutBtn.textContent = '🎉 Complete Workout!';
            }
        }
    }

    goToPhase(phaseName) {
        const sanitizedPhaseName = this.sanitizeInput(phaseName);
        
        // Hide current phase
        this.cachedElements.get('phases')?.forEach(phase => {
            phase.classList.remove('active');
            phase.classList.add('hidden');
        });

        // Show new phase
        const newPhase = document.getElementById(sanitizedPhaseName);
        if (newPhase) {
            newPhase.classList.remove('hidden');
            newPhase.classList.add('active');
        } else {
            return;
        }

        // Update progress bar
        this.cachedElements.get('progressSteps')?.forEach(step => {
            step.classList.remove('active');
        });

        if (sanitizedPhaseName !== 'completion') {
            const activeStep = document.querySelector(`[data-phase="${sanitizedPhaseName}"]`);
            if (activeStep) {
                activeStep.classList.add('active');
            }
        }

        // Mark previous phases as completed
        const currentIndex = WorkoutApp.PHASES.indexOf(sanitizedPhaseName);
        
        for (let i = 0; i < currentIndex; i++) {
            const step = document.querySelector(`[data-phase="${WorkoutApp.PHASES[i]}"]`);
            if (step) {
                step.classList.add('completed');
                step.classList.remove('active');
            }
        }

        this.currentPhase = sanitizedPhaseName;
        this.saveProgress();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });

        const phaseMessages = {
            'warm-up': '🔥 Time to warm up! Start with 5 minutes of light cardio.',
            'main-workout': '💪 Legs day time! Focus on form over weight.',
            'post-workout': '🧘 Great work! Time to cool down and stretch those legs.',
            'completion': '🎉 Congratulations! You completed your legs workout!'
        };

        if (phaseMessages[sanitizedPhaseName]) {
            setTimeout(() => this.showNotification(phaseMessages[sanitizedPhaseName]), 500);
        }

        // Clear progress when workout is completed
        if (sanitizedPhaseName === 'completion') {
            this.clearProgress();
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
                const targetTab = this.sanitizeInput(tab.getAttribute('data-tab'));
                
                // Remove active class from all tabs and content
                tabs.forEach(t => t.classList.remove('active'));
                this.cachedElements.get('confidenceContent')?.forEach(c => c.classList.add('hidden'));
                
                // Add active class to clicked tab and show content
                tab.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-content`);
                if (targetContent) {
                    targetContent.classList.remove('hidden');
                }
            });
        });
    }

    playTimerSound() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);
        } catch (error) {
            // Audio not supported
        }
    }

    showNotification(message) {
        const sanitizedMessage = this.sanitizeInput(message);
        const notification = document.createElement('div');
        notification.className = 'notification-popup';
        notification.textContent = sanitizedMessage;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    restartWorkout() {
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
        this.timers.forEach((timer, timerId) => {
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
                           btn.id.includes('4') ? 'Start 30s Each' : 'Start 45s Each';
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

        // Clear saved progress
        this.clearProgress();

        // Go back to first phase
        this.goToPhase('pre-workout');
        
        this.showNotification('🔄 Workout reset! Ready for another legs session?');
    }

    // Progress persistence methods
    saveProgress() {
        const progress = {
            currentPhase: this.currentPhase,
            state: this.state,
            checkboxStates: {},
            timerStates: {}
        };

        // Save checkbox states
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            progress.checkboxStates[checkbox.id] = checkbox.checked;
        });

        // Save timer states
        this.timers.forEach((timer, timerId) => {
            progress.timerStates[timerId] = {
                seconds: timer.seconds,
                isRunning: timer.isRunning
            };
        });

        localStorage.setItem('legsWorkoutProgress', JSON.stringify(progress));
    }

    loadProgress() {
        const saved = localStorage.getItem('legsWorkoutProgress');
        if (!saved) return;

        try {
            const progress = JSON.parse(saved);
            this.restoreWorkoutState(progress);
        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    restoreWorkoutState(progress) {
        // Restore state
        if (progress.state) {
            this.state = progress.state;
        }

        // Wait for DOM to be ready
        setTimeout(() => {
            // Restore checkbox states
            if (progress.checkboxStates) {
                Object.entries(progress.checkboxStates).forEach(([id, checked]) => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = checked;
                        if (checked) {
                            const item = checkbox.closest('.checklist-item, .exercise-item, .set-row');
                            if (item) item.classList.add('completed');
                        }
                    }
                });
            }

            // Restore timer states
            if (progress.timerStates) {
                Object.entries(progress.timerStates).forEach(([timerId, timerState]) => {
                    const timer = this.timers.get(timerId);
                    if (timer) {
                        timer.seconds = timerState.seconds;
                        this.updateTimerDisplay(timerId);
                    }
                });
            }

            // Update UI
            this.updatePhaseButtons();
            this.checkExerciseCompletion();

            // Restore phase
            if (progress.currentPhase && progress.currentPhase !== 'pre-workout') {
                this.goToPhase(progress.currentPhase);
            }
        }, 100);
    }

    clearProgress() {
        localStorage.removeItem('legsWorkoutProgress');
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WorkoutApp();
    
    // Add haptic feedback for mobile devices (if supported)
    if ('vibrate' in navigator) {
        document.addEventListener('click', (event) => {
            if (event.target.matches('button, input[type="checkbox"]')) {
                navigator.vibrate(50);
            }
        });
    }
});

// Prevent zoom on double tap for better mobile experience
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);