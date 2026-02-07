<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# DartStore Development Guidelines

## Project Overview
DartStore is a modern, high-performance web application for modeling Firestore databases and generating type-safe Dart code for Flutter applications in real-time.

## Tech Stack
- React 18 with TypeScript for type-safe components
- Vite 7 for fast builds and HMR
- Tailwind CSS 4 for modern, responsive UI
- Monaco Editor for professional code preview
- Lucide React for consistent icons
- pnpm for reliable dependency management

## Architecture

### Directory Structure
```
src/
├── components/       # Reusable React components
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── App.tsx          # Main application component
├── main.tsx         # Entry point
└── index.css        # Global styles (Tailwind)
```

### Core Components
- **App.tsx** - Main state management and layout orchestration
- **WelcomeScreen.tsx** - First-time user experience with project creation/import
- **Header.tsx** - Top navigation with export/import options
- **Sidebar.tsx** - Collection list management
- **CollectionEditor.tsx** - Collection and field editing interface
- **CodePreview.tsx** - Monaco Editor for Dart code display

### Utilities
- **dartGenerator.ts** - All Dart code generation logic with proper type mappings
- **storage.ts** - LocalStorage management and export/import functionality

### Types
- **types/index.ts** - Complete TypeScript interfaces for the entire data model

## Dart Code Generation

The generator creates:
- Fully typed Dart classes with null-safety
- `fromFirestore()` factory constructors
- `toFirestore()` serialization methods
- `copyWith()` for immutable updates
- Full documentation from user descriptions

Supported Firestore types:
- string, number, boolean, timestamp, geopoint, reference
- array (with configurable item type)
- map (with configurable value type)

## Development Guidelines

### Adding New Features
1. Keep components focused and single-responsibility
2. Add types before implementing components
3. Test code generation with various field types
4. Ensure performance with React.useMemo for generated code

### Code Style
- Use TypeScript strictly (no `any` types)
- Prefer functional components with hooks
- Name components clearly (avoid abbreviations)
- Document complex logic

### Performance Optimization
- Code is split into chunks: react-vendor, monaco-editor, main app
- Minification via esbuild
- Assets are ~245KB gzipped
- Local storage prevents unnecessary re-renders

### Deployment
- GitHub Actions workflow handles automated deployment to GitHub Pages
- Update `vite.config.ts` base URL for different deployment paths
- Static files only - no backend needed

## Key Features to Maintain

1. **Auto-save** - Projects save automatically to localStorage
2. **Export/Import** - Both project JSON and Dart code export
3. **Real-time Rendering** - Dart code updates as you edit
4. **Responsive Design** - Works on all screen sizes
5. **Type Safety** - All Firestore types properly mapped to Dart

## Common Tasks

### Running Development Server
```bash
pnpm run dev  # http://localhost:5173/DartStore/
```

### Building for Production
```bash
pnpm run build  # Creates dist/ folder
```

### Type Checking
```bash
pnpm run tsc    # Via npm scripts, TypeScript is built-in
```

## Important Notes

- Always use `pnpm` instead of npm for dependency management
- Tailwind CSS 4 uses `@import "tailwindcss"` syntax
- PostCSS uses `@tailwindcss/postcss` plugin
- Don't modify Dart generation templates without testing thoroughly
- localStorage key is 'dartstore_project'

## Browser Compatibility
- Modern browsers with localStorage support
- No IE11 support (uses ES2020+ features)

## Testing Generated Code

When testing Dart code generation:
1. Create collections with various field types
2. Check null-safety handling (? operator)
3. Verify array and map type parameters
4. Confirm timestamps and references map correctly
5. Test export to file functionality
