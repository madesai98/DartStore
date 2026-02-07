# Default Values Feature - Implementation Guide

## Overview
The Default Values feature allows developers to specify contextual default values for Firestore fields. These defaults are automatically included in the generated Dart constructors, enabling type-safe, sensible defaults for model instantiation.

## Features

### Contextual Presets by Field Type

Each Firestore field type has a set of intelligent presets tailored to common use cases:

#### String Fields
- **No Default** - No default value assigned
- **Empty String** - Default to `''`
- **Generated UUID** - Auto-generate unique IDs with `const Uuid().v4()`
- **Custom Value** - Manually specify any string value

#### Number Fields
- **No Default** - No default value assigned
- **Zero** - Default to `0`
- **Random** - Generate random decimal 0.0-1.0 with `Random().nextDouble()`
- **Custom Value** - Manually specify any numeric value

#### Boolean Fields
- **No Default** - No default value assigned
- **True** - Default to `true`
- **False** - Default to `false`
- **Custom Value** - Manually specify boolean value

#### Timestamp Fields
- **No Default** - No default value assigned
- **Current Time** - Set to `DateTime.now()` at instantiation
- **Created At** - Auto-filled when document is created (Firestore server-side)
- **Updated At** - Auto-updated when document changes (Firestore server-side)
- **Custom Value** - Manually specify timestamp logic

#### Array Fields
- **No Default** - No default value assigned
- **Empty Array** - Default to `[]`
- **Custom Value** - Manually specify array content

#### Map Fields
- **No Default** - No default value assigned
- **Empty Map** - Default to `{}`
- **Custom Value** - Manually specify map content

#### GeoPoint Fields
- **No Default** - No default value assigned
- **Zero Point** - Default to `const GeoPoint(0, 0)`
- **Custom Value** - Manually specify coordinates

#### Reference Fields
- **No Default** - No default value assigned
- **Null** - Default to `null`
- **Custom Value** - Manually specify reference path

## Usage

### Creating Fields with Defaults
When adding a new field:
1. Fill in the field name and select the field type
2. The "Default Value" dropdown will populate with presets for that type
3. Select a preset or choose "Custom Value" to specify your own
4. If custom, enter the default value in the text field that appears

### Editing Field Defaults
Click the edit button on any field to modify its default preset or custom value. Changes apply immediately to the generated Dart code.

### Generated Dart Code
Default values are automatically included in constructors:

```dart
// Field with UUID default
User({
  required this.id = const Uuid().v4(),
  this.email = '',
  this.createdAt = DateTime.now(),
  required this.active = true,
});
```

Notice that fields with defaults are automatically made optional (no `required` keyword) unless they're explicitly marked as required.

## Type Definitions

### FirestoreField Interface
```typescript
interface FirestoreField {
  id: string;
  name: string;
  type: FirestoreFieldType;
  isRequired: boolean;
  isNullable: boolean;
  description?: string;
  defaultPreset?: DefaultValuePreset;  // New field
  defaultValue?: string;                 // New field (for custom values)
  arrayItemType?: FirestoreFieldType;
  mapValueType?: FirestoreFieldType;
}
```

### DefaultValuePreset Type
```typescript
type DefaultValuePreset = 
  | 'none'
  | 'string-empty'
  | 'string-uuid'
  | 'number-zero'
  | 'number-random'
  | 'boolean-true'
  | 'boolean-false'
  | 'timestamp-now'
  | 'timestamp-created'
  | 'timestamp-updated'
  | 'array-empty'
  | 'map-empty'
  | 'geopoint-zero'
  | 'reference-null'
  | 'custom';
```

## Code Generation

### Helper Functions
The dartGenerator.ts utility provides:

#### `getDefaultValueForPreset(preset: string, fieldType: FirestoreFieldType): string`
Maps preset names to their Dart code representations:
- `'string-uuid'` → `"const Uuid().v4()"`
- `'timestamp-now'` → `"DateTime.now()"`
- `'number-random'` → `"Random().nextDouble()"`
- etc.

