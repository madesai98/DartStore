# DartStore Quick Start Guide

Welcome to DartStore! This guide will get you up and running in minutes.

## 1. Launch the App

Visit: **https://yourusername.github.io/DartStore/**

Or run locally:
```bash
git clone https://github.com/yourusername/DartStore.git
cd DartStore
pnpm install
pnpm run dev
```

Then open: **http://localhost:5173/DartStore/**

## 2. Create Your First Project

1. Click **"Create New Project"**
2. Enter project name (e.g., "My App Database")
3. Add an optional description
4. Click **"Create Project"**

## 3. Add a Collection

1. In the left sidebar, click the **"+" button** next to "Collections"
2. Enter collection name (e.g., "users")
3. Add optional description
4. Click **"Create"**

## 4. Add Fields to Your Collection

### Simple Example: Users Collection

1. Click **"Add Field"** button
2. **Field 1: User ID**
   - Name: `id`
   - Type: `string`
   - Required: ✓
   - Nullable: ✗
   - Description: "Unique user identifier"

3. Click **"Add Field"** again
4. **Field 2: Name**
   - Name: `name`
   - Type: `string`
   - Required: ✓
   - Nullable: ✗
   - Description: "User's full name"

5. **Field 3: Email**
   - Name: `email`
   - Type: `string`
   - Required: ✗
   - Nullable: ✓
   - Description: "User's email address"

6. **Field 4: Created At**
   - Name: `createdAt`
   - Type: `timestamp`
   - Required: ✓
   - Nullable: ✗

7. **Field 5: Metadata**
   - Name: `metadata`
   - Type: `map`
   - Map Value Type: `string`
   - Required: ✗
   - Nullable: ✓

## 5. View Generated Dart Code

Click **"View Code"** button in the header to see the generated Dart classes.

The code includes:
- Type-safe class definition
- Factory constructor for Firestore deserialization
- `toFirestore()` method for serialization
- `copyWith()` for immutable updates

## 6. Export Your Work

### Option A: Export as JSON
- Click **"Export"** to save your project model
- File: `my_project.json`
- Use for: Backup, version control, sharing with team

### Option B: Export as Dart
- Click **"Export .dart"** to save generated code
- File: `my_app_database.dart`
- Use for: Add directly to Flutter project

## 7. Use in Flutter

1. Add to `pubspec.yaml`:
```yaml
dependencies:
  cloud_firestore: ^4.13.0
  firebase_core: ^24.0.0
```

2. Add the generated Dart file to your Flutter project
3. Use in your code:

```dart
// Import the generated file
import 'my_app_database.dart';

// Fetch user from Firestore
final doc = await FirebaseFirestore.instance
    .collection('users')
    .doc('user123')
    .get();

final user = User.fromFirestore(doc);

// Create a new user
final newUser = User(
  id: 'user456',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: DateTime.now(),
  metadata: {'lastLogin': '2024-02-06'},
);

// Save to Firestore
await FirebaseFirestore.instance
    .collection('users')
    .doc(newUser.id)
    .set(newUser.toFirestore());

// Update with copyWith
final updatedUser = user.copyWith(
  email: 'newemail@example.com',
);
```

## Field Type Reference

| Firestore Type | Dart Type | Example |
|---|---|---|
| string | String | "Hello World" |
| number | double | 42.5 |
| boolean | bool | true |
| timestamp | DateTime | DateTime.now() |
| geopoint | GeoPoint | GeoPoint(latitude, longitude) |
| reference | DocumentReference | db.collection('users').doc('123') |
| array | List<T> | ['item1', 'item2'] |
| map | Map<String, T> | {'key': 'value'} |
| null | dynamic | null |

## Tips & Tricks

### 🎯 Best Practices

1. **Use consistent naming**
   - Collections: lowercase, plural (`users`, `products`)
   - Fields: camelCase (`firstName`, `createdAt`)

2. **Always mark required fields**
   - Users can't forget required data
   - Better Dart class contracts

3. **Use proper types**
   - `number` for decimals: `2.99`
   - Avoid `string` for numbers: `"42"`
   - Use `timestamp` for dates, not strings

4. **Document your fields**
   - Add descriptions explaining field purpose
   - Helps team members understand data structure
   - Appears in generated Dart code

5. **Leverage nullable fields**
   - Optional user preferences: `nullable: true`
   - New features you might add later
   - Avoid null check hell with smart typing

### 📱 Mobile Optimization

- Works on phones, tablets, desktops
- Auto-saves to browser storage
- Works offline (as long as you don't refresh)
- Fast load times with optimized bundle

### 💾 Data Management

- **Auto-save**: Projects save automatically every 1 second
- **No cloud sync**: Everything stays in your browser
- **Privacy**: No server access to your data
- **Backups**: Export projects regularly

## Common Tasks

### Import a Previous Project
1. Click **"Import"** in the header
2. Select your saved `.json` file
3. Project loads with all collections and fields

### Edit Existing Fields
1. Hover over field in collection editor
2. Click the **edit icon** (pencil)
3. Modify properties
4. Click **"Save"**

### Delete Items
1. Hover over field or collection
2. Click **trash icon**
3. Confirm deletion

### Switch Between Collections
1. Click collection name in sidebar
2. Fields for that collection appear
3. Edit independently

## Troubleshooting

### "Can't see my project after refresh"
- Check browser's localStorage is enabled
- Try exporting the project and reimporting

### "Dart code looks wrong"
- Verify field types are correct
- Check field names don't have spaces
- Ensure required/nullable settings match intent

### "Export buttons not working"
- Check browser allows downloads
- Try a different browser
- Check disk space

## Next Steps

1. ✅ Create your database model
2. ✅ Export as Dart code
3. ✅ Add to your Flutter project
4. ✅ Connect to Firestore
5. ✅ Use the generated classes!

## Need Help?

- 📖 Read the [README.md](README.md)
- 🐛 Report issues on [GitHub](https://github.com/yourusername/DartStore/issues)
- 💬 Join the discussion
- 🤝 Contribute improvements

---

Happy modeling! 🚀
