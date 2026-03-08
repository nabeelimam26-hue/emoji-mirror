# Quick Start: Adding New 3D Models

## 3-Step Process

### **Step 1: Place Model File**
```
public/models/
├── trainengine.glb
├── ImageToStl.com_trphystar.glb
└── your_awesome_model.glb          ← PUT YOUR FILE HERE
```

### **Step 2: Register in App.jsx**
Open `src/App.jsx` and find line ~227:

```javascript
const AVAILABLE_MODELS = [
  { path: "/models/trainengine.glb", label: "🚂 Train Engine", name: "trainengine" },
  { path: "/models/ImageToStl.com_trphystar.glb", label: "⭐ Trophy Star", name: "trophy" },
  // ↓ ADD YOUR MODEL HERE ↓
  { path: "/models/your_awesome_model.glb", label: "🎨 Your Model Name", name: "yourmodel" },
];
```

**What each field means:**
- `path`: Exact file path (must match file name exactly)
- `label`: Display name with emoji (shows in UI)
- `name`: Internal identifier (no spaces, lowercase)

### **Step 3: Test**
1. Save App.jsx
2. Enable 3D mode (click "ENABLE 3D LAYER")
3. Your model appears in the selector!

---

## Example Models to Add

### Example 1: Astronaut
```javascript
{ path: "/models/astronaut.glb", label: "👨‍🚀 Astronaut", name: "astronaut" },
```

### Example 2: Dragon
```javascript
{ path: "/models/dragon.glb", label: "🐉 Dragon", name: "dragon" },
```

### Example 3: Cube
```javascript
{ path: "/models/cube.glb", label: "🎲 Cube", name: "cube" },
```

### Example 4: Sphere
```javascript
{ path: "/models/sphere.glb", label: "🔵 Sphere", name: "sphere" },
```

---

## Where to Find Free Models

### **High Quality Free 3D Models:**
- **Sketchfab** - https://sketchfab.com (filter: downloadable)
- **TurboSquid Free** - https://www.turbosquid.com/Search/3D-Models/free
- **CGTrader Free** - https://www.cgtrader.com/free-3d-models
- **Poly Haven** - https://polyhaven.com/models
- **Free3D** - https://free3d.com

### **How to Download:**
1. Find a GLB/GLTF model
2. Download as GLB format
3. Place in `public/models/`
4. Register in AVAILABLE_MODELS

---

## Converting Other Formats to GLB

If you have models in **.OBJ**, **.FBX**, **.DAE**, etc., convert using:

### **Method 1: Blender (Free)**
1. Open Blender
2. File → Import → Select your file
3. File → Export → Glitch Format → `.glb`
4. Save to `public/models/`

### **Method 2: Online Converter**
- https://anyconv.com/converters/to/glb/
- https://modelconverter.com/
- Upload file → Download as GLB

### **Method 3: glTF Transform (Command Line)**
```bash
npx gltf-transform convert input.fbx output.glb
```

---

## File Size Tips

Keep models **under 5MB** for best performance:

| Size | Performance | Recommended |
|------|-------------|------------|
| < 1MB | Excellent | ✅ Best |
| 1-3MB | Good | ✅ Good |
| 3-5MB | Fair | ⚠️ OK |
| > 5MB | Slow | ❌ Avoid |

### **How to Compress:**
1. **Reduce polygons** in 3D editor (target 10k-50k triangles)
2. **Use Draco compression** in Blender:
   - Export settings → Enable Draco
3. **Use online tools:**
   - gltf-transform cli
   - Model-viewer compression

---

## Complete Example: Adding 3 Models

### **Current AVAILABLE_MODELS:**
```javascript
const AVAILABLE_MODELS = [
  { path: "/models/trainengine.glb", label: "🚂 Train Engine", name: "trainengine" },
  { path: "/models/ImageToStl.com_trphystar.glb", label: "⭐ Trophy Star", name: "trophy" },
];
```

### **After Adding 3 Models:**
```javascript
const AVAILABLE_MODELS = [
  { path: "/models/trainengine.glb", label: "🚂 Train Engine", name: "trainengine" },
  { path: "/models/ImageToStl.com_trphystar.glb", label: "⭐ Trophy Star", name: "trophy" },
  { path: "/models/astronaut.glb", label: "👨‍🚀 Astronaut", name: "astronaut" },
  { path: "/models/dragon.glb", label: "🐉 Dragon", name: "dragon" },
  { path: "/models/pyramid.glb", label: "🔺 Pyramid", name: "pyramid" },
];
```

### **Result in UI:**
```
▸ SELECT 3D MODEL
[🚂 Train Engine] [⭐ Trophy Star] [👨‍🚀 Astronaut]
[🐉 Dragon] [🔺 Pyramid]
```

---

## Feature Verification

After adding a model, verify:

- ✅ File exists: `public/models/yourfile.glb`
- ✅ Path correct in code: `/models/yourfile.glb`
- ✅ No typos in path
- ✅ Model name unique: no duplicates in `name` field
- ✅ Emoji works in label
- ✅ Save App.jsx

Test by:
1. Enable 3D mode
2. Click your new model
3. Should load with neon material
4. Try gestures: ✊ rotate, 👌 scale, ☝️ paint

---

## Troubleshooting

### Model Doesn't Appear
**Check:**
- File exists in public/models/ folder
- Path in code matches filename exactly
- Browser console for error message
- Try a different model first

### Model Too Small/Large
**Auto-scaling should handle it, but if not:**
- The system targets fitting model in ~2 unit sphere
- Check if original model scale is extreme in 3D editor

### Slow Performance
**If model lags:**
- File too large (reduce polygons in Blender)
- Enable Draco compression
- Test with smaller model first

### Model Looks Wrong
**Try:**
- Check if model needs specific materials/textures
- Test model in Three.js viewer first: https://gltf-viewer.donmccurdy.com/

---

## One-Liner Reference

**Add model fast:**
```javascript
// In AVAILABLE_MODELS array, add:
{ path: "/models/NAME.glb", label: "EMOJI Name", name: "name" },
```

Where:
- **NAME** = filename (must exist)
- **EMOJI** = pick relevant emoji
- **Name** = lowercase, no spaces

---

## Advanced: Dynamic Model Loading

Want to load models dynamically? See [MODEL_COMPATIBILITY_GUIDE.md](MODEL_COMPATIBILITY_GUIDE.md) for advanced features like:
- Model upload/drag-drop
- Runtime model discovery
- Model preview
- Custom material application

---

**That's it! Your models are ready to use!** 🎉
