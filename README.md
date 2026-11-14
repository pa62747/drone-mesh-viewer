# Drone Mesh Viewer

Web viewer for a Drone2Map 3D mesh (I3S integrated mesh), served without ArcGIS Online.

- `data/` – the extracted `Mesh.slpk` (I3S 1.9, UTM 36N / EPSG:32636)
- `server.js` – dependency-free Node server exposing the data as an I3S `SceneServer`
- `public/index.html` – viewer built with ArcGIS Maps SDK for JavaScript (local scene, no basemap)

## Run locally
```
npm start            # http://localhost:3000
npm test             # validates every node resource against a running server
```

## Replace the mesh
Delete `data/`, extract a new `.slpk` into it (it is a plain zip), commit and push.

## Deploy
Render picks up `render.yaml` (Node web service, free plan).

## Viewer features
- Mask: only the part of the mesh inside `public/mask.json` (the `Mask` polygon from the Drone2Map project GDB) is shown; toggle in the panel
- Satellite: Esri World Imagery, reprojected in the browser to UTM 36N tiles (the scene is local in the mesh CRS)
- 3D tools: distance, area, elevation profile, line of sight, slice, 3D swipe (vertical slice plane on a slider), daylight with shadows, shadow cast (hours in shade), coordinates with real heights, eye-level walk mode
- Terrain: free global DEM (AWS Terrain Tiles, Mapzen Terrarium, SRTM-based, metres above sea level) re-tiled into UTM in the browser by a custom `BaseElevationLayer`. Near the mesh it is refined by `public/ground.json`: a 1 m bare-earth grid built from the Drone2Map solution points (per-cell minimum, outlier removal, 31 m morphological opening, smoothing). While the mask is on, the drone ground is limited to the mask area; it is capped at DEM + 3 m. The mesh is shown at its true heights.
- Measured fit, DEM minus drone ground over 870 points: mean +0.4 m, median +1.3 m, std 3.8 m
- Walk mode keeps the eye above the same terrain. No wall collision.

## Tests
```
npm test                                   # every I3S resource
node test/browser.js http://localhost:3000/ <outDir>   # headless Edge: opens all tools, screenshots, console errors
```
