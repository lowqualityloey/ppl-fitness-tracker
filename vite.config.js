import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        push: 'push-day-workout/index.html',
        pull: 'pull-day-workout/index.html',
        legs: 'legs-day-workout/index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})