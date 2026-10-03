## Improved

- An open map uses much less graphics memory: 3D dice share one drawing context per window, and with dynamic lighting on the map no longer keeps antialiasing buffers it does not draw into

## Fixed

- Reloading Atlas no longer leaves the previous 3D dice in graphics memory
- Loading a scene with explored areas no longer keeps a copy of them in graphics memory
