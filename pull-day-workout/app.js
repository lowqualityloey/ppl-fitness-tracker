// Pull Day Workout App - JavaScript (Fixed Navigation)
class PullDayWorkoutApp {
  constructor() {
    this.currentPhase = 'welcome'
    this.phases = [
      'welcome',
      'checklist',
      'warm-up',
      'workout',
      'stretching',
      'complete',
    ]
    this.phaseProgress = 0
    this.cachedElements = new Map()
    this.eventListeners = new Map()

    // Workout state
    this.completedSets = 0
    this.totalSets = 17
    this.completedExercises = 0
    this.totalExercises = 6
    this.workoutStartTime = null

    // Timer state
    this.cardioTimer = null
    this.cardioTime = 300 // 5 minutes
    this.cardioTimeLeft = 300
    this.cardioRunning = false

    this.restTimer = null
    this.restTimeLeft = 0
    this.restRunning = false

    this.stretchTimer = null
    this.stretchTimeLeft = 0
    this.stretchRunning = false
    this.currentStretchIndex = 0

    this.cooldownTimer = null
    this.cooldownTime = 600 // 10 minutes
    this.cooldownTimeLeft = 600
    this.cooldownRunning = false

    // Pull Day exercises data
    this.exercises = [
      {
        id: 1,
        name: 'Lat Pulldown',
        sets: 3,
        reps: '8-10',
        restTime: 90,
        equipment: 'Cable Machine with Lat Bar',
        location: 'Cable machine area',
        startingWeight: '30-40% body weight (20-25kg)',
        muscles: 'Lats, Rhomboids, Biceps',
        formTips:
          'Pull bar to upper chest, squeeze shoulder blades together, lean back slightly',
        confidenceTips:
          'Perfect substitute for pull-ups - everyone uses this machine, great for beginners',
        alternatives: [
          'Pull-ups (if you can do them)',
          'Assisted Pull-up Machine',
          'Resistance Band Pulldowns',
        ],
        beginnerNotes:
          'Start light, focus on pulling with your back muscles, not just arms',
        videoUrl: 'https://www.youtube.com/embed/bNmvKpJSWKM',
      },
      {
        id: 2,
        name: 'Seated Cable Row',
        sets: 3,
        reps: '8-10',
        restTime: 90,
        equipment: 'Cable Machine with Handle',
        location: 'Cable machine area',
        startingWeight: 'Light resistance (15-20kg)',
        muscles: 'Lats, Rhomboids, Middle Traps',
        formTips:
          'Sit tall, pull handle to lower ribcage, squeeze shoulder blades',
        confidenceTips:
          'Great for learning rowing movement - machine guides the motion perfectly',
        alternatives: [
          'Bent-over Barbell Row',
          'T-Bar Row',
          'Resistance Band Rows',
        ],
        beginnerNotes: 'Keep torso upright, pull to your stomach area',
        videoUrl: 'https://www.youtube.com/embed/LyZH4UGdDTc',
      },
      {
        id: 3,
        name: 'Single-Arm Dumbbell Row',
        sets: 3,
        reps: '10-12',
        restTime: 75,
        equipment: 'Dumbbell + Bench',
        location: 'Dumbbell area',
        startingWeight: '5-10kg dumbbell',
        muscles: 'Lats, Rhomboids, Rear Delts',
        formTips:
          'Support with bench, pull dumbbell to hip, keep back straight',
        confidenceTips:
          'Very common exercise - easy to watch others for proper technique',
        alternatives: [
          'Two-arm Dumbbell Row',
          'Chest-supported Row Machine',
          'Landmine Row',
        ],
        beginnerNotes: 'Use bench for support, pull weight to your hip area',
        videoUrl: 'https://www.youtube.com/embed/yHqqGd0tXcw',
      },
      {
        id: 4,
        name: 'Face Pulls',
        sets: 3,
        reps: '12-15',
        restTime: 60,
        equipment: 'Cable Machine with Rope',
        location: 'Cable machine area',
        startingWeight: 'Very light (5-10kg)',
        muscles: 'Rear Delts, Middle Traps',
        formTips:
          'Pull rope to face level, spread handles apart, keep elbows high',
        confidenceTips:
          'Everyone uses light weight for this - great for improving posture',
        alternatives: [
          'Reverse Fly Machine',
          'Band Pull-aparts',
          'Bent-over Reverse Fly',
        ],
        beginnerNotes:
          'Use very light weight, focus on squeezing shoulder blades',
        videoUrl: 'https://www.youtube.com/embed/IeOqdw9WI90',
      },
      {
        id: 5,
        name: 'Bicep Curls',
        sets: 3,
        reps: '10-12',
        restTime: 75,
        equipment: 'Dumbbells',
        location: 'Dumbbell area',
        startingWeight: '3-7kg dumbbells',
        muscles: 'Biceps',
        formTips: 'Keep elbows at sides, curl up smoothly, control the descent',
        confidenceTips:
          'Classic exercise - everyone does bicep curls, very beginner-friendly',
        alternatives: [
          'Barbell Curls',
          'Cable Bicep Curls',
          'Resistance Band Curls',
        ],
        beginnerNotes: "Don't swing the weights, focus on controlled movement",
        videoUrl: 'https://www.youtube.com/embed/MKWBV29S6c0',
      },
      {
        id: 6,
        name: 'Hammer Curls',
        sets: 2,
        reps: '8-12',
        restTime: 60,
        equipment: 'Dumbbells',
        location: 'Dumbbell area',
        startingWeight: '3-7kg dumbbells',
        muscles: 'Biceps, Forearms',
        formTips: 'Neutral grip (thumbs up), controlled movement up and down',
        confidenceTips:
          'Great finishing exercise - targets different part of biceps',
        alternatives: [
          'Cross-body Hammer Curls',
          'Cable Hammer Curls',
          'Neutral Grip Pull-ups',
        ],
        beginnerNotes:
          'Hold dumbbells like hammers, same controlled motion as regular curls',
        videoUrl: 'https://www.youtube.com/embed/_aoad2yuP5w',
      },
    ]

    // Stretching routine
    this.stretches = [
      {
        id: 1,
        name: 'Lat Stretch',
        duration: 30,
        instructions: 'Reach one arm overhead and lean to opposite side',
        tips: 'Feel stretch along side of back and armpit area',
        videoUrl: 'https://www.youtube.com/embed/x97hAScVHHc',
      },
      {
        id: 2,
        name: 'Bicep Wall Stretch',
        duration: 30,
        instructions: 'Place palm on wall behind you, step forward gently',
        tips: "Don't force it - gentle stretch in front of arm",
        videoUrl: 'https://www.youtube.com/embed/j0rdJpN4B8Y',
      },
      {
        id: 3,
        name: 'Upper Trap Stretch',
        duration: 30,
        instructions: 'Tilt head to side, pull gently with opposite hand',
        tips: 'Feel stretch in neck and upper shoulder area',
        videoUrl: 'https://www.youtube.com/embed/dWICLaovAVc',
      },
      {
        id: 4,
        name: "Child's Pose",
        duration: 45,
        instructions: 'Kneel, sit back on heels, reach arms forward',
        tips: 'Relax and breathe deeply, let your back stretch',
        videoUrl: 'https://www.youtube.com/embed/AgwjXQJqfYo',
      },
      {
        id: 5,
        name: 'Cat-Cow Stretch',
        duration: 30,
        instructions: 'On hands and knees, alternate arching and rounding back',
        tips: 'Move slowly, coordinate with breathing',
        videoUrl: 'https://www.youtube.com/embed/LIVJZZyZ2qM',
      },
    ]

    // Initialize immediately if DOM is ready
    this.initializeApp()
    
    // Load saved progress
    this.loadProgress()
  }

