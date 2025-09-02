# Configuration Guide

## Chrome Extension Setup

This Chrome extension requires proper configuration to work with your Supabase backend and API services.

## Quick Setup

1. **Build the extension** (already done):
   ```bash
   npm run build
   ```

2. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `dist` folder

## Configuration

### Supabase Setup

1. **Get your Supabase credentials**:
   - Go to [supabase.com](https://supabase.com) and create a project
   - Navigate to Settings > API
   - Copy your Project URL and anon/public key

2. **Update the configuration**:
   - Edit `src/config.ts`
   - Replace the placeholder values with your actual credentials:
   ```typescript
   SUPABASE_URL: 'https://your-actual-project.supabase.co',
   SUPABASE_ANON_KEY: 'your-actual-anon-key-here',
   ```

3. **Rebuild the extension**:
   ```bash
   npm run build
   ```

4. **Reload the extension** in Chrome:
   - Go to `chrome://extensions/`
   - Click the refresh icon on your extension

### API Configuration

If you have a custom API backend, update the `API_BASE_URL` in `src/config.ts`:

```typescript
API_BASE_URL: 'https://your-domain.com/api/v1',
```

## Troubleshooting

### "process is not defined" Error
- ✅ **Fixed**: This was caused by Node.js environment variables in browser context
- The webpack configuration now properly handles browser environments

### Popup Not Loading
- Check the browser console for errors
- Ensure all configuration values are set correctly
- Verify the extension is properly loaded in Chrome

### Authentication Issues
- Verify your Supabase credentials are correct
- Check that your Supabase project has authentication enabled
- Ensure the anon key has the necessary permissions

## Development

### Making Configuration Changes
1. Edit `src/config.ts`
2. Run `npm run build`
3. Reload the extension in Chrome

### Adding New Configuration
1. Add the new key to the `CONFIG` object in `src/config.ts`
2. Update the `Config` type if needed
3. Rebuild and reload

## Security Notes

- Never commit real API keys to version control
- Use environment-specific configuration files
- Consider using Chrome's storage API for runtime configuration
- The extension only runs in the context of your specified domains

## Build Output

After running `npm run build`, the `dist` folder contains:
- `manifest.json` - Extension manifest
- `popup/` - Popup interface files
- `background/` - Service worker
- `content/` - Content script
- `icons/` - Extension icons

This folder is what you load into Chrome as an unpacked extension.
