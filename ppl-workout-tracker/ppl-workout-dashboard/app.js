// PPL Fitness Dashboard - Interactive JavaScript

class PPLDashboard {
  constructor() {
    // Application data from the provided JSON
    this.userData = {
      name: 'Jonell',
      age: 30,
      weight: '66kg',
      height: '165cm',
      ethnicity: 'Asian',
      fitness_level: 'Beginner',
      current_date: 'Tuesday, September 9, 2025',
      timezone: 'NZST',
    }

    this.workoutSchedule = {
      monday: {
        type: 'Push',
        muscles: 'Chest, Shoulders, Triceps',
        duration: '45-55 min',
        difficulty: 'Beginner',
        status: 'completed',
      },
      tuesday: {
        type: 'Pull',
        muscles: 'Back, Biceps',
        duration: '45-55 min',
        difficulty: 'Beginner',
        status: 'scheduled',
        is_today: true,
      },
      wednesday: {
        type: 'Legs',
        muscles: 'Quads, Hamstrings, Glutes, Calves',
        duration: '45-55 min',
        difficulty: 'Beginner',
        status: 'upcoming',
      },
      thursday: {
        type: 'Push',
        muscles: 'Chest, Shoulders, Triceps',
        duration: '45-55 min',
        difficulty: 'Beginner',
        status: 'upcoming',
      },
      friday: {
        type: 'Pull',
        muscles: 'Back, Biceps',
        duration: '45-55 min',
        difficulty: 'Beginner',
        status: 'upcoming',
      },
      saturday: {
        type: 'Rest',
        activity: 'Active Recovery / Light Walking',
        duration: 'Optional',
        status: 'upcoming',
      },
      sunday: {
        type: 'Rest',
        activity: 'Active Recovery / Light Walking',
        duration: 'Optional',
        status: 'upcoming',
      },
    }

    this.stats = {
      total_workouts: 3,
      current_streak: 2,
      this_week_completed: 1,
      this_week_total: 3,
      favorite_exercise: 'Lat Pulldown',
      total_sets: 51,
      total_reps: 612,
      hours_trained: 2.5,
    }

    this.recentWorkouts = [
      {
        date: 'Monday, Sep 8, 2025',
        type: 'Push Day',
        duration: '48 minutes',
        exercises: 6,
        sets_completed: 17,
        rating: 4,
      },
      {
        date: 'Friday, Sep 5, 2025',
        type: 'Pull Day',
        duration: '52 minutes',
        exercises: 6,
        sets_completed: 17,
        rating: 5,
      },
      {
        date: 'Wednesday, Sep 3, 2025',
        type: 'Legs Day',
        duration: '45 minutes',
        exercises: 6,
        sets_completed: 17,
        rating: 3,
      },
    ]

    this.motivationalQuotes = [
      "The only bad workout is the one that didn't happen.",
      "Progress, not perfection. You're getting stronger every day!",
      "Your body can do it. It's time to convince your mind.",
      "Every rep counts. Every set matters. You've got this!",
      "Strength doesn't come from what you can do. It comes from overcoming what you thought you couldn't.",
    ]

    this.todaysTips = [
      'Focus on squeezing your shoulder blades together during pull exercises',
      'Cable machines are perfect for beginners - they guide your movement',
      'Start with lighter weights and perfect your form first',
      "Remember to breathe: exhale during the 'work' phase of each rep",
      "Don't rush between sets - proper rest helps muscle recovery",
    ]

    this.workoutLinks = {
      push: 'push-day-workout/index.html',
      pull: 'pull-day-workout/index.html',
      legs: 'legs-day-workout/index.html',
    }

    this.init()
  }

  init() {
    console.log('PPL Dashboard initializing...')

    // Setup mobile menu
    this.setupMobileMenu()

    // Populate dashboard content
    this.populateWeeklySchedule()
    this.populateRecentWorkouts()
    this.setDailyMotivation()

    // Setup event listeners
    this.setupEventListeners()

    // Add some visual flair
    this.addAnimations()

    console.log('PPL Dashboard ready!')
  }

