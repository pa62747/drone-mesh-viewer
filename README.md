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
