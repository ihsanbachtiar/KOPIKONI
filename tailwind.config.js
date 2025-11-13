// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  // Pastikan path ini benar
  content: [
    "./views/**/*.ejs",
    "./views/*.ejs"
  ],
  
  theme: {
    extend: {
      keyframes: {
        fadeInDown: {
          '0%': { opacity: 0, transform: 'translateY(-20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { 
            opacity: 1,
            boxShadow: '0 0 15px rgba(252, 211, 77, 0.4)' 
          },
          '50%': { 
            opacity: 1,
            boxShadow: '0 0 25px rgba(252, 211, 77, 0.7)'
          },
        },
        
        // ===================================
        // KEYFRAME UNTUK LATAR BELAKANG
        // ===================================
        'gradient-pan': {
          '0%': { transform: 'translate(-50%, -50%) rotate(0deg) scale(1.5)' },
          '100%': { transform: 'translate(-50%, -50%) rotate(360deg) scale(1.5)' },
        }
      },
      animation: {
        'fade-in-down': 'fadeInDown 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        
        // ===================================
        // ANIMASI UNTUK LATAR BELAKANG
        // ===================================
        'gradient-pan': 'gradient-pan 60s linear infinite', // Durasi 60 detik, linear, berulang
      }
    },
  },
  plugins: [],
}