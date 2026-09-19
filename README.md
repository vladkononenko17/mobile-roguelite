# Neon Hollow

A mobile-first action roguelite that runs directly in the browser. Move with a virtual joystick while your weapon automatically targets the nearest enemy. Collect energy, level up, choose evolutions, survive escalating waves, and defeat a boss every fifth wave.

## Current prototype

- Touch joystick and keyboard controls
- Auto-targeting projectile combat
- Three regular enemy archetypes and bosses
- XP pickups and randomized level-up choices
- Eight stackable upgrades
- Infinite waves with progressive difficulty
- Pause, game over, restart, and run statistics
- Installable PWA with offline caching
- Automatic GitHub Pages deployment

## Controls

- **Mobile:** drag anywhere on the left side of the arena
- **Desktop:** WASD or arrow keys
- **Pause:** the button in the top-right corner, `P`, or `Escape`

## Run locally

No build step or dependencies are required.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Roadmap

The first release focuses on the combat loop. Next steps are weapon variety, permanent progression, handcrafted encounters, sound, haptics, and an original sprite set.