  setupMobileMenu() {
    // Get all "navbar-burger" elements
    const navbarBurgers = Array.prototype.slice.call(
      document.querySelectorAll('.navbar-burger'),
      0
    )

    // Add a click event on each of them
    navbarBurgers.forEach((el) => {
      el.addEventListener('click', () => {
        // Get the target from the "data-target" attribute
        const target = el.dataset.target
        const targetElement = document.getElementById(target)

        // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
        el.classList.toggle('is-active')
        targetElement.classList.toggle('is-active')
      })
    })
  }

  populateWeeklySchedule() {
    const scheduleContainer = document.getElementById('weekly-schedule')
    if (!scheduleContainer) return

    const days = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const dayEmojis = {
      Push: '💪',
      Pull: '🔙',
      Legs: '🦵',
      Rest: '😴',
    }

    scheduleContainer.innerHTML = ''

    days.forEach((day, index) => {
      const workout = this.workoutSchedule[day]
      const isToday = workout.is_today || false
      const isCompleted = workout.status === 'completed'
      const isRest = workout.type === 'Rest'

      const dayElement = document.createElement('div')
      let cssClasses = 'schedule-day'

      if (isToday) cssClasses += ' today'
      if (isCompleted) cssClasses += ' completed'
      if (isRest) cssClasses += ' rest'

      dayElement.className = cssClasses

      const emoji = dayEmojis[workout.type] || '💪'
      const displayType = isRest ? 'Rest' : workout.type

      dayElement.innerHTML = `
                <div class="day-name">${dayLabels[index]}</div>
                <div class="day-emoji">${emoji}</div>
                <div class="day-workout">${displayType}</div>
            `

      // Add click event for non-rest days
      if (!isRest) {
        dayElement.style.cursor = 'pointer'
        dayElement.addEventListener('click', () => {
          this.showWorkoutDetails(workout)
        })
      }

      scheduleContainer.appendChild(dayElement)
    })

    console.log('Weekly schedule populated')
  }

  populateRecentWorkouts() {
    const container = document.getElementById('recent-workouts')
    if (!container) return

    container.innerHTML = ''

    this.recentWorkouts.forEach((workout) => {
      const workoutElement = document.createElement('div')
      workoutElement.className = 'workout-item'

      const stars = this.generateStarRating(workout.rating)

      workoutElement.innerHTML = `
                <div class="workout-info">
                    <h4>${workout.type}</h4>
                    <p>${workout.date} • ${workout.duration} • ${workout.sets_completed} sets</p>
                </div>
                <div class="workout-rating">
                    ${stars}
                </div>
            `

      container.appendChild(workoutElement)
    })

    console.log('Recent workouts populated')
  }

  generateStarRating(rating) {
    let stars = ''
    for (let i = 1; i <= 5; i++) {
      if (i <= rating) {
        stars += '<i class="fas fa-star star"></i>'
      } else {
        stars += '<i class="far fa-star star empty"></i>'
      }
    }
    return stars
  }

  setDailyMotivation() {
    // Set random motivational quote
    const quoteElement = document.getElementById('daily-quote')
    if (quoteElement) {
      const randomQuote =
        this.motivationalQuotes[
          Math.floor(Math.random() * this.motivationalQuotes.length)
        ]
      quoteElement.textContent = randomQuote
    }

    // Set daily tip (use first tip for Pull day)
    const tipElement = document.getElementById('daily-tip')
    if (tipElement) {
      tipElement.textContent = this.todaysTips[0] // Pull day specific tip
    }
  }

