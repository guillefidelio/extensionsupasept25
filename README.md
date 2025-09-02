# AI Review Replier - Chrome Extension

AI-powered Chrome extension for generating Google My Business review replies.

## Development Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
Create a `.env` file in the root directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
API_BASE_URL=your_api_base_url
```

### Development Commands

- **Build for production**: `npm run build`
- **Development with watch mode**: `npm run dev`
- **Type checking**: `npm run type-check`
- **Linting**: `npm run lint`
- **Clean build directory**: `npm run clean`

### Loading the Extension in Chrome

1. Build the extension: `npm run build`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist` folder
5. The extension should now appear in your extensions list

### Project Structure

```
src/
├── background/          # Service worker for background tasks
├── content/            # Content scripts for page interaction
├── popup/              # Extension popup UI
├── utils/              # Utility functions
├── components/         # React components (to be implemented)
├── types/              # TypeScript type definitions
└── manifest.json       # Chrome extension manifest
```

## Features (Planned)

- [ ] Google My Business review data extraction
- [ ] AI-powered response generation
- [ ] Automatic response insertion
- [ ] User authentication with Supabase
- [ ] Simple and Pro response modes

## Next Steps

This is the foundation setup. The next phases will implement:
1. Review data extraction from Google My Business pages
2. AI response generation API integration
3. Response insertion functionality
4. User interface components
5. Error handling and edge cases
