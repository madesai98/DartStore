# DartStore - Quick Reference Guide

## 🚀 Quick Start (5 minutes)

### Step 1: Start the App
```bash
cd DartStore
pnpm install
pnpm run dev
```
Visit: http://localhost:5173/DartStore/

### Step 2: Create Project
Click "Create New Project" → Enter name → Done

### Step 3: Add Collection
Click "+" in sidebar → Enter name → Create

### Step 4: Add Fields
Click "Add Field" → Configure → Add Field

### Step 5: Export Code
Click "Export .dart" → Use in Flutter

---

## 📚 Field Types Quick Reference

| Type | Dart | Example |
|------|------|---------|
| string | String | "hello" |
| number | double | 42.5 |
| boolean | bool | true |
| timestamp | DateTime | now() |
| geopoint | GeoPoint | (lat, lng) |
| reference | DocumentReference | db.doc() |
| array | List<T> | [1, 2, 3] |
| map | Map<String, T> | {key: value} |

---

## 🎯 Common Workflows

### Create a Users Collection
```
Name: users
Fields:
  - id (string, required, not nullable)
  - name (string, required, not nullable)
  - email (string, optional, nullable)
  - profile (map of string, optional)
  - createdAt (timestamp, required)
```

### Create a Products Collection
```
Name: products
Fields:
  - id (string, required)
  - name (string, required)
  - price (number, required)
  - tags (array of string, optional)
  - metadata (map of dynamic, optional)
```

### Create a Posts Collection
```
Name: posts
Fields:
  - id (string, required)
  - title (string, required)
  - content (string, optional)
  - authorId (reference, required)
  - likes (number, required)
  - createdAt (timestamp, required)
  - updatedAt (timestamp, optional)
```

---

## 💻 Development Commands

```bash
# Development
pnpm run dev              # Start dev server
pnpm run build            # Build for production
pnpm run preview          # Preview production

# Maintenance
pnpm install              # Install/update dependencies
pnpm run lint             # Type checking
```

---

## 📂 Project Structure Quick View

```
src/
├── components/        # UI components
├── types/            # TypeScript types
├── utils/            # Helper functions
├── App.tsx           # Main component
├── main.tsx          # Entry point
└── index.css         # Styles
```

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `dartGenerator.ts` | Dart code generation |
| `storage.ts` | Save/load/export data |
| `App.tsx` | Main state management |
| `CollectionEditor.tsx` | Edit collections |
| `CodePreview.tsx` | Show generated code |

---

## 🎨 Customization

### Change Colors
Edit `tailwind.config.js`:
```js
colors: {
  primary: '#your-color-here'
}
```

### Change Base URL
Edit `vite.config.ts`:
```ts
base: '/your-path/'
```

### Add Field Types
Edit `dartGenerator.ts` `firestoreToDartType()` function

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| App won't load | Check localStorage enabled |
| Project missing | Export/import JSON file |
| Build fails | Delete dist/, run build again |
| Dev port busy | Kill process on 5173 |
| Types error | Run `pnpm run lint` |

---

## 📱 Browser Support

✅ Chrome/Chromium (latest)
✅ Firefox (latest)
✅ Safari (latest)
✅ Edge (latest)
❌ IE11 (not supported)

---

## 🚢 Deployment Checklist

- [ ] Update `vite.config.ts` base URL
- [ ] Update `package.json` homepage
- [ ] Commit all changes
- [ ] Push to GitHub main branch
- [ ] Check Actions tab for deployment
- [ ] Visit your GitHub Pages URL

---

## 📖 Documentation Files

| File | Contains |
|------|----------|
| README.md | Full documentation |
| QUICKSTART.md | Step-by-step guide |
| CONTRIBUTING.md | Development guidelines |
| PROJECT_SUMMARY.md | Architecture overview |
| IMPLEMENTATION_COMPLETE.md | Completion details |

---

## 🆘 Need Help?

1. **Getting Started?** → Read QUICKSTART.md
2. **Want to Develop?** → Read CONTRIBUTING.md
3. **Need Architecture?** → Read PROJECT_SUMMARY.md
4. **Full Details?** → Read README.md

---

## ⚡ Performance Tips

- Projects auto-save every 1 second
- Code generation is real-time
- Monaco Editor is lazy loaded
- Use export/import for backups

---

## 🔐 Security Notes

✅ All data stays in your browser
✅ No server communication
✅ No authentication needed
✅ No external API calls
✅ Safe to use locally or on GitHub Pages

---

## 🎓 Learn More

- **Dart**: https://dart.dev
- **Flutter**: https://flutter.dev
- **React**: https://react.dev
- **TypeScript**: https://typescriptlang.org
- **Tailwind**: https://tailwindcss.com

---

## 💡 Pro Tips

1. **Use descriptive names** - Collection: `users`, Field: `firstName`
2. **Always document fields** - Add descriptions for team clarity
3. **Set required properly** - Mark required fields for better contracts
4. **Export regularly** - Save projects as JSON backups
5. **Test code generation** - Verify with various field types

---

## 🎉 You're Ready!

Start modeling your Firestore database today! 🚀

---

**DartStore** - Firestore Database Modeler for Flutter
Made with ❤️ for the Flutter community
