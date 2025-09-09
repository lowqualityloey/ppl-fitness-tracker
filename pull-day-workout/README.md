# PPL Workout Management System

A comprehensive full-stack application for managing Push-Pull-Legs (PPL) workout routines with progress tracking, nutrition guidance, and exercise demonstrations.

## 🏗️ Architecture

- **Frontend**: React 18 with Bulma CSS framework
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT tokens
- **File Storage**: Local storage with Cloudinary integration option

## 📋 Features

### Core Features
- ✅ Complete PPL workout routine management
- ✅ Interactive workout execution with timers
- ✅ Progress tracking and analytics
- ✅ Exercise library with video demonstrations
- ✅ Nutrition tracking and meal planning
- ✅ Personal records tracking
- ✅ User profile management
- ✅ Audio notifications for timers
- ✅ Mobile-responsive design

### Advanced Features
- 📊 Weekly and monthly progress analytics
- 🎯 Goal setting and tracking
- 📱 PWA support for mobile app-like experience
- 🔔 Push notifications for workout reminders
- 📸 Progress photo uploads
- 🏆 Achievement system
- 📈 Strength progression charts
- 🍎 Macro and calorie tracking

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ppl-workout-management
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Setup Database**
   ```bash
   # Create database
   createdb ppl_workout_db

   # Run migrations
   psql -d ppl_workout_db -f database_schema.sql

   # Seed initial data (optional)
   npm run seed
   ```

4. **Setup Frontend**
   ```bash
   cd frontend
   npm install
   ```

5. **Start Development Servers**

   Backend (Terminal 1):
   ```bash
   cd backend
   npm run dev
   ```

   Frontend (Terminal 2):
   ```bash
   cd frontend
   npm start
   ```

6. **Access Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - API Documentation: http://localhost:5000/api/docs

## 📁 Project Structure

```
ppl-workout-management/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API service functions
│   │   ├── utils/           # Utility functions
│   │   └── styles/          # Global styles
│   ├── public/              # Static assets
│   └── package.json
├── backend/                 # Node.js API server
│   ├── config/              # Database and app configuration
│   ├── controllers/         # Route controllers
│   ├── middleware/          # Custom middleware
│   ├── models/              # Database models
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── utils/               # Utility functions
│   ├── uploads/             # File upload directory
│   └── package.json
├── database/                # Database files
│   ├── schema.sql           # Database schema
│   ├── seeds/               # Seed data
│   └── migrations/          # Database migrations
└── docs/                    # Documentation
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ppl_workout_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:3000
```

### Database Setup

The application uses PostgreSQL. Run the schema file to set up all required tables:

```sql
-- Create database
CREATE DATABASE ppl_workout_db;

-- Run the schema file
\i database_schema.sql
```

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Workouts
- `GET /api/workouts/templates` - Get workout templates
- `POST /api/workouts` - Start new workout
- `PUT /api/workouts/:id/complete` - Complete workout
- `POST /api/workouts/:id/exercises` - Log exercise completion
- `GET /api/workouts/history` - Get workout history

### Progress
- `GET /api/progress/dashboard` - Get progress dashboard
- `GET /api/progress/strength/:exerciseId` - Get strength progression
- `POST /api/progress/measurements` - Add body measurements
- `GET /api/progress/measurements` - Get measurement history

### Exercises
- `GET /api/exercises` - Get all exercises
- `GET /api/exercises/:id` - Get specific exercise
- `POST /api/exercises` - Create new exercise (admin)

### Nutrition
- `GET /api/nutrition/guidelines` - Get nutrition guidelines
- `POST /api/nutrition/log` - Log daily nutrition
- `GET /api/nutrition/history` - Get nutrition history

## 🧪 Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

## 🚀 Deployment

### Production Build

1. **Build Frontend**
   ```bash
   cd frontend
   npm run build
   ```

2. **Set Production Environment**
   ```bash
   export NODE_ENV=production
   ```

3. **Start Production Server**
   ```bash
   cd backend
   npm start
   ```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build individual containers
docker build -t ppl-frontend ./frontend
docker build -t ppl-backend ./backend
```

## 📊 Database Schema

The application uses a comprehensive PostgreSQL schema with the following main tables:
- `users` - User profiles and authentication
- `workout_templates` - Predefined workout routines
- `exercises` - Exercise library with instructions
- `user_workouts` - Completed workout sessions
- `user_workout_exercises` - Individual exercise logs
- `user_measurements` - Body measurements and progress photos
- `user_nutrition` - Daily nutrition tracking
- `user_goals` - Goal setting and tracking
- `user_exercise_records` - Personal record tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support, email support@pplworkout.com or create an issue in the repository.

## 🔄 Changelog

### v1.0.0 (Initial Release)
- Complete PPL workout system
- Progress tracking and analytics
- Exercise library with videos
- Nutrition tracking
- User authentication
- Mobile-responsive design
