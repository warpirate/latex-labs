/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        claude: {
          bg: '#2B2A27',
          'bg-secondary': '#232220',
          'bg-tertiary': '#1A1915',
          'bg-editor': '#1E1D1B',
          accent: '#D97757',
          'accent-light': '#E49578',
          'accent-muted': '#C4694D',
          'accent-glow': 'rgba(217,119,87,0.08)',
          text: '#E8E5E0',
          'text-secondary': '#8B8680',
          'text-tertiary': '#5C5955',
          border: '#3A3835',
          'border-subtle': '#32302D',
          surface: '#333130',
          'surface-hover': '#3D3B38',
          success: '#4BA67C',
          error: '#D4564A',
          warning: '#C9963A',
          'bg-preview': '#F5F4F0',
          'bg-canvas': '#525659'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace']
      },
      fontSize: {
        '2xs': ['11px', '15px'],
        'xs': ['12px', '17px'],
        'sm': ['13px', '19px'],
        'base': ['14px', '21px'],
        'lg': ['15px', '21px'],
        'xl': ['17px', '24px'],
        '2xl': ['22px', '30px']
      }
    }
  },
  plugins: []
}