#### `getDefaultValueComment(preset: string): string`
Returns human-readable descriptions for tooltips and documentation.

#### `getAvailablePresetsForType(fieldType: FirestoreFieldType): DefaultPresetOption[]`
Returns the array of valid presets for a given field type, with labels and descriptions for UI display.

### Constructor Generation
The `generateConstructor()` function checks for fields with defaults and:
1. Gets the Dart default value using `getDefaultValueForPreset()`
2. Appends it to parameters with `= value` syntax
3. Removes the `required` keyword for defaulted parameters

## Import Requirements

Some presets require imports in the generated Dart code:
- **UUID presets** - Requires `uuid` package
- **Random presets** - Uses Dart's built-in `dart:math` (standard)
- **GeoPoint** - Uses Firestore's `cloud_firestore` package
- **DateTime** - Uses Dart's built-in `dart:core` (standard)

> Note: The app doesn't yet automatically add import statements for packages like `uuid`. You'll need to add them manually to your Dart project, or we can enhance the generator to include them automatically.

## LocalStorage Persistence
Default presets and custom values are stored in localStorage along with the rest of the project data:
```json
{
  "fields": [
    {
      "id": "f1",
      "name": "id",
      "type": "string",
      "defaultPreset": "string-uuid"
    }
  ]
}
```

## Examples

### User Model
```typescript
// Field: id (string) - Default: Generated UUID
// Field: email (string) - Default: No Default
// Field: createdAt (timestamp) - Default: Created At
// Field: active (boolean) - Default: True
// Field: tags (array of string) - Default: Empty Array
```

Generated Dart:
```dart
class User {
  final String id;
  final String email;
  final DateTime createdAt;
  final bool active;
  final List<String> tags;

  User({
    required this.id = const Uuid().v4(),
    required this.email,
    this.createdAt = DateTime.now(),
    this.active = true,
    this.tags = const [],
  });
}
```

### Blog Post Model
```typescript
// Field: id (string) - Default: Generated UUID
// Field: title (string) - Default: No Default
// Field: content (string) - Default: Empty String
// Field: published (boolean) - Default: False
// Field: views (number) - Default: Zero
// Field: publishedAt (timestamp) - Default: Current Time
```

Generated Dart:
```dart
class BlogPost {
  final String id;
  final String title;
  final String content;
  final bool published;
  final int views;
  final DateTime publishedAt;

  BlogPost({
    required this.id = const Uuid().v4(),
    required this.title,
    this.content = '',
    this.published = false,
    this.views = 0,
    this.publishedAt = DateTime.now(),
  });
}
```

## Future Enhancements

1. **Auto-import injection** - Automatically add required imports for UUID, Random, etc.
2. **Server-side defaults** - Better documentation for server-side presets like "created at" and "updated at"
3. **Validation** - Validate custom default values against field type
4. **Shortcuts** - Keyboard shortcuts for common defaults (e.g., Ctrl+U for UUID)
5. **Templates** - Pre-built collections with sensible defaults (User, BlogPost, etc.)

## Component Updates

### CollectionEditor.tsx
- `NewFieldForm` - Added default preset selection dropdown
- `FieldRow` - Shows current default preset in field summary
- Edit mode - Allows modifying default presets for existing fields

### dartGenerator.ts
- `getAvailablePresetsForType()` - New function returning UI-ready preset options
- `getDefaultValueForPreset()` - Existing function (now used for generation)
- `getDefaultValueComment()` - Existing function (for documentation)
- `generateConstructor()` - Updated to include default values

### types/index.ts
- `FirestoreField` interface - Added `defaultPreset` and `defaultValue` fields
- `DefaultValuePreset` - Type union of all 15 valid preset values

## File Changes
- `src/components/CollectionEditor.tsx` - UI integration
- `src/utils/dartGenerator.ts` - Generation logic and preset utilities
- `src/types/index.ts` - Type definitions