  setupEventListeners() {
    // Equipment checklist interactions
    const checkboxes = document.querySelectorAll(
      '.equipment-list .checkbox input'
    )
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const label = e.target.closest('.checkbox')
        if (e.target.checked) {
          label.classList.add('is-success-highlighted')
          this.showNotification(
            'Equipment Ready! ✅',
            'Great preparation leads to great workouts!',
            'success'
          )
          setTimeout(() => {
            label.classList.remove('is-success-highlighted')
          }, 1000)
        }
      })
    })

    // Workout card hover effects
    const workoutCards = document.querySelectorAll('.workout-card')
    workoutCards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-8px)'
      })

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)'
      })
    })

    // Stats hover effects with info
    const statItems = document.querySelectorAll('.stat-item')
    statItems.forEach((item) => {
      item.addEventListener('mouseenter', () => {
        item.style.transform = 'translateY(-4px) scale(1.05)'
      })

      item.addEventListener('mouseleave', () => {
        item.style.transform = 'translateY(0) scale(1)'
      })

      // Add click to show more info
      item.addEventListener('click', () => {
        const statLabel = item.querySelector('.stat-label').textContent
        const statValue = item.querySelector('.stat-value').textContent

        let message = ''
        switch (statLabel) {
          case 'Total Sets':
            message =
              "You've completed 51 sets across all your workouts. Each set brings you closer to your goals!"
            break
          case 'Total Reps':
            message =
              "612 reps completed! That's a lot of muscle-building repetitions. Keep it up!"
            break
          case 'Current Weight':
            message =
              'Your current weight is 66kg. Track your progress and adjust your nutrition as needed.'
            break
          case 'Lat Pulldown PR':
            message =
              'Your personal record for Lat Pulldown is 25kg. Ready to challenge yourself with more weight?'
            break
          default:
            message = `Great progress on your ${statLabel}!`
        }

        this.showNotification(`${statLabel}: ${statValue}`, message, 'info')
      })
    })
  }

  addAnimations() {
    // Add staggered animation to cards
    const cards = document.querySelectorAll('.card')
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 100}ms`
    })

    // Add floating animation to today's workout highlight
    const highlightCard = document.querySelector('.workout-highlight')
    if (highlightCard) {
      setInterval(() => {
        highlightCard.style.transform = 'translateY(-2px)'
        setTimeout(() => {
          highlightCard.style.transform = 'translateY(0)'
        }, 1000)
      }, 3000)
    }
  }

  showWorkoutDetails(workout) {
    const message = `
            ${workout.type} Day Details:
            • Muscles: ${workout.muscles}
            • Duration: ${workout.duration}
            • Difficulty: ${workout.difficulty}
            • Status: ${workout.status}
        `

    this.showNotification(`${workout.type} Day`, message, 'info')
  }

  showNotification(title, message, type = 'success') {
    // Create notification element with improved styling
    const notification = document.createElement('div')
    notification.className = `notification is-${type} is-floating`

    notification.innerHTML = `
            <button class="delete"></button>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.2em;">
                    ${
                      type === 'success'
                        ? '✅'
                        : type === 'info'
                        ? 'ℹ️'
                        : type === 'warning'
                        ? '⚠️'
                        : '🔥'
                    }
                </span>
                <div>
                    <strong>${title}</strong><br>
                    <span style="font-size: 0.9em;">${message.replace(
                      /\n/g,
                      '<br>'
                    )}</span>
                </div>
            </div>
        `

    document.body.appendChild(notification)

    // Add close functionality
    const deleteBtn = notification.querySelector('.delete')
    deleteBtn.addEventListener('click', () => {
      notification.style.animation = 'slideOutRight 0.3s ease-in-out forwards'
      setTimeout(() => notification.remove(), 300)
    })

    // Auto remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutRight 0.3s ease-in-out forwards'
        setTimeout(() => notification.remove(), 300)
      }
    }, 4000)
  }

  // Enhanced workout starting with better loading states
  startWorkout(workoutType) {
    console.log(`Starting ${workoutType} workout...`)

    // Find the button that was clicked
    const startButton =
      event?.target?.closest('button') || event?.target?.closest('a')

    if (startButton) {
      // Store original content
      const originalContent = startButton.innerHTML

      // Add enhanced loading state
      startButton.classList.add('is-loading')
      startButton.innerHTML = `
                <span class="icon">
                    <i class="fas fa-spinner fa-pulse"></i>
                </span>
                <span>Loading...</span>
            `
      startButton.disabled = true
      startButton.style.opacity = '0.8'

      // Show immediate feedback
      this.showNotification(
        `Starting ${
          workoutType.charAt(0).toUpperCase() + workoutType.slice(1)
        } Workout`,
        'Preparing your workout session...',
        'info'
      )

      setTimeout(() => {
        // Restore button
        startButton.classList.remove('is-loading')
        startButton.innerHTML = originalContent
        startButton.disabled = false
        startButton.style.opacity = '1'

        // Navigate to workout page
        if (this.workoutLinks[workoutType.toLowerCase()]) {
          this.showNotification(
            `Starting ${
              workoutType.charAt(0).toUpperCase() + workoutType.slice(1)
            } Workout! 💪`,
            `Navigating to your ${workoutType} workout...`,
            'success'
          )

          // Navigate to the workout page
          setTimeout(() => {
            window.location.href = this.workoutLinks[workoutType.toLowerCase()]
          }, 1000)
        } else {
          this.showNotification(
            'Workout Coming Soon',
            `${workoutType} workout page is under development. Stay tuned!`,
            'warning'
          )
        }
      }, 2000) // 2 second loading simulation
    }
  }

  // Update current date display
  updateCurrentDate() {
    const dateElement = document.getElementById('current-date')
    if (dateElement) {
      const now = new Date()
      const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }
      dateElement.textContent = now.toLocaleDateString('en-US', options)
    }
  }

  // Simulate real-time updates
  startRealTimeUpdates() {
    // Update current date every minute
    setInterval(() => {
      this.updateCurrentDate()
    }, 60000)

    // Add periodic motivational messages (less frequent)
    setInterval(() => {
      const motivationMessages = [
        "Keep pushing! You're doing great! 💪",
        'Remember to stay hydrated! 💧',
        'Your consistency is building strength! 🔥',
        'Every day is a step closer to your goals! 🎯',
      ]

      const randomMessage =
        motivationMessages[
          Math.floor(Math.random() * motivationMessages.length)
        ]
      this.showNotification('Motivation Boost', randomMessage, 'info')
    }, 600000) // Every 10 minutes
  }

  // Initialize progress tracking
  initProgressTracking() {
    // Simulate progress updates (less frequent)
    const progressElements = document.querySelectorAll('.stat-value')

    setInterval(() => {
      progressElements.forEach((element) => {
        const currentValue = parseInt(element.textContent)
        if (!isNaN(currentValue) && Math.random() > 0.95) {
          // Very occasionally increment stats to simulate progress
          element.textContent = (currentValue + 1).toString()
          element.parentElement.classList.add('is-success-highlighted')

          this.showNotification(
            'Progress Update! 📈',
            'Your stats have been updated with recent activity!',
            'success'
          )

          setTimeout(() => {
            element.parentElement.classList.remove('is-success-highlighted')
          }, 2000)
        }
      })
    }, 120000) // Every 2 minutes
  }
}

// Global function for starting workouts (called from HTML)
function startWorkout(workoutType) {
  if (window.pplDashboard) {
    window.pplDashboard.startWorkout(workoutType)
  }
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing PPL Dashboard...')

  // Create global instance
  window.pplDashboard = new PPLDashboard()

  // Start real-time features
  window.pplDashboard.startRealTimeUpdates()
  window.pplDashboard.initProgressTracking()

  // Welcome message
  setTimeout(() => {
    window.pplDashboard.showNotification(
      'Welcome to PPL Fitness! 🏋️‍♂️',
      "Your dashboard is ready. Today's focus: Pull Day! Ready to build some back strength?",
      'success'
    )
  }, 1000)
})

// Add service worker for offline functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registration successful')
      })
      .catch((err) => {
        console.log('ServiceWorker registration failed: ', err)
      })
  })
}

// Handle online/offline status
window.addEventListener('online', () => {
  if (window.pplDashboard) {
    window.pplDashboard.showNotification(
      'Connection Restored! 🌐',
      "You're back online and ready to sync your progress!",
      'success'
    )
  }
})

window.addEventListener('offline', () => {
  if (window.pplDashboard) {
    window.pplDashboard.showNotification(
      'Offline Mode Active 📱',
      'No worries! You can still use your dashboard offline.',
      'info'
    )
  }
})

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case '1':
        e.preventDefault()
        startWorkout('push')
        break
      case '2':
        e.preventDefault()
        startWorkout('pull')
        break
      case '3':
        e.preventDefault()
        startWorkout('legs')
        break
    }
  }
})

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PPLDashboard
}
