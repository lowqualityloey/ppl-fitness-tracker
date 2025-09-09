// Simple authorization utility for workout app
class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.user = null;
    }
    
    // Simple session check (can be enhanced with JWT tokens)
    checkAuth() {
        const session = sessionStorage.getItem('workout_session');
        if (session) {
            try {
                this.user = JSON.parse(session);
                this.isAuthenticated = true;
                return true;
            } catch (e) {
                this.clearAuth();
            }
        }
        return false;
    }
    
    // Set user session
    setAuth(userData) {
        this.user = userData;
        this.isAuthenticated = true;
        sessionStorage.setItem('workout_session', JSON.stringify(userData));
    }
    
    // Clear authentication
    clearAuth() {
        this.user = null;
        this.isAuthenticated = false;
        sessionStorage.removeItem('workout_session');
    }
    
    // Check if user can access workout features
    canAccessWorkout() {
        return this.isAuthenticated || this.isGuestMode();
    }
    
    // Allow guest mode for demo purposes
    isGuestMode() {
        return localStorage.getItem('guest_mode') === 'true';
    }
    
    // Enable guest mode
    enableGuestMode() {
        localStorage.setItem('guest_mode', 'true');
    }
}

// Export for use in other files
window.AuthManager = AuthManager;