  initializeApp() {
    // Use multiple methods to ensure initialization happens
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init())
    } else {
      // DOM is already loaded
      this.init()
    }

    // Also try after a short delay as backup
    setTimeout(() => this.init(), 100)
  }

  init() {
    console.log('Initializing Pull Day Workout App...')

    // Make sure we don't initialize multiple times
    if (this.initialized) {
      console.log('Already initialized, skipping...')
      return
    }

    try {
      this.cacheElements()
      this.setupEventListeners()
      this.updateProgressBar()
      this.renderExerciseCards()
      this.renderStretchList()
      this.setupConfidencePanel()
      this.initialized = true
      console.log('Pull Day Workout App initialized successfully')
    } catch (error) {
      console.error('Error during initialization:', error)
      // Try again after a delay
      setTimeout(() => {
        this.initialized = false
        this.init()
      }, 500)
    }
  }
  
  cacheElements() {
    const elements = {
      exerciseCards: document.getElementById('exercise-cards'),
      stretchList: document.getElementById('stretch-list'),
      mainProgressFill: document.getElementById('main-progress-fill'),
      setsCount: document.getElementById('sets-count'),
      exercisesCount: document.getElementById('exercises-count'),
      finalSets: document.getElementById('final-sets'),
      finalExercises: document.getElementById('final-exercises'),
      finalTime: document.getElementById('final-time')
    }
    
    Object.entries(elements).forEach(([key, element]) => {
      this.cachedElements.set(key, element)
    })
  }

  setupEventListeners() {
    console.log('Setting up event listeners...')

    // Welcome phase - using multiple selectors to ensure we find the button
    const startBtn =
      document.getElementById('start-workout-btn') ||
      document.querySelector('.btn--primary') ||
      document.querySelector('[onclick="startWorkout()"]')

    if (startBtn) {
      console.log('Found start workout button')
      // Remove any existing listeners
      startBtn.removeEventListener('click', this.handleStartWorkout)
      // Add new listener
      this.handleStartWorkout = () => {
        console.log('Start workout button clicked')
        this.startWorkout()
      }
      startBtn.addEventListener('click', this.handleStartWorkout)
    } else {
      console.error('Start workout button not found')
    }

    // Phase navigation
    const phaseIndicators = document.querySelectorAll('.phase-indicator')
    console.log('Found phase indicators:', phaseIndicators.length)
    phaseIndicators.forEach((indicator) => {
      indicator.addEventListener('click', (e) => {
        const phase = e.currentTarget.dataset.phase
        console.log('Phase indicator clicked:', phase)
        if (!e.currentTarget.classList.contains('locked')) {
          this.switchToPhase(phase)
        }
      })
    })

    // Checklist phase
    const checklistCheckboxes = document.querySelectorAll('.checklist-checkbox')
    console.log('Found checklist checkboxes:', checklistCheckboxes.length)
    checklistCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        console.log('Checklist checkbox changed')
        this.checkChecklistProgress()
      })
    })

    const checklistCompleteBtn = document.getElementById(
      'checklist-complete-btn'
    )
    if (checklistCompleteBtn) {
      console.log('Found checklist complete button')
      checklistCompleteBtn.addEventListener('click', (e) => {
        e.preventDefault()
        console.log('Checklist complete button clicked')
        this.completeChecklist()
      })
    } else {
      console.error('Checklist complete button not found')
    }

    // Setup other event listeners
    this.setupWarmUpListeners()
    this.setupWorkoutListeners()
    this.setupStretchingListeners()

    console.log('Event listeners setup complete')
  }

  setupWarmUpListeners() {
    // Warm-up phase
    this.setupCardioTimer()

    const exerciseCheckboxes = document.querySelectorAll('.exercise-checkbox')
    exerciseCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', () => this.checkWarmUpProgress())
    })

    const warmUpCompleteBtn = document.getElementById('warm-up-complete-btn')
    if (warmUpCompleteBtn) {
      warmUpCompleteBtn.addEventListener('click', () => this.completeWarmUp())
    }
  }

  setupWorkoutListeners() {
    // Workout phase
    const workoutCompleteBtn = document.getElementById('workout-complete-btn')
    if (workoutCompleteBtn) {
      workoutCompleteBtn.addEventListener('click', () => this.completeWorkout())
    }

    // Rest timer
    this.setupRestTimer()
  }

  setupStretchingListeners() {
    // Stretching phase
    this.setupCooldownTimer()

    const stretchingCompleteBtn = document.getElementById(
      'stretching-complete-btn'
    )
    if (stretchingCompleteBtn) {
      stretchingCompleteBtn.addEventListener('click', () =>
        this.completeStretching()
      )
    }
  }

  startWorkout() {
    console.log('Starting workout...')
    this.workoutStartTime = Date.now()
    this.unlockPhase('checklist')
    this.switchToPhase('checklist')
    this.showNotification(
      'Welcome to Pull Day! Complete the checklist to begin 💪'
    )
  }

  switchToPhase(phaseName) {
    console.log('Switching to phase:', phaseName, 'from:', this.currentPhase)

    try {
      // Hide all phases
      const allPhases = document.querySelectorAll('.phase')
      console.log('Found phases:', allPhases.length)

      allPhases.forEach((phase) => {
        phase.classList.remove('active')
        phase.style.display = 'none' // Force hide
      })

      // Show target phase
      const targetPhase = document.getElementById(`${phaseName}-phase`)
      console.log('Target phase element:', targetPhase)

      if (targetPhase) {
        targetPhase.classList.add('active')
        targetPhase.style.display = 'block' // Force show
        this.currentPhase = phaseName
        console.log('Successfully switched to phase:', phaseName)

        // Update phase indicators
        document.querySelectorAll('.phase-indicator').forEach((indicator) => {
          indicator.classList.remove('active')
        })

        const activeIndicator = document.querySelector(
          `[data-phase="${phaseName}"]`
        )
        if (activeIndicator) {
          activeIndicator.classList.add('active')
        }

        // Update progress bar
        this.updateProgressBar()

        // Scroll to top
        window.scrollTo(0, 0)
      } else {
        console.error('Target phase not found:', `${phaseName}-phase`)
        // List all available phase elements for debugging
        const availablePhases = document.querySelectorAll('[id$="-phase"]')
        console.log(
          'Available phases:',
          Array.from(availablePhases).map((p) => p.id)
        )
      }
    } catch (error) {
      console.error('Error switching phases:', error)
    }
  }

  unlockPhase(phaseName) {
    console.log('Unlocking phase:', phaseName)
    const indicator = document.querySelector(`[data-phase="${phaseName}"]`)
    if (indicator) {
      indicator.classList.remove('locked')
      indicator.classList.add('unlocked')
      console.log('Phase unlocked:', phaseName)
    } else {
      console.error('Phase indicator not found for:', phaseName)
    }
  }

  updateProgressBar() {
    try {
      const phaseIndex = this.phases.indexOf(this.currentPhase)
      const progress = (phaseIndex / (this.phases.length - 1)) * 100

      const progressFill = this.cachedElements.get('mainProgressFill')
      if (progressFill) {
        progressFill.style.width = `${progress}%`
        console.log('Progress bar updated:', progress + '%')
      }
    } catch (error) {
      console.error('Progress bar update failed:', error)
    }
  }

  // Checklist Phase
  checkChecklistProgress() {
    const checkboxes = document.querySelectorAll('.checklist-checkbox')
    const checkedBoxes = document.querySelectorAll(
      '.checklist-checkbox:checked'
    )
    const completeBtn = document.getElementById('checklist-complete-btn')

    console.log(
      'Checklist progress:',
      checkedBoxes.length,
      '/',
      checkboxes.length
    )

    if (completeBtn) {
      const allChecked = checkedBoxes.length === checkboxes.length
      completeBtn.disabled = !allChecked

      if (allChecked) {
        completeBtn.classList.add('btn--primary')
        completeBtn.classList.remove('btn--outline')
        completeBtn.textContent = 'Complete Checklist & Continue'
        this.showNotification('All items checked! Ready to continue 🎯')
      } else {
        completeBtn.classList.remove('btn--primary')
        completeBtn.classList.add('btn--outline')
      }
    }
    this.saveProgress()
  }

  completeChecklist() {
    console.log('Completing checklist...')
    this.unlockPhase('warm-up')
    this.switchToPhase('warm-up')
    this.saveProgress()
    this.showNotification('Checklist complete! Time to warm up 🔥')
  }

  // Warm-up Phase
  setupCardioTimer() {
    const startBtn = document.getElementById('cardio-start')
    const pauseBtn = document.getElementById('cardio-pause')
    const resetBtn = document.getElementById('cardio-reset')

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startCardioTimer())
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pauseCardioTimer())
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetCardioTimer())
    }
  }

  startCardioTimer() {
    if (!this.cardioRunning) {
      this.cardioRunning = true
      const startBtn = document.getElementById('cardio-start')
      const pauseBtn = document.getElementById('cardio-pause')
      const timer = document.getElementById('cardio-timer')
      const status = document.getElementById('cardio-status')

      if (startBtn) startBtn.disabled = true
      if (pauseBtn) pauseBtn.disabled = false
      if (timer) timer.classList.add('running')
      if (status) status.textContent = 'Timer running - keep moving!'

      this.cardioTimer = setInterval(() => {
        this.cardioTimeLeft--
        this.updateCardioDisplay()

        if (this.cardioTimeLeft <= 0) {
          this.finishCardioTimer()
        }
      }, 1000)

      this.showNotification('Cardio timer started! Keep moving 🔥')
    }
  }

  pauseCardioTimer() {
    if (this.cardioRunning) {
      this.cardioRunning = false
      clearInterval(this.cardioTimer)

      const startBtn = document.getElementById('cardio-start')
      const pauseBtn = document.getElementById('cardio-pause')
      const timer = document.getElementById('cardio-timer')
      const status = document.getElementById('cardio-status')

      if (startBtn) {
        startBtn.disabled = false
        startBtn.textContent = 'Resume'
      }
      if (pauseBtn) pauseBtn.disabled = true
      if (timer) timer.classList.remove('running')
      if (status) status.textContent = 'Timer paused'

      this.showNotification('Cardio timer paused ⏸️')
    }
  }

  resetCardioTimer() {
    this.cardioRunning = false
    this.cardioTimeLeft = this.cardioTime
    if (this.cardioTimer) {
      clearInterval(this.cardioTimer)
    }

    const startBtn = document.getElementById('cardio-start')
    const pauseBtn = document.getElementById('cardio-pause')
    const timer = document.getElementById('cardio-timer')
    const status = document.getElementById('cardio-status')

    if (startBtn) {
      startBtn.disabled = false
      startBtn.textContent = 'Start'
    }
    if (pauseBtn) pauseBtn.disabled = true
    if (timer) {
      timer.classList.remove('running', 'finished')
    }
    if (status) status.textContent = 'Ready to start'

    this.updateCardioDisplay()
    this.showNotification('Cardio timer reset 🔄')
  }

  finishCardioTimer() {
    this.cardioRunning = false
    clearInterval(this.cardioTimer)

    const timer = document.getElementById('cardio-timer')
    const status = document.getElementById('cardio-status')

    if (timer) {
      timer.classList.remove('running')
      timer.classList.add('finished')
    }
    if (status) status.textContent = '✅ Cardio complete!'

    this.playTimerSound()
    this.showNotification('Cardio warm-up complete! 🔥')
    this.checkWarmUpProgress()
    this.saveProgress()
  }

  updateCardioDisplay() {
    const timer = document.getElementById('cardio-timer')
    if (timer) {
      const minutes = Math.floor(this.cardioTimeLeft / 60)
      const seconds = this.cardioTimeLeft % 60
      timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    }
  }

  checkWarmUpProgress() {
    const checkboxes = document.querySelectorAll('.exercise-checkbox')
    const checkedBoxes = document.querySelectorAll('.exercise-checkbox:checked')
    const completeBtn = document.getElementById('warm-up-complete-btn')

    // Mark completed exercises
    checkboxes.forEach((checkbox) => {
      const exerciseItem = checkbox.closest('.exercise-item')
      if (checkbox.checked) {
        exerciseItem.classList.add('completed')
      } else {
        exerciseItem.classList.remove('completed')
      }
    })

    if (completeBtn) {
      const allExercisesComplete = checkedBoxes.length === checkboxes.length
      completeBtn.disabled = !allExercisesComplete

      if (allExercisesComplete) {
        completeBtn.classList.add('btn--primary')
        completeBtn.classList.remove('btn--outline')
      }
    }
    this.saveProgress()
  }

  completeWarmUp() {
    this.unlockPhase('workout')
    this.switchToPhase('workout')
    this.saveProgress()
    this.showNotification('Warm-up complete! Time for the main workout 💪')
  }

  // Main Workout Phase
  renderExerciseCards() {
    const container = this.cachedElements.get('exerciseCards')
    if (!container) {
      console.log('Exercise cards container not found, will render later')
      return
    }

    try {
      const fragment = document.createDocumentFragment()

      this.exercises.forEach((exercise, index) => {
        const card = this.createExerciseCard(exercise, index)
        fragment.appendChild(card)
      })
      
      container.innerHTML = ''
      container.appendChild(fragment)
      console.log('Exercise cards rendered')
    } catch (error) {
      console.error('Exercise cards rendering failed:', error)
    }
  }

  createExerciseCard(exercise, index) {
    const card = document.createElement('div')
    card.className = 'exercise-card'
    card.dataset.exerciseIndex = index

    // Create sets grid
    const setsGrid = Array.from(
      { length: exercise.sets },
      (_, i) => `
            <div class="set-item" data-exercise="${index}" data-set="${i}">
                <span class="set-label">Set ${i + 1}</span>
                <input type="checkbox" class="set-checkbox" data-exercise="${index}" data-set="${i}">
            </div>
        `
    ).join('')

    card.innerHTML = `
            <div class="exercise-header">
                <div class="exercise-title">
                    <h3>${exercise.name}</h3>
                    <div class="exercise-details">${exercise.sets} sets × ${
      exercise.reps
    } reps • ${exercise.restTime}s rest</div>
                </div>
                <div class="exercise-equipment">${exercise.equipment}</div>
            </div>
            
            <div class="exercise-info">
                <div class="info-section">
                    <h4>Starting Weight</h4>
                    <p>${exercise.startingWeight}</p>
                </div>
                <div class="info-section">
                    <h4>Muscles Worked</h4>
                    <p>${exercise.muscles}</p>
                </div>
                <div class="info-section">
                    <h4>Form Tips</h4>
                    <p>${exercise.formTips}</p>
                </div>
                <div class="info-section">
                    <h4>Alternatives</h4>
                    <div class="alternatives">
                        <ul>
                            ${exercise.alternatives
                              .map((alt) => `<li>${alt}</li>`)
                              .join('')}
                        </ul>
                    </div>
                </div>
                ${
                  exercise.videoUrl
                    ? `
                <div class="info-section">
                    <h4>Exercise Demo</h4>
                    <div class="video-container">
                        <iframe
                            src="${exercise.videoUrl}"
                            title="${exercise.name} demonstration"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowfullscreen
                        ></iframe>
                    </div>
                </div>
                `
                    : ''
                }
            </div>
            
            <div class="sets-grid">
                ${setsGrid}
            </div>
        `

    // Add event listeners for set checkboxes
    card.querySelectorAll('.set-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        this.handleSetComplete(e.target)
      })
    })

    return card
  }

  handleSetComplete(checkbox) {
    const exerciseIndex = parseInt(checkbox.dataset.exercise)
    const setIndex = parseInt(checkbox.dataset.set)
    const exercise = this.exercises[exerciseIndex]
    const setItem = checkbox.closest('.set-item')

    if (checkbox.checked) {
      this.completedSets++
      setItem.classList.add('completed')

      // Start rest timer if not the last set of the last exercise
      const isLastSet = setIndex === exercise.sets - 1
      const isLastExercise = exerciseIndex === this.exercises.length - 1

      if (!isLastSet || !isLastExercise) {
        this.startRestTimer(exercise.restTime)
      }

      this.showNotification(
        `Set ${setIndex + 1} of ${exercise.name} complete! 💪`
      )
    } else {
      this.completedSets--
      setItem.classList.remove('completed')
    }

    this.updateWorkoutProgress()
    this.checkExerciseComplete(exerciseIndex)
    this.saveProgress()
  }

  checkExerciseComplete(exerciseIndex) {
    const card = document.querySelector(
      `[data-exercise-index="${exerciseIndex}"]`
    )
    const checkboxes = card.querySelectorAll('.set-checkbox')
    const checkedBoxes = card.querySelectorAll('.set-checkbox:checked')

    if (checkedBoxes.length === checkboxes.length) {
      card.classList.add('completed')
      if (!card.dataset.counted) {
        this.completedExercises++
        card.dataset.counted = 'true'
        this.showNotification(
          `${this.exercises[exerciseIndex].name} complete! 🎉`
        )
      }
    } else {
      card.classList.remove('completed')
      if (card.dataset.counted) {
        this.completedExercises--
        card.dataset.counted = ''
      }
    }

    this.updateWorkoutProgress()
  }

  updateWorkoutProgress() {
    try {
      const setsCount = this.cachedElements.get('setsCount')
      const exercisesCount = this.cachedElements.get('exercisesCount')
      const completeBtn = document.getElementById('workout-complete-btn')

      if (setsCount) setsCount.textContent = this.completedSets
      if (exercisesCount) exercisesCount.textContent = this.completedExercises

      if (completeBtn) {
        const canComplete = this.completedSets >= this.totalSets
        completeBtn.disabled = !canComplete

        if (canComplete) {
          completeBtn.classList.add('btn--primary')
          completeBtn.classList.remove('btn--outline')
        }
      }
    } catch (error) {
      console.error('Workout progress update failed:', error)
    }
  }

  // Rest Timer
  setupRestTimer() {
    const skipBtn = document.getElementById('skip-rest')
    const addTimeBtn = document.getElementById('add-rest-time')
    const restModal = document.getElementById('rest-timer-modal')

    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipRest())
    }
    if (addTimeBtn) {
      addTimeBtn.addEventListener('click', () => this.addRestTime())
    }
    if (restModal) {
      restModal.addEventListener('click', (e) => {
        if (e.target === restModal || e.target.classList.contains('modal-overlay')) {
          this.skipRest()
        }
      })
    }
  }

  startRestTimer(duration) {
    this.restTimeLeft = duration
    this.restRunning = true

    const modal = document.getElementById('rest-timer-modal')
    const timer = document.getElementById('rest-timer')
    const status = document.getElementById('rest-status')

    if (modal) modal.classList.remove('hidden')
    if (timer) timer.classList.add('running')
    if (status) status.textContent = 'Rest and recover'

    this.updateRestDisplay()

    this.restTimer = setInterval(() => {
      this.restTimeLeft--
      this.updateRestDisplay()

      if (this.restTimeLeft <= 0) {
        this.finishRestTimer()
      }
    }, 1000)
  }

  updateRestDisplay() {
    const timer = document.getElementById('rest-timer')
    if (timer) {
      const minutes = Math.floor(this.restTimeLeft / 60)
      const seconds = this.restTimeLeft % 60
      timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    }
  }

  finishRestTimer() {
    this.restRunning = false
    clearInterval(this.restTimer)

    const modal = document.getElementById('rest-timer-modal')
    const timer = document.getElementById('rest-timer')
    const status = document.getElementById('rest-status')

    if (timer) {
      timer.classList.remove('running')
      timer.classList.add('finished')
    }
    if (status) status.textContent = '✅ Rest complete!'

    this.playTimerSound()
    this.showNotification('Rest period complete! Time for your next set 🔔')

    setTimeout(() => {
      if (modal) modal.classList.add('hidden')
      if (timer) timer.classList.remove('finished')
    }, 2000)
  }

  skipRest() {
    if (this.restRunning) {
      clearInterval(this.restTimer)
      this.restRunning = false
    }

    const modal = document.getElementById('rest-timer-modal')
    if (modal) modal.classList.add('hidden')

    this.showNotification('Rest skipped! Keep going 💪')
  }

  addRestTime() {
    this.restTimeLeft += 30
    this.updateRestDisplay()
    this.showNotification('Added 30 seconds to rest timer ⏱️')
  }

  completeWorkout() {
    this.unlockPhase('stretching')
    this.switchToPhase('stretching')
    this.saveProgress()
    this.showNotification(
      'Main workout complete! Time to stretch and cool down 🧘'
    )
  }

  // Stretching Phase
  renderStretchList() {
    const container = this.cachedElements.get('stretchList')
    if (!container) {
      console.log('Stretch list container not found, will render later')
      return
    }

    try {
      const fragment = document.createDocumentFragment()

      this.stretches.forEach((stretch, index) => {
        const item = this.createStretchItem(stretch, index)
        fragment.appendChild(item)
      })
      
      container.innerHTML = ''
      container.appendChild(fragment)
      console.log('Stretch list rendered')
    } catch (error) {
      console.error('Stretch list rendering failed:', error)
    }
  }

  createStretchItem(stretch, index) {
    const item = document.createElement('div')
    item.className = 'stretch-item'
    item.dataset.stretchIndex = index

    item.innerHTML = `
            <div class="stretch-header">
                <div class="stretch-info">
                    <div class="stretch-name">${stretch.name}</div>
                    <div class="stretch-instructions">${stretch.instructions}</div>
                </div>
                <div class="stretch-controls-row">
                    <div class="stretch-duration">${stretch.duration}s</div>
                    <button class="btn btn--primary stretch-button" data-stretch="${index}">
                        Start Stretch
                    </button>
                </div>
            </div>
            ${
              stretch.videoUrl
                ? `
            <div class="video-container">
                <iframe
                    src="${stretch.videoUrl}"
                    title="${stretch.name} demonstration"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                ></iframe>
            </div>
            `
                : ''
            }
        `

    const button = item.querySelector('.stretch-button')
    button.addEventListener('click', () => this.startStretch(index))

    return item
  }

  startStretch(index) {
    // Prevent starting if already running
    if (this.stretchRunning) {
      this.showNotification('Stretch already in progress!')
      return
    }

    const stretch = this.stretches[index]
    this.currentStretchIndex = index
    this.stretchTimeLeft = stretch.duration
    this.stretchRunning = true

    const modal = document.getElementById('stretch-timer-modal')
    const nameEl = document.getElementById('current-stretch-name')
    const instructionsEl = document.getElementById('stretch-instructions')
    const timer = document.getElementById('stretch-timer')
    const status = document.getElementById('stretch-status')
    const finishBtn = document.getElementById('finish-stretch')

    if (modal) modal.classList.remove('hidden')
    if (nameEl) nameEl.textContent = stretch.name
    if (instructionsEl) instructionsEl.textContent = stretch.instructions
    if (timer) {
      timer.classList.remove('finished')
      timer.classList.add('running')
    }
    if (status) status.textContent = 'Hold this position'

    if (finishBtn) {
      finishBtn.onclick = () => this.finishStretch()
    }

    this.updateStretchDisplay()

    this.stretchTimer = setInterval(() => {
      this.stretchTimeLeft--
      this.updateStretchDisplay()

      if (this.stretchTimeLeft <= 0) {
        this.finishStretchTimer()
      }
    }, 1000)

    this.showNotification(
      `Starting ${stretch.name} - hold for ${stretch.duration} seconds 🧘`
    )
  }

  updateStretchDisplay() {
    const timer = document.getElementById('stretch-timer')
    if (timer) {
      const minutes = Math.floor(this.stretchTimeLeft / 60)
      const seconds = this.stretchTimeLeft % 60
      timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    }
  }

  finishStretchTimer() {
    if (!this.stretchRunning) return // Prevent multiple calls

    this.stretchRunning = false
    clearInterval(this.stretchTimer)
    this.stretchTimer = null

    const timer = document.getElementById('stretch-timer')
    const status = document.getElementById('stretch-status')

    if (timer) {
      timer.classList.remove('running')
      timer.classList.add('finished')
    }
    if (status) status.textContent = '✅ Stretch complete!'

    this.playTimerSound()
    this.showNotification(
      `${this.stretches[this.currentStretchIndex].name} complete! 🧘`
    )

    setTimeout(() => {
      this.finishStretch()
    }, 2000)
  }

  finishStretch() {
    const modal = document.getElementById('stretch-timer-modal')
    const stretchItem = document.querySelector(
      `[data-stretch-index="${this.currentStretchIndex}"]`
    )

    if (modal) modal.classList.add('hidden')

    if (stretchItem && !stretchItem.classList.contains('completed')) {
      const button = stretchItem.querySelector('.stretch-button')
      stretchItem.classList.add('completed')
      if (button) {
        button.textContent = '✅ Complete'
        button.disabled = true
      }
    }

    // Clear timer references
    if (this.stretchTimer) {
      clearInterval(this.stretchTimer)
      this.stretchTimer = null
    }
    this.stretchRunning = false

    this.checkStretchingProgress()
    this.saveProgress()
  }

  checkStretchingProgress() {
    const completedStretches = document.querySelectorAll(
      '.stretch-item.completed'
    )
    const completeBtn = document.getElementById('stretching-complete-btn')

    if (completeBtn) {
      const canComplete = completedStretches.length >= this.stretches.length
      completeBtn.disabled = !canComplete

      if (canComplete) {
        completeBtn.classList.add('btn--primary')
        completeBtn.classList.remove('btn--outline')
      }
    }
  }

  // Cool-down Timer
  setupCooldownTimer() {
    const startBtn = document.getElementById('cooldown-start')
    const pauseBtn = document.getElementById('cooldown-pause')
    const resetBtn = document.getElementById('cooldown-reset')

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startCooldownTimer())
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pauseCooldownTimer())
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetCooldownTimer())
    }
  }

  startCooldownTimer() {
    if (!this.cooldownRunning) {
      this.cooldownRunning = true
      const startBtn = document.getElementById('cooldown-start')
      const pauseBtn = document.getElementById('cooldown-pause')
      const timer = document.getElementById('cooldown-timer')
      const status = document.getElementById('cooldown-status')

      if (startBtn) startBtn.disabled = true
      if (pauseBtn) pauseBtn.disabled = false
      if (timer) timer.classList.add('running')
      if (status) status.textContent = 'Cool-down in progress'

      this.cooldownTimer = setInterval(() => {
        this.cooldownTimeLeft--
        this.updateCooldownDisplay()

        if (this.cooldownTimeLeft <= 0) {
          this.finishCooldownTimer()
        }
      }, 1000)

      this.showNotification(
        'Cool-down timer started! Keep moving at easy pace 🚶'
      )
    }
  }

  pauseCooldownTimer() {
    if (this.cooldownRunning) {
      this.cooldownRunning = false
      clearInterval(this.cooldownTimer)

      const startBtn = document.getElementById('cooldown-start')
      const pauseBtn = document.getElementById('cooldown-pause')
      const timer = document.getElementById('cooldown-timer')
      const status = document.getElementById('cooldown-status')

      if (startBtn) {
        startBtn.disabled = false
        startBtn.textContent = 'Resume'
      }
      if (pauseBtn) pauseBtn.disabled = true
      if (timer) timer.classList.remove('running')
      if (status) status.textContent = 'Timer paused'
    }
  }

  resetCooldownTimer() {
    this.cooldownRunning = false
    this.cooldownTimeLeft = this.cooldownTime
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer)
    }

    const startBtn = document.getElementById('cooldown-start')
    const pauseBtn = document.getElementById('cooldown-pause')
    const timer = document.getElementById('cooldown-timer')
    const status = document.getElementById('cooldown-status')

    if (startBtn) {
      startBtn.disabled = false
      startBtn.textContent = 'Start'
    }
    if (pauseBtn) pauseBtn.disabled = true
    if (timer) {
      timer.classList.remove('running', 'finished')
    }
    if (status) status.textContent = 'Ready to start'

    this.updateCooldownDisplay()
  }

  finishCooldownTimer() {
    this.cooldownRunning = false
    clearInterval(this.cooldownTimer)

    const timer = document.getElementById('cooldown-timer')
    const status = document.getElementById('cooldown-status')

    if (timer) {
      timer.classList.remove('running')
      timer.classList.add('finished')
    }
    if (status) status.textContent = '✅ Cool-down complete!'

    this.playTimerSound()
    this.showNotification('Cool-down complete! Great job! 🎉')
    this.saveProgress()
  }

  updateCooldownDisplay() {
    const timer = document.getElementById('cooldown-timer')
    if (timer) {
      const minutes = Math.floor(this.cooldownTimeLeft / 60)
      const seconds = this.cooldownTimeLeft % 60
      timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    }
  }

  completeStretching() {
    this.unlockPhase('complete')
    this.switchToPhase('complete')
    this.updateFinalStats()
    this.clearProgress()
    this.showNotification('Congratulations! Pull Day workout complete! 🎉')
  }

  updateFinalStats() {
    try {
      const finalSets = this.cachedElements.get('finalSets')
      const finalExercises = this.cachedElements.get('finalExercises')
      const finalTime = this.cachedElements.get('finalTime')

      if (finalSets) finalSets.textContent = this.completedSets
      if (finalExercises) finalExercises.textContent = this.completedExercises

      if (finalTime && this.workoutStartTime) {
        const duration = Math.floor((Date.now() - this.workoutStartTime) / 60000)
        finalTime.textContent = duration
      }
    } catch (error) {
      console.error('Final stats update failed:', error)
    }
  }

  // Confidence Panel
  setupConfidencePanel() {
    const toggle = document.getElementById('confidence-toggle')
    const panel = document.getElementById('confidence-panel')

    if (toggle && panel) {
      toggle.addEventListener('click', () => {
        panel.classList.toggle('open')
      })
    }
  }

  // Utility Functions
  playTimerSound() {
    const audio = document.getElementById('timer-sound')
    if (audio) {
      audio.currentTime = 0
      audio.play().catch((e) => console.log('Audio play failed:', e))
    }
  }

  showNotification(message, type = 'success') {
    try {
      // Prevent duplicate notifications
      const existingNotifications = document.querySelectorAll('.notification')
      const isDuplicate = Array.from(existingNotifications).some(
        (n) => n.textContent === message
      )

      if (isDuplicate) {
        console.log('Duplicate notification prevented:', message)
        return
      }

      console.log('Notification:', message)
      const notification = document.createElement('div')
      notification.className = `notification ${type}`
      notification.textContent = message

      document.body.appendChild(notification)

      requestAnimationFrame(() => {
        notification.classList.add('show')
      })

      setTimeout(() => {
        notification.classList.remove('show')
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification)
          }
        }, 300)
      }, 3000)
    } catch (error) {
      console.error('Notification display failed:', error)
    }
  }

  // Progress persistence methods
  saveProgress() {
    const progress = {
      currentPhase: this.currentPhase,
      completedSets: this.completedSets,
      completedExercises: this.completedExercises,
      workoutStartTime: this.workoutStartTime,
      cardioTimeLeft: this.cardioTimeLeft,
      cooldownTimeLeft: this.cooldownTimeLeft,
      checkboxStates: {},
      stretchStates: {}
    }

    // Save checkbox states
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      progress.checkboxStates[checkbox.id] = checkbox.checked
    })

    // Save stretch completion states
    document.querySelectorAll('.stretch-item').forEach(item => {
      const index = item.dataset.stretchIndex
      if (index !== undefined) {
        progress.stretchStates[index] = item.classList.contains('completed')
      }
    })

    localStorage.setItem('pullDayProgress', JSON.stringify(progress))
  }

  loadProgress() {
    const saved = localStorage.getItem('pullDayProgress')
    if (!saved) return

    try {
      const progress = JSON.parse(saved)
      this.restoreWorkoutState(progress)
    } catch (error) {
      console.error('Error loading progress:', error)
    }
  }

  restoreWorkoutState(progress) {
    // Restore basic state
    this.completedSets = progress.completedSets || 0
    this.completedExercises = progress.completedExercises || 0
    this.workoutStartTime = progress.workoutStartTime
    this.cardioTimeLeft = progress.cardioTimeLeft || 300
    this.cooldownTimeLeft = progress.cooldownTimeLeft || 600

    // Wait for DOM to be ready before restoring UI state
    setTimeout(() => {
      // Restore checkbox states
      if (progress.checkboxStates) {
        Object.entries(progress.checkboxStates).forEach(([id, checked]) => {
          const checkbox = document.getElementById(id)
          if (checkbox) {
            checkbox.checked = checked
            if (checked) {
              const item = checkbox.closest('.exercise-item, .checklist-item')
              if (item) item.classList.add('completed')
            }
          }
        })
      }

      // Restore stretch states
      if (progress.stretchStates) {
        Object.entries(progress.stretchStates).forEach(([index, completed]) => {
          const item = document.querySelector(`[data-stretch-index="${index}"]`)
          if (item && completed) {
            item.classList.add('completed')
            const button = item.querySelector('.stretch-button')
            if (button) {
              button.textContent = '✅ Complete'
              button.disabled = true
            }
          }
        })
      }

      // Update displays
      this.updateCardioDisplay()
      this.updateCooldownDisplay()
      this.updateWorkoutProgress()
      this.checkChecklistProgress()
      this.checkWarmUpProgress()
      this.checkStretchingProgress()

      // Restore phase if not welcome
      if (progress.currentPhase && progress.currentPhase !== 'welcome') {
        this.switchToPhase(progress.currentPhase)
        // Unlock phases up to current
        const phaseIndex = this.phases.indexOf(progress.currentPhase)
        for (let i = 1; i <= phaseIndex; i++) {
          this.unlockPhase(this.phases[i])
        }
      }
    }, 100)
  }

  clearProgress() {
    localStorage.removeItem('pullDayProgress')
  }
  
  cleanup() {
    // Clean up timers
    if (this.cardioTimer) clearInterval(this.cardioTimer)
    if (this.restTimer) clearInterval(this.restTimer)
    if (this.stretchTimer) clearInterval(this.stretchTimer)
    if (this.cooldownTimer) clearInterval(this.cooldownTimer)
    
    // Clean up event listeners
    this.eventListeners.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler)
    })
    this.eventListeners.clear()
    this.cachedElements.clear()
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing Pull Day Workout App...')
  window.pullDayApp = new PullDayWorkoutApp()
})

// Also initialize immediately if DOM is already loaded
if (document.readyState !== 'loading') {
  console.log('DOM already loaded, initializing Pull Day Workout App...')
  window.pullDayApp = new PullDayWorkoutApp()
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.pullDayApp && typeof window.pullDayApp.cleanup === 'function') {
    window.pullDayApp.cleanup()
  }
})

// Service worker registration for offline functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => console.log('SW registered'))
      .catch((registrationError) => console.log('SW registration failed'))
  })
}
