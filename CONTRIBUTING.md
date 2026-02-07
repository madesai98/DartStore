# Contributing to DartStore

Thank you for your interest in contributing to DartStore! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Please be respectful and constructive in all interactions with the project maintainers and other contributors.

## Getting Started

1. **Fork the repository** - Click the "Fork" button on GitHub
2. **Clone your fork** - `git clone https://github.com/yourusername/DartStore.git`
3. **Create a feature branch** - `git checkout -b feature/your-feature-name`
4. **Install dependencies** - `pnpm install`
5. **Start dev server** - `pnpm run dev`

## Development Workflow

### Before Making Changes
- Check existing issues and pull requests to avoid duplicates
- Open an issue to discuss major changes first
- Ensure TypeScript types are correct with `pnpm run lint`

### While Making Changes
- Write clean, readable code
- Add TypeScript types for all new code
- Test your changes thoroughly
- Keep commits atomic and descriptive

### Before Submitting a PR
1. Update the README if needed
2. Test the build: `pnpm run build`
3. Run type checking: All TypeScript errors must be resolved
4. Verify dev server runs without errors: `pnpm run dev`

## Pull Request Process

1. Update your branch with the latest `main`
2. Ensure all tests pass and the build succeeds
3. Create a descriptive PR title and description
4. Reference any related issues with `#issue-number`
5. Be responsive to review feedback

### PR Title Format
- Use clear, descriptive titles
- Start with a verb: "Add", "Fix", "Improve", "Update", etc.
- Examples:
  - "Add field validation for collection names"
  - "Fix Dart code generation for nested maps"
  - "Improve performance of code preview rendering"

## Types of Contributions

### Bug Reports
- Check if the bug has already been reported
- Provide a clear description
- Include steps to reproduce
- Share what browser/OS you're using

### Feature Requests
- Describe the feature clearly
- Explain the use case
- Show examples if possible
- Discuss implementation approach

### Code Contributions
- Follow the existing code style
- Maintain TypeScript strict mode
- Add comments for complex logic
- Test with various field types

## Code Style Guide

### TypeScript
- Use strict mode (no `any` types)
- Name variables descriptively
- Use proper types instead of unions where possible
- Document complex functions

```typescript
// Good
const handleAddField = (collectionId: string, field: FirestoreField): void => {
  // Implementation
};

// Avoid
const handleAddField = (id: any, field: any) => {
  // Implementation
};
```

### React Components
- Use functional components with hooks
- Props should be typed with interfaces
- Extract constants outside components
- Use meaningful event handler names

```typescript
// Good
interface ButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export default function Button({ onClick, label, disabled }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

// Avoid
export default function Button(props: any) {
  return <button onClick={props.c}>{props.l}</button>;
}
```

### CSS
- Use Tailwind classes
- Avoid custom CSS where possible
- Follow the design system colors
- Ensure responsive design

## Testing Your Changes

### Manual Testing
- Create a new project
- Add collections and fields
- Test export/import functionality
- Verify Dart code generation with various types
- Check responsive design on mobile

### Type Checking
```bash
pnpm run lint  # TypeScript linting
```

### Build Verification
```bash
pnpm run build
```

## Project Structure

```
DartStore/
├── src/
│   ├── components/      # React components
│   ├── types/          # TypeScript definitions
│   ├── utils/          # Utilities
│   ├── App.tsx         # Main component
│   ├── main.tsx        # Entry point
│   └── index.css       # Tailwind styles
├── public/             # Static assets
├── .github/
│   ├── workflows/      # GitHub Actions
│   └── copilot-instructions.md
├── vite.config.ts      # Vite configuration
├── tailwind.config.js  # Tailwind configuration
├── tsconfig.json       # TypeScript configuration
├── README.md           # Documentation
└── CONTRIBUTING.md     # This file
```

## Common Issues

### Dependencies Not Installing
```bash
# Use pnpm instead of npm
pnpm install

# If issues persist
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Build Errors
- Clear the dist folder: `rm -rf dist`
- Check TypeScript: `pnpm run lint`
- Rebuild: `pnpm run build`

### Dev Server Issues
- Kill existing processes on port 5173
- Clear Vite cache: `rm -rf .vite`
- Restart: `pnpm run dev`

## Documentation

### Updating README.md
- Keep the feature list current
- Update setup instructions if changed
- Add examples for new features
- Keep the table of contents synchronized

### Code Comments
- Explain the "why", not the "what"
- Use clear, concise language
- Keep comments up-to-date with code
- Use TypeScript types instead of type comments

## Commit Messages

Use clear, descriptive commit messages:

```
# Good
- "Add support for reference fields in Dart generation"
- "Fix null-safety handling for optional fields"
- "Improve collection editor UI responsiveness"

# Avoid
- "fix bug"
- "update code"
- "WIP"
```

## Performance Considerations

- Minimize re-renders with `useMemo`
- Lazy load Monaco Editor properly
- Keep localStorage keys consistent
- Optimize bundle size with code splitting

## Security

- Don't store sensitive data in localStorage
- Validate user input in field names
- Sanitize exported file content
- Keep dependencies up-to-date

## Questions?

- Check existing issues and discussions
- Open a new issue with the question label
- Reach out in pull request discussions

## Recognition

Contributors will be:
- Mentioned in release notes for their contributions
- Added to the contributors list (if desired)
- Our thanks and appreciation!

---

Thank you for contributing to DartStore! 🎉
