# PPL Fitness Tracker 💪

A comprehensive web-based fitness tracking application for Push-Pull-Legs (PPL) workout routines. Track your progress, time your exercises, and stay motivated with an intuitive dashboard.

## Features

### 🏠 Dashboard
- **Workout Overview**: Visual cards for Push, Pull, and Legs days
- **Progress Tracking**: Current streak, total workouts, and training hours
- **Weekly Schedule**: Calendar view of your training program
- **Quick Stats**: Sets, reps, weight, and personal records
- **Daily Motivation**: Inspirational quotes and workout tips

### 🏋️ Workout Modules
- **Push Day**: Chest, Shoulders, Triceps (6 exercises, 17 sets)
- **Pull Day**: Back & Biceps (6 exercises, 16-17 sets)  
- **Legs Day**: Quads, Hamstrings, Glutes, Calves (6 exercises, 16 sets)

### ⏱️ Built-in Timers
- **Warm-up Timer**: 5-minute cardio countdown
- **Rest Timers**: 90-second rest between sets
- **Stretch Timers**: 30-45 second holds for each stretch
- **Cooldown Timer**: 10-minute post-workout recovery

### 📱 Progressive Workflow
- **Pre-workout Checklist**: Equipment and preparation verification
- **Warm-up Phase**: Cardio and dynamic movements
- **Main Workout**: Structured exercise progression with set tracking
- **Post-workout**: Stretching and recovery checklist

### 💾 Progress Persistence
- **Local Storage**: Automatic save/restore of workout progress
- **Phase Navigation**: Jump between workout phases
- **Set Completion**: Track individual sets and exercises
- **Workout History**: Recent activity tracking

## Getting Started

### Development Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:3000 in your browser

### Production Build
```bash
npm run build
npm run preview
```

### Quick Start (Static)
1. Open `index.html` in your web browser
2. Navigate to your desired workout day
3. Follow the guided workout phases
4. Track your progress automatically

### File Structure
```
ppl-fitness-tracker/
├── index.html                 # Main dashboard
├── ppl-workout-dashboard/     # Dashboard components
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── accessibility-fixes.css
├── push-day-workout/          # Push day module
│   ├── index.html
│   ├── app.js
│   └── style.css
├── pull-day-workout/          # Pull day module
│   ├── index.html
│   ├── app.js
│   └── style.css
└── legs-day-workout/          # Legs day module
    ├── index.html
    ├── app.js
    └── style.css
```

## Workout Programs

### Push Day (Chest, Shoulders, Triceps)
- Bench Press: 3 sets
- Overhead Press: 3 sets  
- Incline Dumbbell Press: 3 sets
- Lateral Raises: 3 sets
- Tricep Dips: 3 sets
- Push-ups: 2 sets

### Pull Day (Back & Biceps)
- Pull-ups/Lat Pulldowns: 3 sets
- Barbell Rows: 3 sets
- Cable Rows: 3 sets
- Face Pulls: 3 sets
- Bicep Curls: 3 sets
- Hammer Curls: 2-3 sets

### Legs Day (Lower Body)
- Squats: 3 sets
- Romanian Deadlifts: 3 sets
- Leg Press: 3 sets
- Leg Curls: 3 sets
- Calf Raises: 2 sets
- Lunges: 2 sets

## Technology Stack

- **Build Tool**: Vite
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Bulma CSS Framework
- **Icons**: Font Awesome
- **Storage**: Browser LocalStorage
- **Responsive**: Mobile-first design

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test across different devices
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Bulma CSS for the responsive framework
- Font Awesome for icons
- PPL training methodology for workout structure