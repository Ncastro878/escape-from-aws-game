# 🎮 Escape From AWS

A retro-style first-person shooter built with Three.js. Fight zombies, dodge a rampaging Cybertruck, and survive the chaos of an AWS server room gone wrong.

![Three.js](https://img.shields.io/badge/Three.js-000000?style=flat&logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## 🕹️ Gameplay

- **Doom-style FPS** with retro aesthetics
- **Zombie enemies** that chase and attack
- **Flying boss encounters**
- **NPC dialog system** - talk to characters with `E`
- **Health packs** scattered throughout the level
- **Dynamic music** - menu and gameplay tracks
- **Mobile support** with touch controls

## 🎯 Controls

### Desktop
| Key | Action |
|-----|--------|
| `W A S D` | Move |
| `Mouse` | Look around |
| `Left Click` | Shoot |
| `E` | Talk to NPCs |
| `Space` | Jump |

### Mobile
- **Left joystick** - Move
- **Swipe right side** - Look around
- **🔴 Button** - Shoot
- **◀ ▶ Buttons** - Turn

## 🚀 Getting Started

### Prerequisites
- Node.js 18+

### Installation

```bash
# Clone the repo
git clone https://github.com/Ncastro878/escape-from-aws-game.git
cd escape-from-aws-game

# Install dependencies
npm install

# Start dev server
npm run dev
```

The game will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## 🏗️ Tech Stack

- **[Three.js](https://threejs.org/)** - 3D graphics and rendering
- **[Vite](https://vitejs.dev/)** - Fast build tool and dev server
- **PointerLockControls** - First-person camera controls
- **Custom sprite system** - Doom-style weapon rendering

## 📁 Project Structure

```
fps-game/
├── public/           # Static assets (textures, audio, sprites)
│   ├── models/       # 3D model textures
│   ├── *.png         # Sprites and UI images
│   └── *.mp3         # Sound effects and music
├── src/
│   └── main.js       # Game logic (~2000 lines)
├── index.html        # Entry point with UI/controls
└── vite.config.js    # Vite configuration
```

## 🎨 Features

- **Retro fog effects** for atmosphere
- **Textured environments** - floor, ceiling, walls
- **Animated weapon sprites** - idle and firing states
- **Damage/heal visual feedback** - screen flash effects
- **Low health warning** - pulsing red border
- **Sound effects** - gunshots, enemy sounds, pickups

## 📜 License

ISC

---

*Built with ☕ and Three.js*
