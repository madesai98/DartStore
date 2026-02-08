# DartStore - Firestore Database Modeler

[![Deploy to GitHub Pages](https://github.com/madesai98/DartStore/actions/workflows/deploy.yml/badge.svg)](https://github.com/madesai98/DartStore/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A modern, performant web application for modeling Firestore databases and generating type-safe Dart code for Flutter applications in real-time.

## ✨ Features

- **Visual Database Modeling** - Intuitive UI for designing Firestore collections and fields
- **Real-time Code Generation** - Instant Dart code generation as you model
- **Type Safety** - Full support for all Firestore data types with proper Dart mappings
- **Local Storage** - All projects auto-save to browser storage
- **Import/Export** - Export your project as JSON or Dart code files
- **Modern UI** - Clean, responsive interface built with Tailwind CSS
- **Monaco Editor** - Professional code preview with syntax highlighting
- **Zero Dependencies** - Runs entirely in the browser, no backend needed
- **GitHub Pages Ready** - Static site optimized for easy deployment

## 🚀 Getting Started

### Online Version

Visit the live app: [https://madesai98.github.io/DartStore/](https://madesai98.github.io/DartStore/)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/madesai98/DartStore.git
   cd DartStore
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

5. **Preview production build**
   ```bash
   npm run preview
   ```

## 📖 Usage

### Creating a Project

1. Click "Create New Project" on the welcome screen
2. Enter your project name and optional description
3. Start adding collections and fields

### Adding Collections

1. Click the "+" button in the sidebar
2. Enter collection name and description
3. Click "Create" to add the collection

### Adding Fields

1. Select a collection from the sidebar
2. Click "Add Field" button
3. Configure field properties:
   - **Name** - Field identifier
   - **Type** - Firestore data type (string, number, boolean, etc.)
   - **Required** - Whether the field must have a value
   - **Nullable** - Whether the field can be null
   - **Description** - Optional field documentation

### Supported Field Types

- `string` → `String`
- `number` → `double`
- `boolean` → `bool`
- `timestamp` → `DateTime`
- `geopoint` → `GeoPoint`
- `reference` → `DocumentReference`
- `array` → `List<T>`
- `map` → `Map<String, dynamic>`
- `null` → `dynamic`

### Viewing Generated Code

1. Click "View Code" in the header
2. Review the generated Dart code
3. Copy to clipboard or download as `.dart` file

### Export/Import Projects

- **Export Project**: Save your model as a `.json` file
- **Export Dart Code**: Download the generated `.dart` file
- **Import Project**: Load a previously exported project

## 📦 Generated Code Features

The Dart code generator creates:

- **Model Classes** - Type-safe Dart classes for each collection
- **fromFirestore** - Factory constructor for deserializing Firestore documents
- **toFirestore** - Method for serializing to Firestore
- **copyWith** - Immutable update pattern support
- **Null Safety** - Full null-safety support
- **Documentation** - Inline comments from your descriptions

### Example Generated Code

```dart
/// Model for users collection
class User {
  /// User's unique identifier
  final String id;
  
  /// User's display name
  final String name;
  
  /// User's email address
  final String? email;
  
  /// Account creation timestamp
  final DateTime createdAt;

  User({
    required this.id,
    required this.name,
    this.email,
    required this.createdAt,
  });

  /// Create User from Firestore document
  factory User.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
    SnapshotOptions? options,
  ) {
    final data = snapshot.data();
    return User(
      id: data?['id'] as String,
      name: data?['name'] as String,
      email: data?['email'] as String?,
      createdAt: (data?['createdAt'] as Timestamp).toDate(),
    );
  }

  /// Convert to Firestore document
  Map<String, dynamic> toFirestore() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'createdAt': createdAt,
    };
  }

  /// Create a copy with optional new values
  User copyWith({
    String? id,
    String? name,
    String? email,
    DateTime? createdAt,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
```

## 🚀 Deployment

### GitHub Pages

1. **Update `vite.config.ts`** with your repository name:
   ```typescript
   base: '/YourRepoName/'
   ```

2. **Enable GitHub Pages** in repository settings:
   - Go to Settings → Pages
   - Source: GitHub Actions

3. **Push to main branch** - Automatic deployment via GitHub Actions

### Other Platforms

The app can be deployed to any static hosting service:
- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

Just run `npm run build` and deploy the `dist` folder.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Icons from [Lucide](https://lucide.dev/)
- Code editor powered by [Monaco Editor](https://microsoft.github.io/monaco-editor/)

## 📧 Contact

Project Link: [https://github.com/madesai98/DartStore](https://github.com/madesai98/DartStore)