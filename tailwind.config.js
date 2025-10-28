/** @type {import('tailwindcss').Config} */
module.exports = {
  // 
  // INI ADALAH BAGIAN TERPENTING YANG HILANG
  // 
  // Tambahkan baris ini untuk memberitahu Tailwind
  // agar memindai SEMUA file .ejs di dalam folder 'views'
  //
  content: [
    "./views/**/*.ejs",
    "./views/*.ejs"
  ],
  
  theme: {
    extend: {
      // Ini adalah animasi yang kita tambahkan sebelumnya
      keyframes: {
        fadeInDown: {
          '0%': { opacity: 0, transform: 'translateY(-20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'pulse-glow': { // Animasi glow untuk tombol
          '0%, 100%': {
            boxShadow: '0 0 10px rgba(252, 211, 77, 0.4)', // Amber glow
          },
          '50%': {
            boxShadow: '0 0 20px rgba(252, 211, 77, 0.7)', // Stronger amber glow
          },
        },
      },
      animation: {
        'fade-in-down': 'fadeInDown 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

