# @agot/card-preview

A React component library for rendering **A Game of Thrones LCG 2nd Edition** cards. It requires data in an `IRenderCard` format.

## 📦 Installation

```bash
npm install @agot/card-preview
```

### Peer Dependencies

Ensure your host project has the following installed:

- **react** (^19.1.0)

---

## 🛠 Usage

Import the `CardPreview` component and provide an `IRenderCard` to display the corresponding card image and data.

```tsx
import { CardPreview } from '@agot/card-preview';

const App = () => {
  return (
    <CardPreview
      card={{ ... }}
    />
  );
};
```
